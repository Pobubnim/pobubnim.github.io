/* ПОБУБНИМ — ядро приборов: waveform, парад, гистограмма, вектроскоп, false color.
   Только математика, без интерфейса. Канон и вывод формул — docs/SCOPES_BASE.md,
   независимый пересчёт — tools/verify_scopes.py. Ни одного числа «на глаз».

   Кадр приходит из canvas: 8 бит на канал, full range 0–255, sRGB. Что с ним
   считать — legal или full, 709 или 601 — решает вызывающий, потому что честного
   способа узнать это из браузера нет (SCOPES_BASE §9). */

(function () {
  "use strict";

  /* матрицы яркости: средняя строка RGB→XYZ соответствующего стандарта */
  var MATRIX = {
    "709": { kr: 0.2126, kg: 0.7152, kb: 0.0722, name: "Rec.709 (HD)" },
    "601": { kr: 0.2990, kg: 0.5870, kb: 0.1140, name: "Rec.601 (SD)" }
  };

  /* диапазоны кодов в восьми битах (SCOPES_BASE §2) */
  var RANGE = {
    full:  { black: 0,  white: 255, name: "Full 0–255" },
    legal: { black: 16, white: 235, name: "Legal 16–235" }
  };

  /* зоны false color по IRE — выведены из кривой Rec.709 (SCOPES_BASE §7а).
     lo включительно, hi исключительно; цвет — как на мониторах этого класса */
  var FC_IRE = [
    { lo:  0,   hi:  2.5, rgb: [179,   0, 255], t: "шумовой пол" },
    { lo:  2.5, hi:  9,   rgb: [  0,  90, 255], t: "край теней" },
    { lo: 38,   hi: 43,   rgb: [  0, 220,  60], t: "18% серый" },
    { lo: 60,   hi: 75,   rgb: [255, 150, 165], t: "кожа" },
    { lo: 92,   hi: 97,   rgb: [255, 225,   0], t: "подход к белому" },
    { lo: 97,   hi: 101,  rgb: [255,  40,  30], t: "клиппинг" }
  ];

  /* Y'CbCr по выбранной матрице; вход 0..1, выход Y 0..1, Cb/Cr −0.5..0.5 */
  function ycbcr(r, g, b, m) {
    var y = m.kr * r + m.kg * g + m.kb * b;
    return { y: y, cb: (b - y) / (2 * (1 - m.kb)), cr: (r - y) / (2 * (1 - m.kr)) };
  }

  /* код 0–255 → IRE выбранного диапазона (может уйти за 0..100 — это правда о сигнале) */
  function ire(v, range) {
    return (v - range.black) / (range.white - range.black) * 100;
  }

  function lumaByte(r, g, b, m) { return m.kr * r + m.kg * g + m.kb * b; }

  /* ---------- waveform ----------
     Накопление, а не рисование поверх: в одну точку прибора попадает много
     пикселей кадра, и яркость точки говорит, сколько именно (SCOPES_BASE §4).
     out — Uint16Array на 3*W*H: три плоскости счётчиков (R, G, B либо только
     первая для яркости). Плоскости, а не байты одного числа: в колонку кадра
     попадает больше 255 пикселей, и упакованный счётчик затирал бы соседний
     канал.  mode: "luma" | "rgb" | "parade" */
  function waveform(px, w, h, out, W, H, mode, m, range) {
    out.fill(0);
    var plane = W * H;
    var isParade = mode === "parade";
    var laneW = isParade ? (W / 3) | 0 : W;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        var i = row + x * 4;
        var r = px[i], g = px[i + 1], b = px[i + 2];
        if (mode === "luma") {
          plot(out, W, H, plane, ((x / w) * W) | 0, lumaByte(r, g, b, m), range, 0);
        } else if (isParade) {
          var base = ((x / w) * laneW) | 0;
          plot(out, W, H, plane, base, r, range, 0);
          plot(out, W, H, plane, base + laneW, g, range, 1);
          plot(out, W, H, plane, base + laneW * 2, b, range, 2);
        } else {                       /* rgb overlay: три трассы в одном поле */
          var cx = ((x / w) * W) | 0;
          plot(out, W, H, plane, cx, r, range, 0);
          plot(out, W, H, plane, cx, g, range, 1);
          plot(out, W, H, plane, cx, b, range, 2);
        }
      }
    }
  }

  function plot(out, W, H, plane, x, v, range, chan) {
    if (x < 0 || x >= W) return;
    var pct = ire(v, range) / 100;                 /* 0 IRE внизу, 100 наверху */
    var y = Math.round((1 - pct) * (H - 1));
    if (y < 0) y = 0; else if (y >= H) y = H - 1;
    var idx = chan * plane + y * W + x;
    if (out[idx] < 65535) out[idx]++;
  }

  /* накопление → пиксели канваса. gain — яркость трассы (человек её крутит) */
  function waveformToImage(out, W, H, img, gain, mode) {
    var d = img.data, plane = W * H;
    for (var i = 0; i < plane; i++) {
      var o = i * 4;
      if (mode === "luma") {
        var a = Math.min(255, out[i] * gain);
        d[o] = 245 * a / 255; d[o + 1] = 239 * a / 255; d[o + 2] = 226 * a / 255;
      } else {
        d[o]     = Math.min(255, out[i] * gain);
        d[o + 1] = Math.min(255, out[plane + i] * gain);
        d[o + 2] = Math.min(255, out[plane * 2 + i] * gain);
      }
      d[o + 3] = 255;
    }
  }

  /* ---------- гистограмма ----------
     Возвращает четыре ряда по 256 корзин: яркость и три канала (SCOPES_BASE §5) */
  function histogram(px, w, h, m) {
    var y = new Uint32Array(256), r = new Uint32Array(256),
        g = new Uint32Array(256), b = new Uint32Array(256);
    for (var i = 0, n = w * h * 4; i < n; i += 4) {
      var R = px[i], G = px[i + 1], B = px[i + 2];
      r[R]++; g[G]++; b[B]++;
      y[Math.round(lumaByte(R, G, B, m))]++;
    }
    return { y: y, r: r, g: g, b: b, total: w * h };
  }

  /* ---------- вектроскоп ----------
     Аккумуляция в квадратную сетку S×S: Cb вправо, Cr вверх, центр — серый */
  function vector(px, w, h, acc, S, m, step) {
    acc.fill(0);
    var half = S / 2;
    for (var y = 0; y < h; y += step) {
      var row = y * w * 4;
      for (var x = 0; x < w; x += step) {
        var i = row + x * 4;
        var c = ycbcr(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, m);
        var px1 = Math.round(half + c.cb * S);      /* ±0.5 занимает половину поля */
        var py1 = Math.round(half - c.cr * S);
        if (px1 >= 0 && px1 < S && py1 >= 0 && py1 < S) acc[py1 * S + px1]++;
      }
    }
  }

  /* ---------- false color ----------
     Таблица на 256 кодов: серый там, где зоны нет. Считается один раз на смену
     настроек, дальше кадр красится за один проход. */
  function falseColorLUT(zones, range) {
    var lut = new Uint8Array(256 * 3);
    for (var v = 0; v < 256; v++) {
      var val = ire(v, range), z = null;
      for (var k = 0; k < zones.length; k++) {
        if (val >= zones[k].lo && val < zones[k].hi) { z = zones[k]; break; }
      }
      var o = v * 3;
      if (z) { lut[o] = z.rgb[0]; lut[o + 1] = z.rgb[1]; lut[o + 2] = z.rgb[2]; }
      else   { lut[o] = lut[o + 1] = lut[o + 2] = v; }
    }
    return lut;
  }

  /* красит кадр на месте: яркость → цвет зоны */
  function applyFalseColor(px, n, lut, m) {
    for (var i = 0; i < n; i += 4) {
      var v = Math.round(lumaByte(px[i], px[i + 1], px[i + 2], m));
      if (v < 0) v = 0; else if (v > 255) v = 255;
      var o = v * 3;
      px[i] = lut[o]; px[i + 1] = lut[o + 1]; px[i + 2] = lut[o + 2];
    }
  }

  /* ---------- числа кадра ----------
     Минимум, максимум, средний IRE и доли клиппинга — то, ради чего смотрят */
  function stats(px, w, h, m, range) {
    var min = 1e9, max = -1e9, sum = 0, low = 0, high = 0, n = 0;
    for (var i = 0, len = w * h * 4; i < len; i += 4) {
      var v = ire(lumaByte(px[i], px[i + 1], px[i + 2], m), range);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v; n++;
      if (px[i] <= 1 && px[i + 1] <= 1 && px[i + 2] <= 1) low++;
      if (px[i] >= 254 && px[i + 1] >= 254 && px[i + 2] >= 254) high++;
    }
    return {
      min: min, max: max, avg: sum / n,
      lowPct: low / n * 100, highPct: high / n * 100
    };
  }

  window.PobubnimScopes = {
    MATRIX: MATRIX, RANGE: RANGE, FC_IRE: FC_IRE,
    ycbcr: ycbcr, ire: ire, luma: lumaByte,
    waveform: waveform, waveformToImage: waveformToImage,
    histogram: histogram, vector: vector,
    falseColorLUT: falseColorLUT, applyFalseColor: applyFalseColor,
    stats: stats
  };
})();
