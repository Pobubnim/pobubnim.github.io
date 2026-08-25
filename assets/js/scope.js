/* ПОБУБНИМ — движок интерактивных досок: НАСТОЯЩИЕ скоупы из пикселей кадра.
   Не имитация: кадр рисуется в canvas с обработкой, пиксели читаются
   getImageData и из них строятся Waveform / Parade / Vectorscope / Histogram.
   Канон чисел — docs/EDU_BASE.md §8б (IRE-якоря, scene/display-referred).
   API: PobubnimScope.create({img, view, canvases:{...}, onStats}) */

(function () {
  /* Rec.709 luma — тот же коэффициент, по которому строит яркость Resolve */
  function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  /* обработка пикселя: экспозиция в стопах, контраст вокруг 0.5, температура, насыщенность.
     Всё в 0..1, гамма-пространство дисплея (упрощение честное: правки те же,
     что делают колёса Resolve, но без перехода в линейный свет). */
  function processPixel(px, o) {
    var gain = Math.pow(2, o.exposure);          // 1 стоп = ×2
    var r = px[0] / 255 * gain, g = px[1] / 255 * gain, b = px[2] / 255 * gain;
    /* температура: тёплое = R вверх, B вниз */
    var t = o.temp / 100;
    r *= 1 + 0.35 * t; b *= 1 - 0.35 * t;
    /* контраст вокруг средне-серого 0.5 */
    var c = o.contrast;
    r = (r - 0.5) * c + 0.5; g = (g - 0.5) * c + 0.5; b = (b - 0.5) * c + 0.5;
    /* насыщенность вокруг luma */
    var l = luma(r, g, b), s = o.saturation;
    r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
    px[0] = Math.max(0, Math.min(255, r * 255));
    px[1] = Math.max(0, Math.min(255, g * 255));
    px[2] = Math.max(0, Math.min(255, b * 255));
  }

  function create(cfg) {
    var img = cfg.img;
    var frameC = cfg.canvases.frame, scopeC = cfg.canvases.scope;
    var work = document.createElement("canvas");   // уменьшенная копия для расчёта скоупа
    var WORK_W = 240;
    var state = { exposure: 0, contrast: 1, saturation: 1, temp: 0, view: "waveform" };

    function drawFrame() {
      var w = frameC.width, h = frameC.height;
      var ctx = frameC.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      var d = ctx.getImageData(0, 0, w, h);
      var px = [0, 0, 0];
      for (var i = 0; i < d.data.length; i += 4) {
        px[0] = d.data[i]; px[1] = d.data[i + 1]; px[2] = d.data[i + 2];
        processPixel(px, state);
        d.data[i] = px[0]; d.data[i + 1] = px[1]; d.data[i + 2] = px[2];
      }
      ctx.putImageData(d, 0, 0);
      return d;
    }

    /* пиксели для скоупа берём из уменьшенной копии — скоуп строится мгновенно */
    function workPixels() {
      var ratio = img.naturalHeight / img.naturalWidth || 0.5625;
      work.width = WORK_W; work.height = Math.round(WORK_W * ratio);
      var ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, work.width, work.height);
      var d = ctx.getImageData(0, 0, work.width, work.height);
      var px = [0, 0, 0];
      for (var i = 0; i < d.data.length; i += 4) {
        px[0] = d.data[i]; px[1] = d.data[i + 1]; px[2] = d.data[i + 2];
        processPixel(px, state);
        d.data[i] = px[0]; d.data[i + 1] = px[1]; d.data[i + 2] = px[2];
      }
      return d;
    }

    /* ---------- отрисовка скоупов ---------- */
    function clearScope(ctx) {
      ctx.fillStyle = "#0b0a09";
      ctx.fillRect(0, 0, scopeC.width, scopeC.height);
    }
    /* сетка IRE: 0 / 20 / 40 / 60 / 80 / 100 (Rec.709, display-referred) */
    function ireGrid(ctx, W, H) {
      ctx.font = "9px 'JetBrains Mono', monospace";
      for (var ire = 0; ire <= 100; ire += 20) {
        var y = H - (ire / 100) * H;
        ctx.strokeStyle = ire === 0 || ire === 100 ? "rgba(224,73,47,0.45)" : "rgba(245,239,226,0.14)";
        ctx.beginPath(); ctx.moveTo(26, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
        ctx.fillStyle = "rgba(245,239,226,0.45)";
        ctx.fillText(ire, 4, Math.min(H - 2, y + 3));
      }
    }
    function plotWaveform(ctx, d, W, H, channels) {
      var PAD = 26, w = work.width, h = work.height;
      ctx.globalCompositeOperation = "lighter";
      channels.forEach(function (ch) {
        ctx.fillStyle = ch.color;
        var x0 = PAD + ch.slot * ((W - PAD) / ch.slots);
        var colW = (W - PAD) / ch.slots;
        for (var x = 0; x < w; x++) {
          for (var y = 0; y < h; y++) {
            var i = (y * w + x) * 4;
            var v = ch.get(d.data[i], d.data[i + 1], d.data[i + 2]);
            var py = H - (v / 255) * H;
            ctx.fillRect(x0 + (x / w) * colW, py, 1, 1);
          }
        }
      });
      ctx.globalCompositeOperation = "source-over";
    }
    function drawVectorscope(ctx, d, W, H) {
      var cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 8;
      ctx.strokeStyle = "rgba(245,239,226,0.16)";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.stroke();
      /* линия скин-тона (I-line): кожа лежит при -Cb / +Cr, это 123° от оси +Cb —
         в наших осях (X = Cb вправо, Y = Cr вверх) она уходит влево-вверх */
      var ang = Math.PI * 123 / 180;
      var lx = cx + Math.cos(ang) * R, ly = cy - Math.sin(ang) * R;
      ctx.strokeStyle = "rgba(224,73,47,0.55)";
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = "rgba(224,73,47,0.85)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("SKIN", cx + Math.cos(ang) * R * 0.78 - 12, cy - Math.sin(ang) * R * 0.78 - 5);
      /* точки: U/V из YCbCr Rec.709 */
      ctx.fillStyle = "rgba(245,239,226,0.5)";
      for (var i = 0; i < d.data.length; i += 4) {
        var r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
        var y = luma(r, g, b);
        var u = (b - y) * 0.5389, v = (r - y) * 0.635;
        ctx.fillRect(cx + (u / 128) * R, cy - (v / 128) * R, 1.2, 1.2);
      }
    }
    function drawHistogram(ctx, d, W, H) {
      var bins = new Array(64).fill(0), max = 1;
      for (var i = 0; i < d.data.length; i += 4) {
        var v = luma(d.data[i], d.data[i + 1], d.data[i + 2]);
        var b = Math.min(63, Math.floor(v / 4));
        bins[b]++; if (bins[b] > max) max = bins[b];
      }
      var PAD = 26, bw = (W - PAD) / 64;
      ctx.fillStyle = "rgba(245,239,226,0.6)";
      bins.forEach(function (n, i) {
        var bh = (n / max) * (H - 6);
        ctx.fillRect(PAD + i * bw, H - bh, bw - 0.7, bh);
      });
      ireGrid(ctx, W, H);
    }

    function drawScope(d) {
      var ctx = scopeC.getContext("2d");
      var W = scopeC.width, H = scopeC.height;
      clearScope(ctx);
      if (state.view === "waveform") {
        ireGrid(ctx, W, H);
        plotWaveform(ctx, d, W, H, [{ color: "rgba(245,239,226,0.32)", slot: 0, slots: 1, get: luma }]);
      } else if (state.view === "parade") {
        ireGrid(ctx, W, H);
        plotWaveform(ctx, d, W, H, [
          { color: "rgba(224,73,47,0.42)", slot: 0, slots: 3, get: function (r) { return r; } },
          { color: "rgba(127,176,105,0.42)", slot: 1, slots: 3, get: function (r, g) { return g; } },
          { color: "rgba(74,111,224,0.5)", slot: 2, slots: 3, get: function (r, g, b) { return b; } }
        ]);
      } else if (state.view === "vector") {
        drawVectorscope(ctx, d, W, H);
      } else {
        drawHistogram(ctx, d, W, H);
      }
    }

    /* ---------- статистика кадра: клиппинг и средний IRE ---------- */
    function stats(d) {
      var lo = 0, hi = 0, sum = 0, n = 0;
      for (var i = 0; i < d.data.length; i += 4) {
        var v = luma(d.data[i], d.data[i + 1], d.data[i + 2]);
        if (v <= 1) lo++; if (v >= 254) hi++;
        sum += v; n++;
      }
      return {
        lowPct: (lo / n) * 100, highPct: (hi / n) * 100,
        avgIre: (sum / n / 255) * 100
      };
    }

    var raf = null;
    function update() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        drawFrame();
        var d = workPixels();
        drawScope(d);
        if (cfg.onStats) cfg.onStats(stats(d), state);
      });
    }

    return {
      set: function (k, v) { state[k] = v; update(); },
      get: function (k) { return state[k]; },
      reset: function () {
        state.exposure = 0; state.contrast = 1; state.saturation = 1; state.temp = 0;
        update();
      },
      update: update
    };
  }

  window.PobubnimScope = { create: create };
})();
