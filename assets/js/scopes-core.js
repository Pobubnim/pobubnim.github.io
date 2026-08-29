/* ПОБУБНИМ — ядро приборов: waveform, парад, гистограмма, вектроскоп,
   false color (три шкалы), зебра, фокус-пикинг, пипетка, статистика кадра.
   Только математика, без интерфейса. Канон и вывод формул — docs/SCOPES_BASE.md,
   независимый пересчёт — tools/verify_scopes.py. Ни одного числа «на глаз».

   Кадр приходит из canvas: 8 бит на канал, sRGB-контейнер, коды 0–255. Как их
   читать — legal или full, 709 / 601 / 2020 — решает человек: честного способа
   узнать это из браузера нет (SCOPES_BASE §9), поэтому диапазон и матрица
   всегда подписаны рядом с показаниями. */

(function () {
  "use strict";

  /* ---------- 1. матрицы яркости: средняя строка RGB→XYZ стандарта ---------- */
  var MATRIX = {
    "709":  { kr: 0.2126, kg: 0.7152, kb: 0.0722, name: "Rec.709 (HD)" },
    "601":  { kr: 0.2990, kg: 0.5870, kb: 0.1140, name: "Rec.601 (SD)" },
    "2020": { kr: 0.2627, kg: 0.6780, kb: 0.0593, name: "Rec.2020 (UHD)" }
  };

  /* ---------- 2. диапазоны кодов в восьми битах (SCOPES_BASE §2) ---------- */
  var RANGE = {
    full:  { black: 0,  white: 255, name: "Full 0–255",   short: "Full" },
    legal: { black: 16, white: 235, name: "Legal 16–235", short: "Legal" }
  };

  /* ---------- 3. кривые сцена → сигнал и обратно (EDU_BASE §8д) ---------- */
  var CURVES = {
    "709": {
      name: "Rec.709",
      to: function (L) { return L < 0.018 ? 4.5 * L : 1.099 * Math.pow(L, 0.45) - 0.099; },
      from: function (v) { return v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45); }
    },
    srgb: {
      name: "sRGB",
      to: function (L) { return L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055; },
      from: function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    },
    slog3: {
      name: "Sony S-Log3",
      to: function (x) {
        return x >= 0.01125 ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023
                            : (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023;
      },
      from: function (v) {
        var c = v * 1023;
        return c >= 171.2102946929 ? Math.pow(10, (c - 420) / 261.5) * 0.19 - 0.01
                                   : (c - 95) * 0.01125 / (171.2102946929 - 95);
      }
    },
    logc3: {
      name: "ARRI LogC3 (EI 800)",
      to: function (x) {
        var cut = 0.010591, a = 5.555556, b = 0.052272, c = 0.247190,
            d = 0.385537, e = 5.367655, f = 0.092809;
        return x > cut ? c * Math.log10(a * x + b) + d : e * x + f;
      },
      from: function (v) {
        var cut = 0.010591, a = 5.555556, b = 0.052272, c = 0.247190,
            d = 0.385537, e = 5.367655, f = 0.092809;
        return v > e * cut + f ? (Math.pow(10, (v - d) / c) - b) / a : (v - f) / e;
      }
    }
  };

  /* ---------- 4. false color: три шкалы ---------- */

  /* а) наша шкала внимания по IRE — пороги выведены из кривой 709 (SCOPES_BASE §7а) */
  var FC_IRE = [
    { lo:  0,   hi:  2.5, rgb: [179,   0, 255], t: "шумовой пол · 0–2,5" },
    { lo:  2.5, hi:  9,   rgb: [  0,  90, 255], t: "край теней · 2,5–9" },
    { lo: 38,   hi: 43,   rgb: [  0, 220,  60], t: "18% серый · 38–43" },
    { lo: 60,   hi: 75,   rgb: [255, 150, 165], t: "кожа · 60–75" },
    { lo: 92,   hi: 97,   rgb: [255, 225,   0], t: "подход к белому · 92–97" },
    { lo: 97,   hi: 1e4,  rgb: [255,  40,  30], t: "клиппинг · 97+" }
  ];

  /* б) шкала ARRI LogC3 — ТОЧНЫЕ границы из открытой спецификации ARRI
     «LogC False Color Exposure Zones and Key», 04.02.2025, таблицы 2–15.
     Числа — 10-битные коды: [legal_lo, legal_hi, full_lo, full_hi].
     Цвета и смысл зон — таблица 1 той же спецификации. */
  var ARRI_COLORS = {
    Red:    [255,   0,   0], Yellow: [255, 255,   0], Pink:   [255, 179, 179],
    Green:  [  0, 255,   0], Blue:   [  0,   0, 255], Purple: [179,   0, 255]
  };
  var ARRI_TEXT = {
    Red: "1/3 стопа до клипа", Yellow: "2/3 стопа до клипа", Pink: "стоп над серым",
    Green: "18% серый", Blue: "край теней", Purple: "шумовой пол"
  };
  var ARRI_LOGC3 = {
    160:  { Red: [753, 940, 804, 1023],  Yellow: [729, 753, 777, 804],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [147, 151,  97, 102], Purple: [64, 147, 0,  97] },
    200:  { Red: [772, 940, 827, 1023],  Yellow: [748, 772, 799, 827],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [147, 153,  97, 103], Purple: [64, 147, 0,  97] },
    250:  { Red: [790, 940, 848, 1023],  Yellow: [767, 790, 821, 848],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [148, 154,  98, 105], Purple: [64, 148, 0,  98] },
    320:  { Red: [810, 940, 871, 1023],  Yellow: [787, 810, 845, 871],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [148, 157,  98, 108], Purple: [64, 148, 0,  98] },
    400:  { Red: [827, 940, 892, 1023],  Yellow: [805, 827, 865, 892],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [149, 159,  99, 111], Purple: [64, 149, 0,  99] },
    500:  { Red: [844, 940, 911, 1023],  Yellow: [822, 844, 885, 911],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [150, 163, 100, 115], Purple: [64, 150, 0, 100] },
    640:  { Red: [862, 940, 932, 1023],  Yellow: [840, 862, 907, 932],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [151, 167, 101, 121], Purple: [64, 151, 0, 101] },
    800:  { Red: [878, 940, 951, 1023],  Yellow: [857, 878, 926, 951],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [152, 172, 103, 127], Purple: [64, 152, 0, 103] },
    1000: { Red: [894, 940, 969, 1023],  Yellow: [872, 894, 944, 969],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [154, 179, 105, 134], Purple: [64, 154, 0, 105] },
    1280: { Red: [910, 940, 988, 1023],  Yellow: [889, 910, 963, 988],  Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [156, 188, 107, 144], Purple: [64, 156, 0, 107] },
    1600: { Red: [920, 940, 1000, 1023], Yellow: [900, 920, 977, 1000], Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [158, 197, 110, 156], Purple: [64, 158, 0, 110] },
    2000: { Red: [923, 940, 1003, 1023], Yellow: [906, 923, 983, 1003], Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [161, 210, 114, 170], Purple: [64, 161, 0, 114] },
    2560: { Red: [926, 940, 1006, 1023], Yellow: [910, 926, 988, 1006], Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [166, 225, 119, 188], Purple: [64, 166, 0, 119] },
    3200: { Red: [927, 940, 1008, 1023], Yellow: [914, 927, 992, 1008], Pink: [461, 480, 464, 486], Green: [397, 415, 389, 410], Blue: [170, 241, 124, 206], Purple: [64, 170, 0, 124] }
  };
  var ARRI_EIS = Object.keys(ARRI_LOGC3).map(Number).sort(function (a, b) { return a - b; });

  /* зоны ARRI в долях нормализованного сигнала: коды спецификации 10-битные,
     legal 64–940, full 0–1023 */
  function arriZones(ei, rangeKey) {
    var tab = ARRI_LOGC3[ei] || ARRI_LOGC3[800];
    var legal = rangeKey !== "full";
    var lo = legal ? 64 : 0, span = legal ? 876 : 1023;
    var order = ["Purple", "Blue", "Green", "Pink", "Yellow", "Red"];
    return order.map(function (k) {
      var v = tab[k], a = legal ? v[0] : v[2], b = legal ? v[1] : v[3];
      return { lo: (a - lo) / span, hi: (b - lo) / span,
               rgb: ARRI_COLORS[k], t: ARRI_TEXT[k], code: [a, b] };
    });
  }

  /* в) шкала в стопах от 18% серого (принцип EL Zone, цвета наши).
     Границы считаются из выбранной кривой: сигнал = curve(0.18 · 2^стоп). */
  var STOP_COLORS = [
    [-7, [120,   0, 200]], [-6, [ 90,  40, 220]], [-5, [ 40,  80, 235]],
    [-4, [  0, 130, 235]], [-3, [  0, 175, 210]], [-2, [  0, 190, 150]],
    [-1, [ 40, 200,  90]], [ 0, [  0, 220,  60]], [ 1, [255, 150, 165]],
    [ 2, [255, 170,  60]], [ 3, [255, 225,   0]], [ 4, [255,  90,  30]],
    [ 5, [255,  40,  30]], [ 6, [255,  40,  30]], [ 7, [255,  40,  30]]
  ];
  function stopZones(curveKey) {
    var c = CURVES[curveKey] || CURVES["709"], out = [];
    for (var i = 0; i < STOP_COLORS.length; i++) {
      var s = STOP_COLORS[i][0];
      var lo = c.to(0.18 * Math.pow(2, s - 0.5));
      var hi = c.to(0.18 * Math.pow(2, s + 0.5));
      if (lo >= 1) break;
      out.push({ lo: lo, hi: hi >= 1 ? 1e4 : hi, rgb: STOP_COLORS[i][1],
                 t: (s > 0 ? "+" : "") + s + " стоп", stop: s });
    }
    return out;
  }

  /* таблица на 256 кодов; зоны заданы в долях сигнала выбранного диапазона */
  function buildLUT(zones, range) {
    var lut = new Uint8Array(256 * 3), span = range.white - range.black;
    for (var v = 0; v < 256; v++) {
      var sig = (v - range.black) / span, z = null;
      for (var k = 0; k < zones.length; k++) {
        if (sig >= zones[k].lo && sig < zones[k].hi) { z = zones[k]; break; }
      }
      var o = v * 3;
      if (z) { lut[o] = z.rgb[0]; lut[o + 1] = z.rgb[1]; lut[o + 2] = z.rgb[2]; }
      else   { lut[o] = lut[o + 1] = lut[o + 2] = v; }
    }
    return lut;
  }
  /* наша шкала задана в IRE — переводим в доли сигнала (100 IRE = 1.0) */
  function ireZonesToSignal(zones) {
    return zones.map(function (z) {
      return { lo: z.lo / 100, hi: z.hi / 100, rgb: z.rgb, t: z.t };
    });
  }

  /* ---------- 5. арифметика сигнала ---------- */

  function ycbcr(r, g, b, m) {
    var y = m.kr * r + m.kg * g + m.kb * b;
    return { y: y, cb: (b - y) / (2 * (1 - m.kb)), cr: (r - y) / (2 * (1 - m.kr)) };
  }
  function lumaByte(r, g, b, m) { return m.kr * r + m.kg * g + m.kb * b; }
  /* код 0–255 → доля сигнала выбранного диапазона (может выйти за 0..1 — это правда) */
  function signal(v, range) { return (v - range.black) / (range.white - range.black); }
  /* доля сигнала → единицы отображения */
  function toUnit(sig, unit, range) {
    if (unit === "code8") return range.black + sig * (range.white - range.black);
    if (unit === "code10") return range.black === 16 ? 64 + sig * 876 : sig * 1023;
    return sig * 100;
  }
  var UNITS = {
    ire:    { name: "IRE",   digits: 1, min: 0, max: 100,  step: 20 },
    code8:  { name: "8 бит", digits: 0, min: 0, max: 255,  step: 20 },
    code10: { name: "10 бит", digits: 0, min: 0, max: 1023, step: 20 }
  };

  /* ---------- 6. один проход по кадру ---------- */
  /* Собирает разом waveform, гистограмму, вектроскоп и статистику: четыре
     отдельных прохода по кадру — это четыре чтения памяти вместо одного,
     а прибор обязан успевать за 50–60 кадрами в секунду. */

  function makeBuffers(wfW, wfH, vecS) {
    return {
      wf: new Uint16Array(wfW * wfH * 3),
      wfHue: new Uint32Array(wfW * wfH * 3),   /* сумма цвета трассы — режим Luma Color */
      hist: { y: new Uint32Array(256), r: new Uint32Array(256),
              g: new Uint32Array(256), b: new Uint32Array(256) },
      vec: new Uint32Array(vecS * vecS),
      vecHue: new Uint32Array(vecS * vecS * 3),
      stats: null,
      dim: { wfW: wfW, wfH: wfH, vecS: vecS }
    };
  }

  function analyze(px, w, h, o, buf) {
    var m = o.matrix, range = o.range;
    var wfW = buf.dim.wfW, wfH = buf.dim.wfH, vecS = buf.dim.vecS;
    var mode = o.wfMode, step = o.vecStep || 1;
    var wf = buf.wf, hist = buf.hist, vec = buf.vec, vhue = buf.vecHue, wfHue = buf.wfHue;
    var plane = wfW * wfH, laneW = (wfW / 3) | 0;
    var half = vecS / 2, black = range.black, span = range.white - range.black;
    var wantHue = mode === "lumaColor";
    /* окно шкалы: у legal-сигнала коды вне 16–235 дают сигнал за 0..1, и прибор
       обязан их показать (super-white и sub-black), а не прижимать к краю */
    var vLo = o.viewLo === undefined ? (range.black === 16 ? -0.1 : 0) : o.viewLo;
    var vHi = o.viewHi === undefined ? (range.black === 16 ? 1.1 : 1) : o.viewHi;
    var vSpan = vHi - vLo;

    var wantVecHue = o.vecColor !== false;
    wf.fill(0); vec.fill(0);
    if (wantVecHue) vhue.fill(0);
    if (wantHue) wfHue.fill(0);
    hist.y.fill(0); hist.r.fill(0); hist.g.fill(0); hist.b.fill(0);

    var minY = 1e9, maxY = -1e9, sumY = 0, n = 0, vecN = 0;
    var minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    var clipHi = 0, clipLo = 0, overWhite = 0, underBlack = 0, chanOut = 0;
    var sumR = 0, sumG = 0, sumB = 0;
    var isParade = mode === "parade", isYcc = mode === "ycc";
    var isLuma = mode === "luma" || mode === "lumaColor";

    /* Горячий цикл: вызовы функций и деления вынесены наружу — на кадре 960×540
       это 500 тысяч итераций, и каждая лишняя операция стоит кадров в секунду. */
    var kr = m.kr, kg = m.kg, kb = m.kb;
    var cbDiv = 2 * (1 - kb), crDiv = 2 * (1 - kr);
    var white = range.white, blackC = range.black;
    var wfScaleX = wfW / w, laneScaleX = laneW / w;
    var hi1 = wfH - 1, invSpan = 1 / vSpan;
    var needWf = o.needWf !== false;
    /* окно яркости: на трассу попадают только пиксели выбранной зоны (тени,
       средние, света). Статистика и гистограмма считаются по всему кадру —
       фильтр показывает, а не подменяет измерение (SCOPES_BASE §8в). */
    var zLo = o.zoneLo === undefined ? -1e9 : o.zoneLo;
    var zHi = o.zoneHi === undefined ? 1e9 : o.zoneHi;
    var zoneAll = zLo <= -1e8 && zHi >= 1e8;
    var invRange = 1 / span;

    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      var vecRow = (y % step) === 0;
      for (var x = 0; x < w; x++) {
        var i = row + x * 4;
        var r = px[i], g = px[i + 1], b = px[i + 2];

        hist.r[r]++; hist.g[g]++; hist.b[b]++;
        var ly = kr * r + kg * g + kb * b;
        var lyi = ly < 0 ? 0 : (ly > 255 ? 255 : (ly + 0.5) | 0);
        hist.y[lyi]++;
        sumY += ly; sumR += r; sumG += g; sumB += b; n++;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (g < minG) minG = g;
        if (g > maxG) maxG = g;
        if (b < minB) minB = b;
        if (b > maxB) maxB = b;
        /* клип пикселя — когда ВСЕ каналы уперлись в потолок или пол кода:
           у цветных полос синий канал равен нулю, и это не «чёрное в упор» */
        var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
        var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        if (mn >= 255) clipHi++;
        if (mx <= 0) clipLo++;
        /* отдельный счёт: хотя бы один канал за номинальной границей диапазона —
           для full это клип канала, для legal ещё и выход за 16/235 */
        var over = mx >= white, under = mn <= blackC;
        if (over) overWhite++;
        if (under) underBlack++;
        if (over || under) chanOut++;

        /* waveform: горизонталь кадра остаётся горизонталью прибора */
        if (needWf && (zoneAll || ((ly - black) * invRange >= zLo && (ly - black) * invRange <= zHi))) {
          var yy, idx;
          if (isLuma) {
            var cx = (x * wfScaleX) | 0;
            yy = ((1 - ((ly - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = yy * wfW + cx;
            if (wf[idx] < 65535) wf[idx]++;
            if (wantHue) {
              var h3 = idx * 3;
              wfHue[h3] += r; wfHue[h3 + 1] += g; wfHue[h3 + 2] += b;
            }
          } else if (isParade) {
            var base = (x * laneScaleX) | 0;
            yy = ((1 - ((r - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = yy * wfW + base;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - ((g - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane + yy * wfW + base + laneW;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - ((b - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane * 2 + yy * wfW + base + laneW * 2;
            if (wf[idx] < 65535) wf[idx]++;
          } else if (isYcc) {
            var yn = ly / 255;
            var cbv = (b / 255 - yn) / cbDiv + 0.5, crv = (r / 255 - yn) / crDiv + 0.5;
            var b2 = (x * laneScaleX) | 0;
            yy = ((1 - ((ly - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = yy * wfW + b2;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - (cbv - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane + yy * wfW + b2 + laneW;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - (crv - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane * 2 + yy * wfW + b2 + laneW * 2;
            if (wf[idx] < 65535) wf[idx]++;
          } else {                                   /* rgb overlay */
            var cx2 = (x * wfScaleX) | 0;
            yy = ((1 - ((r - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = yy * wfW + cx2;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - ((g - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane + yy * wfW + cx2;
            if (wf[idx] < 65535) wf[idx]++;
            yy = ((1 - ((b - black) / span - vLo) * invSpan) * hi1 + 0.5) | 0;
            if (yy < 0) yy = 0; else if (yy > hi1) yy = hi1;
            idx = plane * 2 + yy * wfW + cx2;
            if (wf[idx] < 65535) wf[idx]++;
          }
        }

        /* вектроскоп — по выборке: соседние пиксели дают ту же точку */
        if (vecRow && (x % step) === 0) {
          var yv = ly / 255;
          var cb2 = (b / 255 - yv) / cbDiv, cr2 = (r / 255 - yv) / crDiv;
          var vx = (half + cb2 * vecS + 0.5) | 0;
          var vy = (half - cr2 * vecS + 0.5) | 0;
          if (vx >= 0 && vx < vecS && vy >= 0 && vy < vecS) {
            var vi = vy * vecS + vx;
            vec[vi]++;
            if (wantVecHue) { var v3 = vi * 3; vhue[v3] += r; vhue[v3 + 1] += g; vhue[v3 + 2] += b; }
          }
          vecN++;
        }
      }
    }

    var sg = function (v) { return (v - black) / span; };
    buf.stats = {
      n: n, vecN: vecN, w: w, h: h,
      minSig: sg(minY), maxSig: sg(maxY), avgSig: sg(sumY / n),
      min: sg(minY) * 100, max: sg(maxY) * 100, avg: sg(sumY / n) * 100,
      minRGB: [minR, minG, minB], maxRGB: [maxR, maxG, maxB],
      avgRGB: [sumR / n, sumG / n, sumB / n],
      viewLo: vLo, viewHi: vHi,
      clipHigh: clipHi / n * 100, clipLow: clipLo / n * 100,
      chanHigh: overWhite / n * 100, chanLow: underBlack / n * 100,
      chanOut: chanOut / n * 100,
      /* старые имена оставлены: ими пользуется приёмка и внешние скрипты */
      overWhite: overWhite / n * 100, underBlack: underBlack / n * 100
    };
    return buf;
  }

  /* накопление, а не рисование поверх: яркость точки говорит, сколько пикселей
     кадра туда попало. Вход — доля сигнала (0 внизу поля, 1 наверху). */
  function plot(out, W, H, plane, x, sig, chan, lo, span) {
    if (x < 0 || x >= W) return -1;
    var y = Math.round((1 - (sig - lo) / span) * (H - 1));
    if (y < 0) y = 0; else if (y >= H) y = H - 1;
    var idx = chan * plane + y * W + x;
    if (out[idx] < 65535) out[idx]++;
    return idx;
  }

  /* ---------- 7. накопление → пиксели ---------- */
  /* Нормировка на «сколько пикселей кадра приходится на столбец прибора»:
     без неё одна и та же сцена в 4K и в 720p светилась бы по-разному, и человек
     крутил бы яркость трассы вместо того, чтобы смотреть на кадр. */

  /* Вид на пиксели картинки как на 32-битные слова: одна запись вместо четырёх
     байтовых. Порядок в слове — ABGR (little-endian); браузеров на big-endian
     в природе нет, а перестановку каналов ловит приёмка (test_pribory §трасса). */
  function pixelView(img) {
    if (!img._u32 || img._u32.length !== img.data.length >> 2) {
      img._u32 = new Uint32Array(img.data.buffer);
    }
    return img._u32;
  }

  function waveformToImage(wf, W, H, img, gain, mode, frameW, frameH) {
    var plane = W * H;
    var perCol = Math.max(1, (frameW / W) * frameH);
    var k = (gain * H / 4) / perCol;
    var mono = mode === "luma";
    /* поле прибора почти всё пустое: пустая ячейка гасится одной записью в
       32 бита вместо четырёх байтовых — на поле 1920×1080 это втрое дешевле */
    var u32 = pixelView(img), i;
    if (mono) {
      for (i = 0; i < plane; i++) {
        var c = wf[i];
        if (c === 0) { u32[i] = 0xff000000; continue; }
        var a = c * k * 255;
        if (a > 255) a = 255;
        u32[i] = 0xff000000 | (((226 * a / 255) | 0) << 16) | (((239 * a / 255) | 0) << 8) | ((245 * a / 255) | 0);
      }
    } else {
      for (i = 0; i < plane; i++) {
        var wr = wf[i], wg = wf[plane + i], wb = wf[plane * 2 + i];
        if ((wr | wg | wb) === 0) { u32[i] = 0xff000000; continue; }
        var ar = wr * k * 255, ag = wg * k * 255, ab = wb * k * 255;
        if (ar > 255) ar = 255;
        if (ag > 255) ag = 255;
        if (ab > 255) ab = 255;
        u32[i] = 0xff000000 | ((ab | 0) << 16) | ((ag | 0) << 8) | (ar | 0);
      }
    }
  }

  /* трасса, раскрашенная цветом самих пикселей (Luma Color у приборов):
     положение по яркости, цвет — средний цвет попавших пикселей */
  function waveformColorImage(wf, wfHue, W, H, img, gain, frameW, frameH) {
    var plane = W * H;
    var perCol = Math.max(1, (frameW / W) * frameH);
    var k = (gain * H / 4) / perCol;
    var u32 = pixelView(img);
    for (var i = 0; i < plane; i++) {
      var c = wf[i];
      if (c === 0) { u32[i] = 0xff000000; continue; }
      var a = c * k * 255;
      if (a > 255) a = 255;
      var h3 = i * 3, r = wfHue[h3] / c, g = wfHue[h3 + 1] / c, b = wfHue[h3 + 2] / c;
      var mx = Math.max(r, g, b) || 1;
      u32[i] = 0xff000000 | (((b / mx * a) | 0) << 16) | (((g / mx * a) | 0) << 8) | ((r / mx * a) | 0);
    }
  }

  /* вектроскоп: нормировка по числу выборок; colorize — красить точку средним
     цветом попавших пикселей (color trace на аппаратных приборах) */
  function vectorToImage(vec, vhue, S, img, gain, samples, colorize, zoom) {
    var d = img.data, half = S / 2, k = zoom || 1;
    var norm = Math.max(1, samples / 4096);
    var alpha = new Float32Array(S * S);
    var src = new Int32Array(S * S);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var sx = Math.round(half + (x - half) / k), sy = Math.round(half + (y - half) / k);
        var v = 0, i2 = -1;
        if (sx >= 0 && sx < S && sy >= 0 && sy < S) { i2 = sy * S + sx; v = vec[i2]; }
        var p = y * S + x;
        alpha[p] = v ? Math.min(255, (v / norm) * gain * 255) : 0;
        src[p] = v ? i2 : -1;
      }
    }
    /* ореол вокруг точки: у аппаратного вектроскопа точка светится с растеканием,
       и без него одиночная точка в поле 384×384 просто теряется. Накопление не
       трогаем — растекание только в картинке. */
    for (var y2 = 0; y2 < S; y2++) {
      for (var x2 = 0; x2 < S; x2++) {
        var p2 = y2 * S + x2, best = alpha[p2], bestSrc = src[p2];
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y2 + dy;
          if (yy < 0 || yy >= S) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x2 + dx;
            if (xx < 0 || xx >= S || (dx === 0 && dy === 0)) continue;
            var glow = alpha[yy * S + xx] * 0.5;
            if (glow > best) { best = glow; bestSrc = src[yy * S + xx]; }
          }
        }
        var o = p2 * 4;
        if (best > 0.5 && colorize && bestSrc >= 0 && vec[bestSrc]) {
          var n2 = vec[bestSrc], c3 = bestSrc * 3;
          var cr = vhue[c3] / n2, cg = vhue[c3 + 1] / n2, cb = vhue[c3 + 2] / n2;
          var mx = Math.max(cr, cg, cb) || 1;
          d[o] = cr / mx * best; d[o + 1] = cg / mx * best; d[o + 2] = cb / mx * best;
        } else {
          d[o] = 245 * best / 255; d[o + 1] = 239 * best / 255; d[o + 2] = 226 * best / 255;
        }
        d[o + 3] = 255;
      }
    }
  }

  /* ---------- 8. накладки на кадр ---------- */

  function applyFalseColor(px, n, lut, m) {
    for (var i = 0; i < n; i += 4) {
      var v = Math.round(lumaByte(px[i], px[i + 1], px[i + 2], m));
      if (v < 0) v = 0; else if (v > 255) v = 255;
      var o = v * 3;
      px[i] = lut[o]; px[i + 1] = lut[o + 1]; px[i + 2] = lut[o + 2];
    }
  }

  /* зебра: штриховка там, где сигнал выше порога (mode "over") или внутри окна
     вокруг него (mode "band" — зебра 1 у камер). Пороги — в долях сигнала. */
  function applyZebra(px, w, h, o) {
    var m = o.matrix, range = o.range, lo = o.lo, hi = o.hi === undefined ? 1e4 : o.hi;
    var period = o.period || 8, phase = o.phase || 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var s = signal(lumaByte(px[i], px[i + 1], px[i + 2], m), range);
        if (s < lo || s > hi) continue;
        if (((x + y + phase) % period) >= period / 2) continue;
        px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
      }
    }
  }

  /* фокус-пикинг: модуль градиента яркости (Собель) выше порога. Считается по
     тому кадру, который человек видит, — это подписано в документации. */
  function applyPeaking(px, w, h, o) {
    var m = o.matrix, thr = o.threshold * 255, col = o.rgb || [255, 60, 60];
    var lum = new Float32Array(w * h);
    for (var i = 0, p = 0; p < w * h; p++, i += 4) lum[p] = lumaByte(px[i], px[i + 1], px[i + 2], m);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var p0 = y * w + x;
        var gx = -lum[p0 - w - 1] - 2 * lum[p0 - 1] - lum[p0 + w - 1]
                 + lum[p0 - w + 1] + 2 * lum[p0 + 1] + lum[p0 + w + 1];
        var gy = -lum[p0 - w - 1] - 2 * lum[p0 - w] - lum[p0 - w + 1]
                 + lum[p0 + w - 1] + 2 * lum[p0 + w] + lum[p0 + w + 1];
        if (Math.sqrt(gx * gx + gy * gy) < thr) continue;
        var o4 = p0 * 4;
        px[o4] = col[0]; px[o4 + 1] = col[1]; px[o4 + 2] = col[2];
      }
    }
  }

  /* ---------- 9. пипетка ---------- */
  function probe(r, g, b, m, range, curveKey) {
    var c = ycbcr(r / 255, g / 255, b / 255, m);
    var sig = signal(lumaByte(r, g, b, m), range);
    var ang = Math.atan2(c.cr, c.cb) * 180 / Math.PI;
    if (ang < 0) ang += 360;
    var out = {
      rgb: [r, g, b], signal: sig, ire: sig * 100,
      y: c.y, cb: c.cb, cr: c.cr,
      sat: Math.sqrt(c.cb * c.cb + c.cr * c.cr), angle: ang
    };
    var cur = CURVES[curveKey];
    if (cur) {
      var scene = cur.from(Math.min(Math.max(sig, 0), 1));
      out.scene = scene;
      out.stops = scene > 0 ? Math.log(scene / 0.18) / Math.LN2 : -Infinity;
    }
    return out;
  }

  /* мишени цветных полос: считаются из матрицы, таблиц не держим (SCOPES_BASE §6) */
  function barTargets(matrixKey, level) {
    var m = MATRIX[matrixKey], lvl = level / 100;
    var bars = [["R", 1, 0, 0], ["Mg", 1, 0, 1], ["B", 0, 0, 1],
                ["Cy", 0, 1, 1], ["G", 0, 1, 0], ["Yl", 1, 1, 0]];
    return bars.map(function (t) {
      var c = ycbcr(t[1] * lvl, t[2] * lvl, t[3] * lvl, m);
      var ang = Math.atan2(c.cr, c.cb) * 180 / Math.PI;
      if (ang < 0) ang += 360;
      return { name: t[0], cb: c.cb, cr: c.cr, angle: ang,
               radius: Math.sqrt(c.cb * c.cb + c.cr * c.cr) };
    });
  }

  window.PobubnimScopes = {
    MATRIX: MATRIX, RANGE: RANGE, UNITS: UNITS, CURVES: CURVES,
    FC_IRE: FC_IRE, ARRI_EIS: ARRI_EIS, ARRI_LOGC3: ARRI_LOGC3,
    arriZones: arriZones, stopZones: stopZones, ireZones: ireZonesToSignal,
    buildLUT: buildLUT,
    ycbcr: ycbcr, luma: lumaByte, signal: signal, toUnit: toUnit,
    makeBuffers: makeBuffers, analyze: analyze,
    waveformToImage: waveformToImage, waveformColorImage: waveformColorImage,
    vectorToImage: vectorToImage,
    applyFalseColor: applyFalseColor, applyZebra: applyZebra, applyPeaking: applyPeaking,
    probe: probe, barTargets: barTargets,
    /* старое имя: IRE как доля сигнала в процентах */
    ire: function (v, range) { return signal(v, range) * 100; }
  };
})();
