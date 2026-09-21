/* ПОБУБНИМ — доска «три ошибки, которые выдают новичка»
   (uroki/tri-oshibki-cveta.html).

   Кадр не картинка-заготовка: сцена задана в ЛИНЕЙНОМ свете (серая карта 0,18,
   кожа, белая бумага, окно ярче единицы), кодируется настоящей кривой камеры —
   Rec.709 OETF или Sony S-Log3 (EDU_BASE §8д.4,6), а ошибка применяется как
   настоящее преобразование кодов. Приборы справа — ядро scopes-core.js — читают
   получившиеся пиксели, а не рисуются «под ответ».

   Что меряется (EDU_BASE §8п.4): угол кожи в осях Cb/Cr по Rec.709 против
   канона 123° (§8б.4а), кожа и серая карта в IRE против коридоров §8б.2,
   насыщенность кожи и доля обрезанных пикселей.

   МОДЕЛИ, подписанные на странице: творческий LUT заменён своей S-кривой с
   подъёмом насыщенности (форма та же, коэффициенты наши); «общий грейд» —
   ASC CDL (§8д.2) с уходом в зелень; ошибка экрана — усиление по каналам. */

(function () {
  var board = document.getElementById("eb");
  if (!board) return;
  var S = window.PobubnimScopes;
  if (!S) return;
  var cv = document.getElementById("eb-frame");
  var ctx = cv.getContext("2d", { willReadFrequently: true });
  var statEl = document.getElementById("eb-stat");

  var W = 880, H = 420;
  var FW = 512, FH = 288;                 /* кадр */
  var WFX = 528, WFY = 18, WFW = 336, WFH = 168;   /* парад */
  var VECX = 604, VECY = 212, VECS = 184;          /* вектроскоп */

  var KR = 0.2126, KG = 0.7152, KB = 0.0722;
  var SKIN_CANON = 123;                   /* §8б.4а */

  var state = { err: 0, view: 0, s: 0.6, screen: 0.12 };

  /* ---------- кривые камеры (§8д) ---------- */
  function oetf709(L) {
    if (L < 0) L = 0;
    return L < 0.018 ? 4.5 * L : 1.099 * Math.pow(L, 0.45) - 0.099;
  }
  function slog3(x) {
    if (x < 0) x = 0;
    return x >= 0.01125 ? (420 + Math.log((x + 0.01) / 0.19) / Math.LN10 * 261.5) / 1023
                        : (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023;
  }
  function slog3Inv(v) {
    var c = v * 1023;
    return c >= 171.2102946929 ? Math.pow(10, (c - 420) / 261.5) * 0.19 - 0.01
                               : (c - 95) * 0.01125 / (171.2102946929 - 95);
  }
  function srgbLin(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luma(r, g, b) { return KR * r + KG * g + KB * b; }

  /* оттенок эталонного образца, поставленный на нужную яркость */
  function hueAt(ref, Y) {
    var l = [srgbLin(ref[0]), srgbLin(ref[1]), srgbLin(ref[2])];
    var k = Y / luma(l[0], l[1], l[2]);
    return [l[0] * k, l[1] * k, l[2] * k];
  }

  var SKIN = hueAt([222, 170, 140], 0.4265);   /* цель ≈ 64 IRE в 709 */
  var LEAF = hueAt([110, 150, 70], 0.10);
  var SKY = hueAt([150, 185, 230], 1.55);      /* окно ярче белого — в 709 обрежется */

  /* ---------- сцена в линейном свете ---------- */
  var LIN = null;

  function buildLinear() {
    var lin = new Float32Array(FW * FH * 3);
    var cx = 200, cy = 110, rx = 50, ry = 62;        /* лицо */
    var hx = 200, hy = 92, hrx = 56, hry = 64;       /* волосы — чуть больше и выше */
    var lx = -0.7191, ly = -0.2197, lz = 0.6592;     /* окно слева и чуть спереди */
    for (var y = 0; y < FH; y++) {
      for (var x = 0; x < FW; x++) {
        var i = (y * FW + x) * 3, r, g, b;
        /* стена: свет из окна падает слева направо */
        var side = 0.30 + 0.70 * Math.pow(1 - x / FW, 1.5);
        var wall = 0.058 * (1 - 0.30 * (y / FH)) * side;
        r = wall * 1.05; g = wall; b = wall * 0.93;

        /* листья на стене справа — в кадре нужен цвет, который не кожа */
        if (x > 436 && y < 128) {
          var t = (x - 436) / 76;
          if (y < 116 - 70 * Math.abs(Math.sin(t * 2.4 + 0.4))) {
            r = LEAF[0] * side; g = LEAF[1] * side; b = LEAF[2] * side;
          }
        }

        /* окно слева: створка с перекладинами */
        if (x > 6 && x < 52 && y > 22 && y < 186) {
          var bar = (x > 26 && x < 31) || (y > 100 && y < 105);
          if (bar) { r = 0.012; g = 0.012; b = 0.013; }
          else { r = SKY[0]; g = SKY[1]; b = SKY[2]; }
        }

        /* волосы */
        var gx = (x - hx) / hrx, gy = (y - hy) / hry;
        if (gx * gx + gy * gy <= 1) {
          var hl = 0.10 + 0.9 * Math.max(0, -gx * 0.8 + 0.45);
          r = 0.030 * hl; g = 0.024 * hl; b = 0.020 * hl;
        }

        /* шея — в тени от подбородка */
        if (x > 184 && x < 216 && y > 160 && y < 196) {
          r = SKIN[0] * 0.42; g = SKIN[1] * 0.42; b = SKIN[2] * 0.42;
        }

        /* лицо: настоящий Ламберт по нормали шара */
        var nx = (x - cx) / rx, ny = (y - cy) / ry, q = nx * nx + ny * ny;
        if (q <= 1) {
          var nz = Math.sqrt(1 - q);
          var lam = nx * lx + ny * ly + nz * lz;
          if (lam < 0) lam = 0;
          var shade = 0.12 + 1.06 * lam;
          r = SKIN[0] * shade; g = SKIN[1] * shade; b = SKIN[2] * shade;
        }

        /* плечи в тёмной рубашке */
        if (y > 190 && x < 302 && Math.abs(x - 200) < 58 + (y - 190) * 1.1) {
          var sv = 0.05 * (0.5 + 0.5 * side);
          r = sv * 0.97; g = sv; b = sv * 1.06;
        }

        /* стол справа, на нём карты */
        if (x >= 302 && y > 198) {
          var tv = 0.075 * (y < 206 ? 0.5 : 1);
          r = tv * 1.04; g = tv; b = tv * 0.9;
        }
        /* серая карта 18 % и белая бумага — лежат в ключевом свете */
        if (x > 330 && x < 420 && y > 206 && y < 262) { r = g = b = 0.18; }
        if (x > 430 && x < 500 && y > 214 && y < 262) { r = g = b = 0.82; }

        lin[i] = r; lin[i + 1] = g; lin[i + 2] = b;
      }
    }
    return lin;
  }

  /* ---------- кодирование: один раз на кривую ---------- */
  function encodeAll(curve) {
    var f = curve === "log" ? slog3 : oetf709;
    var n = FW * FH, out = new Uint8ClampedArray(n * 4);
    for (var p = 0; p < n; p++) {
      var i = p * 3, o = p * 4;
      out[o] = Math.round(f(LIN[i]) * 255);
      out[o + 1] = Math.round(f(LIN[i + 1]) * 255);
      out[o + 2] = Math.round(f(LIN[i + 2]) * 255);
      out[o + 3] = 255;
    }
    return out;
  }

  var BASE709 = null, BASELOG = null;

  /* ---------- преобразования ---------- */
  /* правильная конверсия log → 709: раскодировать и закодировать заново */
  function cst(c) { return Math.round(oetf709(slog3Inv(c / 255)) * 255); }

  var CST_LUT = null;
  function cstLut() {
    if (!CST_LUT) {
      CST_LUT = new Uint8ClampedArray(256);
      for (var i = 0; i < 256; i++) CST_LUT[i] = cst(i);
    }
    return CST_LUT;
  }

  /* творческий LUT, рассчитанный на нормальный контраст: S-кривая + насыщенность */
  function creative(rgb, s) {
    var p = 0.435, k = 1 + 0.6 * s, sa = 1 + 0.32 * s;
    var v0 = cl((rgb[0] / 255 - p) * k + p),
        v1 = cl((rgb[1] / 255 - p) * k + p),
        v2 = cl((rgb[2] / 255 - p) * k + p);
    var y = luma(v0, v1, v2);
    v0 = cl(y + (v0 - y) * sa); v1 = cl(y + (v1 - y) * sa); v2 = cl(y + (v2 - y) * sa);
    v0 = cl(v0 + 0.05 * s * (v0 - 0.5));
    v2 = cl(v2 - 0.05 * s * (v2 - 0.5));
    return [v0 * 255, v1 * 255, v2 * 255];
  }

  /* общий грейд одним движением на весь кадр — ASC CDL (§8д.2) */
  function gradeAll(rgb, s) {
    var sl0 = 1 + 0.20 * s, sl1 = 1 + 0.10 * s, sl2 = 1 - 0.18 * s;
    var of0 = -0.025 * s, of1 = 0.04 * s, of2 = 0.035 * s;
    var v0 = cl(rgb[0] / 255 * sl0 + of0),
        v1 = cl(rgb[1] / 255 * sl1 + of1),
        v2 = cl(rgb[2] / 255 * sl2 + of2);
    var y = luma(v0, v1, v2), sa = 1 + 0.25 * s;
    return [cl(y + (v0 - y) * sa) * 255, cl(y + (v1 - y) * sa) * 255, cl(y + (v2 - y) * sa) * 255];
  }

  /* экран теплит на t — человек правит в обратную сторону, и это уходит в файл */
  function screenFix(rgb, t) {
    return [rgb[0] / (1 + t), rgb[1], rgb[2] / (1 - t)];
  }
  function throughScreen(rgb, t) {
    return [rgb[0] * (1 + t), rgb[1], rgb[2] * (1 - t)];
  }

  function cl(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function b255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  /* насколько пиксель похож на кожу — для «как надо» с ключом по коже */
  function skinMask(r, g, b) {
    var y = luma(r, g, b) / 255;
    var cb = (b / 255 - y) * 0.5389, cr = (r / 255 - y) * 0.635;
    var rad = Math.sqrt(cb * cb + cr * cr);
    if (rad < 0.012) return 0;
    var a = Math.atan2(cr, cb) * 180 / Math.PI;
    if (a < 0) a += 360;
    var d = Math.abs(a - SKIN_CANON);
    if (d > 180) d = 360 - d;
    return d > 26 ? 0 : (d < 14 ? 1 : (26 - d) / 12);
  }

  /* ---------- сборка кадра ---------- */
  var frameImg = null;

  function render() {
    var err = state.err, view = state.view, s = state.s, t = state.screen;
    var src = err === 1 ? BASELOG : BASE709;
    var d = frameImg.data, lut = cstLut();
    var n = FW * FH;
    for (var p = 0; p < n; p++) {
      var o = p * 4, c = [src[o], src[o + 1], src[o + 2]];

      if (err === 1) {
        /* ошибка: творчество прямо поверх log. «Как надо»: сперва конверсия */
        if (view === 1) c = creative([lut[c[0]], lut[c[1]], lut[c[2]]], s);
        else c = creative(c, s);
      } else if (err === 2) {
        if (view === 1) {
          var m = skinMask(c[0], c[1], c[2]);
          var gr = gradeAll(c, s);
          c = [gr[0] + (c[0] - gr[0]) * m, gr[1] + (c[1] - gr[1]) * m,
               gr[2] + (c[2] - gr[2]) * m];
        } else c = gradeAll(c, s);
      } else if (err === 3) {
        /* «как надо» — не трогать файл, править по приборам */
        if (view !== 1) c = screenFix(c, t);
      }

      if (view === 2) c = throughScreen(c, t);

      d[o] = b255(c[0]); d[o + 1] = b255(c[1]); d[o + 2] = b255(c[2]); d[o + 3] = 255;
    }
  }

  /* ---------- замер зон ---------- */
  var ZONES = [
    { id: "skin", name: "КОЖА", x: 172, y: 86, w: 34, h: 32 },
    { id: "gray", name: "СЕРАЯ КАРТА", x: 344, y: 218, w: 62, h: 32 },
    { id: "white", name: "БЕЛАЯ БУМАГА", x: 442, y: 224, w: 48, h: 28 }
  ];

  function measure(z) {
    var d = frameImg.data, r = 0, g = 0, b = 0, k = 0;
    for (var y = z.y; y < z.y + z.h; y++) {
      for (var x = z.x; x < z.x + z.w; x++) {
        var o = (y * FW + x) * 4;
        r += d[o]; g += d[o + 1]; b += d[o + 2]; k++;
      }
    }
    r /= k; g /= k; b /= k;
    var yv = luma(r, g, b) / 255;
    var cb = (b / 255 - yv) * 0.5389, cr = (r / 255 - yv) * 0.635;
    var a = Math.atan2(cr, cb) * 180 / Math.PI;
    return { rgb: [r, g, b], ire: yv * 100, angle: a < 0 ? a + 360 : a,
             sat: Math.sqrt(cb * cb + cr * cr) * 100 };
  }

  function clipped() {
    var d = frameImg.data, n = FW * FH, k = 0;
    for (var p = 0; p < n; p++) {
      var o = p * 4;
      if (d[o] >= 254 || d[o + 1] >= 254 || d[o + 2] >= 254) k++;
    }
    return k / n * 100;
  }

  /* ---------- приборы ---------- */
  var buf = null, wfImg = null, vecImg = null;

  function scopes() {
    S.analyze(frameImg.data, FW, FH,
      { matrix: S.MATRIX["709"], range: S.RANGE.full, wfMode: "parade",
        vecColor: true, vecStep: 2 }, buf);
    S.waveformToImage(buf.wf, WFW, WFH, wfImg, 1.35, "parade", FW, FH);
    S.vectorToImage(buf.vec, buf.vecHue, VECS, vecImg, 1.5, buf.stats.vecN, true, 2.2);
  }

  /* ---------- рисование ---------- */
  function draw() {
    render();
    scopes();

    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, W, H);
    ctx.putImageData(frameImg, 0, 0);

    zoneMarks();
    frameCaption();

    ctx.putImageData(wfImg, WFX, WFY);
    wfScale();
    ctx.putImageData(vecImg, VECX, VECY);
    vecScale();

    strip();
    stats();
  }

  function zoneMarks() {
    ctx.lineWidth = 1;
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ZONES.forEach(function (z) {
      ctx.strokeStyle = "rgba(245,239,226,0.75)";
      ctx.strokeRect(z.x - 0.5, z.y - 0.5, z.w + 1, z.h + 1);
      ctx.fillStyle = "rgba(11,10,9,0.72)";
      var tw = ctx.measureText(z.name).width + 8;
      ctx.fillRect(z.x - 1, z.y - 14, tw, 13);
      ctx.fillStyle = "rgba(245,239,226,0.85)";
      ctx.fillText(z.name, z.x + 3, z.y - 4);
    });
  }

  var ERRNAME = ["ошибки нет", "творческий LUT поверх log",
                 "общий грейд на весь кадр", "правка на глаз по своему экрану"];

  function frameCaption() {
    ctx.fillStyle = "rgba(11,10,9,0.78)";
    ctx.fillRect(0, FH - 22, FW, 22);
    ctx.fillStyle = "rgba(245,239,226,0.72)";
    ctx.font = "500 10.5px 'JetBrains Mono', monospace";
    var cam = state.err === 1 ? "КАМЕРА S-LOG3" : "КАМЕРА REC.709";
    var v = state.view === 1 ? " · КАК НАДО"
          : state.view === 2 ? " · ГЛАЗАМИ КОЛОРИСТА" : "";
    ctx.fillText(cam + " · " + ERRNAME[state.err].toUpperCase() + v, 10, FH - 7);
    ctx.fillText("ОБРЕЗ " + clipped().toFixed(1).replace(".", ",") + " %", FW - 96, FH - 7);
  }

  function wfScale() {
    ctx.strokeStyle = "rgba(245,239,226,0.13)";
    ctx.fillStyle = "rgba(245,239,226,0.45)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    [0, 20, 40, 60, 80, 100].forEach(function (ire) {
      var y = WFY + WFH - ire / 100 * WFH;
      ctx.beginPath();
      ctx.moveTo(WFX, y + 0.5); ctx.lineTo(WFX + WFW, y + 0.5);
      ctx.stroke();
      ctx.fillText(ire, WFX + WFW + 4, y + 3);
    });
    /* коридоры канона §8б.2 */
    band(40, 45, "rgba(0,220,60,0.5)", "18 %");
    band(60, 75, "rgba(255,150,165,0.55)", "кожа");
    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText("ПАРАД R · G · B, IRE", WFX, WFY - 5);
  }

  function band(lo, hi, color, label) {
    var y1 = WFY + WFH - hi / 100 * WFH, y2 = WFY + WFH - lo / 100 * WFH;
    ctx.strokeStyle = color;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(WFX, y1 + 0.5); ctx.lineTo(WFX + WFW, y1 + 0.5);
    ctx.moveTo(WFX, y2 + 0.5); ctx.lineTo(WFX + WFW, y2 + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.fillText(label, WFX + 3, y1 - 2);
  }

  function vecScale() {
    var cx = VECX + VECS / 2, cy = VECY + VECS / 2;
    ctx.strokeStyle = "rgba(245,239,226,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, VECS / 2 - 2, 0, Math.PI * 2);
    ctx.moveTo(cx - VECS / 2 + 2, cy); ctx.lineTo(cx + VECS / 2 - 2, cy);
    ctx.moveTo(cx, cy - VECS / 2 + 2); ctx.lineTo(cx, cy + VECS / 2 - 2);
    ctx.stroke();

    /* линия кожи 123° (§8б.4а) */
    var a = SKIN_CANON * Math.PI / 180, R = VECS / 2 - 3;
    ctx.strokeStyle = "rgba(255,150,165,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy - Math.sin(a) * R);
    ctx.stroke();

    /* где лежит кожа кадра на самом деле */
    var m = measure(ZONES[0]);
    var ar = m.angle * Math.PI / 180;
    var rad = Math.min(R, m.sat / 100 * VECS * 2.2);
    ctx.strokeStyle = "#f0c46e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ar) * rad, cy - Math.sin(ar) * rad, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText("ВЕКТРОСКОП · ЛИНИЯ КОЖИ 123°", VECX - 76, VECY - 8);
  }

  /* полоса замеров под кадром */
  function strip() {
    var y0 = FH + 8, h = H - y0 - 4;
    ctx.fillStyle = "rgba(20,18,16,0.85)";
    ctx.fillRect(0, y0, FW, h);
    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.strokeRect(0.5, y0 + 0.5, FW - 1, h - 1);

    var w = FW / 3;
    ZONES.forEach(function (z, i) {
      var m = measure(z), x = i * w + 12;
      ctx.fillStyle = "rgb(" + Math.round(m.rgb[0]) + "," + Math.round(m.rgb[1]) +
        "," + Math.round(m.rgb[2]) + ")";
      ctx.fillRect(x, y0 + 16, 34, 34);
      ctx.strokeStyle = "rgba(245,239,226,0.25)";
      ctx.strokeRect(x - 0.5, y0 + 15.5, 35, 35);

      ctx.fillStyle = "rgba(245,239,226,0.5)";
      ctx.font = "500 9px 'JetBrains Mono', monospace";
      ctx.fillText(z.name, x, y0 + 11);
      ctx.fillStyle = "rgba(245,239,226,0.9)";
      ctx.font = "500 11px 'JetBrains Mono', monospace";
      ctx.fillText(m.ire.toFixed(1).replace(".", ",") + " IRE", x + 42, y0 + 27);
      ctx.fillStyle = "rgba(245,239,226,0.6)";
      ctx.font = "500 10px 'JetBrains Mono', monospace";
      ctx.fillText("R" + Math.round(m.rgb[0]) + " G" + Math.round(m.rgb[1]) +
        " B" + Math.round(m.rgb[2]), x + 42, y0 + 41);
    });
  }

  /* ---------- показания ---------- */
  function verdict(skin, gray) {
    var d = Math.abs(skin.angle - SKIN_CANON);
    if (state.err === 0) return ["кожа на месте", ""];
    if (skin.ire < 55) return ["кадр сел по яркости", "warn"];
    if (d > 8) return ["кожа ушла с линии", "warn"];
    if (Math.abs(gray.rgb[0] - gray.rgb[2]) > 5) return ["серая карта не серая", "warn"];
    if (skin.sat > 21) return ["кожа пересыщена", "warn"];
    return ["в пределах нормы", ""];
  }

  function stats() {
    var skin = measure(ZONES[0]), gray = measure(ZONES[1]);
    var da = skin.angle - SKIN_CANON;
    var v = verdict(skin, gray);
    var rb = Math.round(gray.rgb[0] - gray.rgb[2]);
    statEl.innerHTML =
      '<span class="' + (Math.abs(da) > 8 ? "warn" : "") + '"><i>УГОЛ КОЖИ</i>' +
        skin.angle.toFixed(0) + "° (" + (da >= 0 ? "+" : "") + da.toFixed(0) + "° к канону)</span>" +
      '<span class="' + (skin.ire < 60 || skin.ire > 75 ? "warn" : "") + '"><i>КОЖА</i>' +
        skin.ire.toFixed(1).replace(".", ",") + " IRE</span>" +
      '<span class="' + (skin.sat > 21 ? "warn" : "") + '"><i>НАСЫЩЕННОСТЬ КОЖИ</i>' +
        skin.sat.toFixed(1).replace(".", ",") + "</span>" +
      '<span class="' + (Math.abs(rb) > 5 ? "warn" : "") + '"><i>СЕРАЯ КАРТА</i>' +
        gray.ire.toFixed(1).replace(".", ",") + " IRE, R−B " + (rb >= 0 ? "+" : "") + rb + "</span>" +
      '<span class="' + v[1] + '"><i>ВЕРДИКТ</i>' + v[0] + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    if (b.hasAttribute("data-err")) state.err = +b.dataset.err;
    else if (b.hasAttribute("data-view")) state.view = +b.dataset.view;
    draw();
  });
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-strength")) {
      state.s = +r.value / 100;
      sv.textContent = r.value + " %";
    } else if (r.hasAttribute("data-screen")) {
      state.screen = +r.value / 100;
      sv.textContent = (+r.value === 0 ? "ровный"
        : (+r.value > 0 ? "теплит " : "холодит ") + Math.abs(+r.value) + " %");
    }
    draw();
  });

  LIN = buildLinear();
  BASE709 = encodeAll("709");
  BASELOG = encodeAll("log");
  frameImg = ctx.createImageData(FW, FH);
  buf = S.makeBuffers(WFW, WFH, VECS);
  wfImg = ctx.createImageData(WFW, WFH);
  vecImg = ctx.createImageData(VECS, VECS);
  draw();

  window.PobubnimErr = {
    state: state, draw: draw, measure: function (i) { return measure(ZONES[i]); },
    zones: ZONES, clipped: clipped, canon: SKIN_CANON,
    creative: creative, gradeAll: gradeAll, screenFix: screenFix, cst: cst,
    oetf709: oetf709, slog3: slog3, slog3Inv: slog3Inv,
    stats: function () { return buf.stats; }
  };
})();
