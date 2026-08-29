/* ПОБУБНИМ — 3D-LUT (.cube) для приборов: разбор файла, интерполяция, применение
   к кадру, пересемплирование и выгрузка.

   КАНОН: docs/SCOPES_BASE.md §8 (формат Adobe Cube LUT 1.0, порядок узлов —
   быстрее всех меняется красный; трилинейная и тетраэдральная интерполяции).
   Обе интерполяции — построчный порт эталона из tools/verify_scopes.py §7,
   где они проверены на единичном, сепарабельном и кросс-канальном LUT.
   Приёмка сверяет JS с тем же питоном (tools/test_pribory.py). */
(function () {
  "use strict";

  var MAX_SIZE = 129;   /* Resolve пишет 17/33/65; выше — почти всегда битый файл */

  /* ---------------- разбор .cube ---------------- */

  function nums(line, count, fallback) {
    var p = line.trim().split(/\s+/).slice(1).map(parseFloat);
    for (var i = 0; i < count; i++) if (!isFinite(p[i])) return fallback;
    return p.slice(0, count);
  }

  function parseCube(text) {
    var size = 0, size1d = 0, title = "";
    var dmin = [0, 0, 0], dmax = [1, 1, 1];
    var data = null, at = 0;
    var lines = String(text).split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === "#") continue;
      var up = line.toUpperCase();

      if (up.indexOf("TITLE") === 0) {
        var q = line.match(/"([^"]*)"/);
        title = q ? q[1] : line.slice(5).trim();
        continue;
      }
      if (up.indexOf("LUT_3D_SIZE") === 0) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
      if (up.indexOf("LUT_1D_SIZE") === 0) { size1d = parseInt(line.split(/\s+/)[1], 10); continue; }
      if (up.indexOf("DOMAIN_MIN") === 0) { dmin = nums(line, 3, dmin); continue; }
      if (up.indexOf("DOMAIN_MAX") === 0) { dmax = nums(line, 3, dmax); continue; }
      if (up.indexOf("LUT_3D_INPUT_RANGE") === 0 || up.indexOf("LUT_1D_INPUT_RANGE") === 0) {
        var r = nums(line, 2, null);
        if (r) { dmin = [r[0], r[0], r[0]]; dmax = [r[1], r[1], r[1]]; }
        continue;
      }
      if (/^[-+0-9.]/.test(line)) {
        if (!data) {
          var n = size || size1d;
          if (!n) throw new Error("в файле нет строки LUT_3D_SIZE — это не .cube");
          if (n < 2 || n > MAX_SIZE) throw new Error("размер сетки " + n + " вне 2…" + MAX_SIZE);
          data = new Float32Array((size ? n * n * n : n) * 3);
        }
        var p = line.split(/\s+/);
        if (p.length < 3) throw new Error("строка " + (i + 1) + ": ожидались три числа");
        if (at + 3 > data.length) throw new Error("строк данных больше, чем обещает размер сетки");
        for (var c = 0; c < 3; c++) {
          var v = parseFloat(p[c]);
          if (!isFinite(v)) throw new Error("строка " + (i + 1) + ": «" + p[c] + "» не число");
          data[at++] = v;
        }
      }
    }

    if (!data || at === 0) throw new Error("в файле нет данных LUT");
    if (at !== data.length) {
      throw new Error("строк данных " + (at / 3) + ", а размер сетки требует " + (data.length / 3));
    }
    return {
      size: size || size1d,
      dim: size ? 3 : 1,
      title: title,
      domainMin: dmin,
      domainMax: dmax,
      data: data
    };
  }

  /* ---------------- интерполяция (эталон verify_scopes.py §7) ---------------- */

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* трилинейная: восемь углов ячейки, три линейных прохода */
  function sampleTri(lut, r, g, b, out) {
    var n = lut.size, d = lut.data, m = n - 1;
    var pr = clamp01(r) * m, pg = clamp01(g) * m, pb = clamp01(b) * m;
    var i = Math.min(pr | 0, n - 2), j = Math.min(pg | 0, n - 2), k = Math.min(pb | 0, n - 2);
    var fr = pr - i, fg = pg - j, fb = pb - k;
    var s = n * 3, p = n * n * 3;
    var o000 = ((k * n + j) * n + i) * 3, o100 = o000 + 3;
    var o010 = o000 + s, o110 = o010 + 3;
    var o001 = o000 + p, o101 = o001 + 3;
    var o011 = o001 + s, o111 = o011 + 3;
    for (var ch = 0; ch < 3; ch++) {
      var c00 = d[o000 + ch] * (1 - fr) + d[o100 + ch] * fr;
      var c10 = d[o010 + ch] * (1 - fr) + d[o110 + ch] * fr;
      var c01 = d[o001 + ch] * (1 - fr) + d[o101 + ch] * fr;
      var c11 = d[o011 + ch] * (1 - fr) + d[o111 + ch] * fr;
      var c0 = c00 * (1 - fg) + c10 * fg;
      var c1 = c01 * (1 - fg) + c11 * fg;
      out[ch] = c0 * (1 - fb) + c1 * fb;
    }
    return out;
  }

  /* тетраэдральная: куб делится на шесть тетраэдров, работают четыре узла.
     Так считает Resolve — на плавных градиентах меньше «ступенек» */
  function sampleTetra(lut, r, g, b, out) {
    var n = lut.size, d = lut.data, m = n - 1;
    var pr = clamp01(r) * m, pg = clamp01(g) * m, pb = clamp01(b) * m;
    var i = Math.min(pr | 0, n - 2), j = Math.min(pg | 0, n - 2), k = Math.min(pb | 0, n - 2);
    var fr = pr - i, fg = pg - j, fb = pb - k;
    var s = n * 3, p = n * n * 3;
    var o000 = ((k * n + j) * n + i) * 3;
    var o111 = o000 + 3 + s + p;
    var a, b2;                      /* два промежуточных узла тетраэдра */
    if (fr > fg) {
      if (fg > fb) { a = o000 + 3; b2 = o000 + 3 + s; }            /* fr > fg > fb */
      else if (fr > fb) { a = o000 + 3; b2 = o000 + 3 + p; }       /* fr > fb > fg */
      else { a = o000 + p; b2 = o000 + 3 + p; }                    /* fb > fr > fg */
    } else {
      if (fb > fg) { a = o000 + p; b2 = o000 + s + p; }            /* fb > fg > fr */
      else if (fb > fr) { a = o000 + s; b2 = o000 + s + p; }       /* fg > fb > fr */
      else { a = o000 + s; b2 = o000 + 3 + s; }                    /* fg > fr > fb */
    }
    for (var ch = 0; ch < 3; ch++) {
      var v000 = d[o000 + ch], v111 = d[o111 + ch], v1 = d[a + ch], v2 = d[b2 + ch];
      if (fr > fg) {
        if (fg > fb) out[ch] = v000 + (v1 - v000) * fr + (v2 - v1) * fg + (v111 - v2) * fb;
        else if (fr > fb) out[ch] = v000 + (v1 - v000) * fr + (v111 - v2) * fg + (v2 - v1) * fb;
        else out[ch] = v000 + (v2 - v1) * fr + (v111 - v2) * fg + (v1 - v000) * fb;
      } else {
        if (fb > fg) out[ch] = v000 + (v111 - v2) * fr + (v2 - v1) * fg + (v1 - v000) * fb;
        else if (fb > fr) out[ch] = v000 + (v111 - v2) * fr + (v1 - v000) * fg + (v2 - v1) * fb;
        else out[ch] = v000 + (v2 - v1) * fr + (v1 - v000) * fg + (v111 - v2) * fb;
      }
    }
    return out;
  }

  /* 1D-LUT: каждый канал по своей кривой, линейно между узлами */
  function sample1d(lut, r, g, b, out) {
    var n = lut.size, d = lut.data, m = n - 1, v = [r, g, b];
    for (var ch = 0; ch < 3; ch++) {
      var p = clamp01(v[ch]) * m, i = Math.min(p | 0, n - 2), f = p - i;
      out[ch] = d[i * 3 + ch] * (1 - f) + d[(i + 1) * 3 + ch] * f;
    }
    return out;
  }

  function sample(lut, r, g, b, method, out) {
    out = out || [0, 0, 0];
    if (lut.dim === 1) return sample1d(lut, r, g, b, out);
    return method === "tri" ? sampleTri(lut, r, g, b, out) : sampleTetra(lut, r, g, b, out);
  }

  /* ---------------- применение к кадру ----------------

     Вход RGBA 0…255 переводится в долю сигнала, домен LUT учитывается
     (DOMAIN_MIN/MAX), сила — линейная смесь с исходным пикселем. Кадр обычно
     полмиллиона пикселей, поэтому цикл плотный: без замыканий и без новых
     массивов на пиксель. */
  /* Вход 8-битный: значений на канал всего 256, поэтому узел и дробная часть
     считаются один раз на таблицу, а не на каждый пиксель кадра. Замер на
     кадре 960×540: 36 мс в лоб против 12 мс с таблицами. */
  function axisTables(lut, ch) {
    var n = lut.size, m = n - 1;
    var lo = lut.domainMin[ch], hi = lut.domainMax[ch];
    var s = 1 / ((hi - lo) || 1);
    var idx = new Int32Array(256), frac = new Float32Array(256);
    for (var v = 0; v < 256; v++) {
      var x = (v / 255 - lo) * s;
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      var p = x * m, i = p | 0;
      if (i > n - 2) i = n - 2;
      idx[v] = i; frac[v] = p - i;
    }
    return { idx: idx, frac: frac };
  }

  function apply(data, len, lut, opts) {
    opts = opts || {};
    var tri = opts.method === "tri";
    var k = opts.strength === undefined ? 1 : Math.max(0, Math.min(1, opts.strength));
    if (!lut || k === 0) return;

    if (lut.dim === 1) { apply1d(data, len, lut, k); return; }

    var d = lut.data, n = lut.size, step = n * 3, plane = n * n * 3;
    var TR = axisTables(lut, 0), TG = axisTables(lut, 1), TB = axisTables(lut, 2);
    var ir = TR.idx, fr_ = TR.frac, ig = TG.idx, fg_ = TG.frac, ib = TB.idx, fb_ = TB.frac;

    for (var i = 0; i < len; i += 4) {
      var R = data[i], G = data[i + 1], B = data[i + 2];
      var fr = fr_[R], fg = fg_[G], fb = fb_[B];
      var o000 = ((ib[B] * n + ig[G]) * n + ir[R]) * 3;
      var nr, ng, nb, ch;

      if (tri) {
        var o100 = o000 + 3, o010 = o000 + step, o110 = o010 + 3;
        var o001 = o000 + plane, o101 = o001 + 3, o011 = o001 + step, o111 = o011 + 3;
        var res = TMP;
        for (ch = 0; ch < 3; ch++) {
          var c00 = d[o000 + ch] + (d[o100 + ch] - d[o000 + ch]) * fr;
          var c10 = d[o010 + ch] + (d[o110 + ch] - d[o010 + ch]) * fr;
          var c01 = d[o001 + ch] + (d[o101 + ch] - d[o001 + ch]) * fr;
          var c11 = d[o011 + ch] + (d[o111 + ch] - d[o011 + ch]) * fr;
          var c0 = c00 + (c10 - c00) * fg, c1 = c01 + (c11 - c01) * fg;
          res[ch] = (c0 + (c1 - c0) * fb) * 255;
        }
        nr = res[0]; ng = res[1]; nb = res[2];
      } else {
        var o111t = o000 + 3 + step + plane, a, b2;
        if (fr > fg) {
          if (fg > fb) { a = o000 + 3; b2 = o000 + 3 + step; }
          else if (fr > fb) { a = o000 + 3; b2 = o000 + 3 + plane; }
          else { a = o000 + plane; b2 = o000 + 3 + plane; }
        } else {
          if (fb > fg) { a = o000 + plane; b2 = o000 + step + plane; }
          else if (fb > fr) { a = o000 + step; b2 = o000 + step + plane; }
          else { a = o000 + step; b2 = o000 + 3 + step; }
        }
        var t = TMP;
        for (ch = 0; ch < 3; ch++) {
          var v000 = d[o000 + ch], v111 = d[o111t + ch], v1 = d[a + ch], v2 = d[b2 + ch];
          var out;
          if (fr > fg) {
            if (fg > fb) out = v000 + (v1 - v000) * fr + (v2 - v1) * fg + (v111 - v2) * fb;
            else if (fr > fb) out = v000 + (v1 - v000) * fr + (v111 - v2) * fg + (v2 - v1) * fb;
            else out = v000 + (v2 - v1) * fr + (v111 - v2) * fg + (v1 - v000) * fb;
          } else {
            if (fb > fg) out = v000 + (v111 - v2) * fr + (v2 - v1) * fg + (v1 - v000) * fb;
            else if (fb > fr) out = v000 + (v111 - v2) * fr + (v1 - v000) * fg + (v2 - v1) * fb;
            else out = v000 + (v2 - v1) * fr + (v1 - v000) * fg + (v111 - v2) * fb;
          }
          t[ch] = out * 255;
        }
        nr = t[0]; ng = t[1]; nb = t[2];
      }

      if (k < 1) {
        nr = R + (nr - R) * k;
        ng = G + (ng - G) * k;
        nb = B + (nb - B) * k;
      }
      data[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      data[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      data[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
  }

  var TMP = new Float64Array(3);

  /* 1D-LUT: 256 входных значений на канал — вся работа влезает в три таблицы */
  function apply1d(data, len, lut, k) {
    var map = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    var out = [0, 0, 0];
    for (var v = 0; v < 256; v++) {
      sample1d(lut, v / 255, v / 255, v / 255, out);
      for (var c = 0; c < 3; c++) map[c][v] = out[c] * 255;
    }
    var m0 = map[0], m1 = map[1], m2 = map[2];
    for (var i = 0; i < len; i += 4) {
      var R = data[i], G = data[i + 1], B = data[i + 2];
      var nr = m0[R], ng = m1[G], nb = m2[B];
      if (k < 1) { nr = R + (nr - R) * k; ng = G + (ng - G) * k; nb = B + (nb - B) * k; }
      data[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      data[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      data[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
  }

  /* ---------------- пересемплирование и выгрузка ---------------- */

  function resample(lut, n2, method) {
    if (n2 < 2 || n2 > MAX_SIZE) throw new Error("размер сетки " + n2 + " вне 2…" + MAX_SIZE);
    var out = new Float32Array(n2 * n2 * n2 * 3), at = 0, tmp = [0, 0, 0], m = n2 - 1;
    for (var k = 0; k < n2; k++) {
      for (var j = 0; j < n2; j++) {
        for (var i = 0; i < n2; i++) {
          sample(lut, i / m, j / m, k / m, method, tmp);
          out[at++] = tmp[0]; out[at++] = tmp[1]; out[at++] = tmp[2];
        }
      }
    }
    return {
      size: n2, dim: 3, title: lut.title, data: out,
      domainMin: lut.domainMin.slice(), domainMax: lut.domainMax.slice()
    };
  }

  function f6(v) { return (Math.round(v * 1e6) / 1e6).toFixed(6); }

  function toCube(lut, title) {
    if (lut.dim === 1) throw new Error("выгрузка 1D-LUT не поддержана");
    var s = ['TITLE "' + String(title || lut.title || "ПОБУБНИМ").replace(/"/g, "") + '"',
      "LUT_3D_SIZE " + lut.size,
      "DOMAIN_MIN " + lut.domainMin.map(f6).join(" "),
      "DOMAIN_MAX " + lut.domainMax.map(f6).join(" "), ""];
    var d = lut.data;
    for (var i = 0; i < d.length; i += 3) {
      s.push(f6(d[i]) + " " + f6(d[i + 1]) + " " + f6(d[i + 2]));
    }
    return s.join("\n") + "\n";
  }

  function identity(n) {
    var out = new Float32Array(n * n * n * 3), at = 0, m = n - 1;
    for (var k = 0; k < n; k++) {
      for (var j = 0; j < n; j++) {
        for (var i = 0; i < n; i++) { out[at++] = i / m; out[at++] = j / m; out[at++] = k / m; }
      }
    }
    return { size: n, dim: 3, title: "identity", data: out, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
  }

  window.PobubnimLut = {
    parseCube: parseCube,
    sample: sample,
    apply: apply,
    resample: resample,
    toCube: toCube,
    identity: identity,
    MAX_SIZE: MAX_SIZE
  };
})();
