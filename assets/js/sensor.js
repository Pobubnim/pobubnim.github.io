/* ПОБУБНИМ — доска «Как работает ISO»: матрица, Байер, ISO на посте.
   Канон фактов — docs/EDU_BASE.md §8е (сверено 26.08), формулы кривых — §8д.
   Три честных стенда:
   1) Колодцы: пуассоновский фотонный шум + шум чтения + усиление ISO + АЦП.
      Колодец игрушечный (2000 e⁻), чтобы шум был ВИДЕН — физика та же.
   2) Байер: настоящая мозаика RGGB по кадру и билинейная дебайеризация.
   3) «ISO на посте»: экспозиция в линейном свете / Offset на log (S-Log3) /
      Gain по дисплейному сигналу — считается LUT'ами через scope.js. */

(function () {
  /* ---------- общая математика (EDU_BASE §8д) ---------- */
  function inv709(v) { return v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45); }
  function f709(l) { l = Math.max(0, l); return l < 0.018 ? 4.5 * l : 1.099 * Math.pow(l, 0.45) - 0.099; }
  function slog3(x) {
    return x >= 0.01125
      ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023
      : (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023;
  }
  var SLOG3_CUT = 171.2102946929 / 1023;
  function slog3inv(v) {
    return v >= SLOG3_CUT
      ? Math.pow(10, (v * 1023 - 420) / 261.5) * 0.19 - 0.01
      : (v * 1023 - 95) * 0.01125 / (171.2102946929 - 95);
  }

  function gauss() { /* Бокс–Мюллер */
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function poisson(mean) { /* Кнут для малых, нормальное приближение для больших */
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss()));
    var L = Math.exp(-mean), k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  /* ================= СТЕНД 1: колодцы ================= */
  function mountWells(cfg) {
    var C = cfg.canvas, st = { light: 0, iso: 0 }; /* стопы света, стопы усиления */
    var FULL = 2000, READ = 6, COLS = 20, ROWS = 10;
    var ZONES = [
      { frac: 0.02, nm: "тени 2%" }, { frac: 0.10, nm: "середина 10%" },
      { frac: 0.35, nm: "света 35%" }, { frac: 0.90, nm: "белое 90%" }
    ];

    function sample() {
      var g = Math.pow(2, st.iso), out = [];
      for (var c = 0; c < COLS; c++) {
        var zone = ZONES[Math.floor(c / (COLS / ZONES.length))];
        for (var r = 0; r < ROWS; r++) {
          var mean = FULL * zone.frac * Math.pow(2, st.light);
          var e = Math.min(FULL, poisson(mean));            /* колодец переполнился = клип сенсора */
          var v = (e + READ * gauss()) * g;                  /* усиление ISO: сигнал И шум вместе */
          var d = Math.max(0, Math.min(1023, v * 1023 / FULL)); /* АЦП: свой потолок */
          out.push({ d: d, clip: e >= FULL || v * 1023 / FULL >= 1023, zone: Math.floor(c / (COLS / ZONES.length)) });
        }
      }
      return out;
    }

    function draw() {
      var W = C.width, H = C.height, ctx = C.getContext("2d");
      ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, W, H);
      var wells = sample();
      var PAD = 10, LBL = 26;
      var cw = (W - PAD * 2) / COLS, ch = (H - PAD - LBL) / ROWS;
      wells.forEach(function (w, i) {
        var c = Math.floor(i / ROWS), r = i % ROWS;
        var x = PAD + c * cw, y = PAD + r * ch;
        var lvl = Math.pow(w.d / 1023, 0.45); /* показ с гаммой, чтобы тени были видны */
        ctx.fillStyle = "rgba(245,239,226,0.07)";
        ctx.fillRect(x + 1, y + 1, cw - 3, ch - 3);
        ctx.fillStyle = w.clip ? "rgba(224,73,47,0.9)" : "rgba(245,239,226," + (0.14 + 0.8 * lvl) + ")";
        var bh = Math.max(1, (ch - 5) * lvl);
        ctx.fillRect(x + 1, y + ch - 2 - bh, cw - 3, bh);
      });
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(245,239,226,0.55)";
      ZONES.forEach(function (z, zi) {
        ctx.fillText(z.nm, PAD + (zi + 0.12) * (W - PAD * 2) / ZONES.length, H - 9);
      });

      /* честная статистика по нарисованному кадру */
      if (cfg.statEl) {
        var g = Math.pow(2, st.iso);
        var html = "";
        [0, 1].forEach(function (zi) { /* SNR теней и середины: среднее/разброс */
          var zs = wells.filter(function (w) { return w.zone === zi; }).map(function (w) { return w.d; });
          var m = zs.reduce(function (a, b) { return a + b; }, 0) / zs.length;
          var sd = Math.sqrt(zs.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / zs.length) || 1;
          html += "<span>SNR " + (zi ? "середины" : "теней") + " " + (m / sd).toFixed(1) + "</span>";
        });
        var clips = wells.filter(function (w) { return w.clip; }).length;
        html += "<span" + (clips ? ' class="warn"' : "") + ">клип " + (clips * 100 / wells.length).toFixed(0) + "% пикселей</span>";
        html += "<span" + (st.iso > 0 ? ' class="warn"' : "") + ">потолок клипа " + Math.round(FULL / g) + " e⁻ (" + (st.iso > 0 ? "−" + st.iso.toFixed(0) + " стопа запаса" : "полный колодец") + ")</span>";
        cfg.statEl.innerHTML = html;
      }
    }

    cfg.root.querySelectorAll("input[data-wells]").forEach(function (r) {
      r.addEventListener("input", function () {
        st[r.dataset.wells] = +r.value / 10;
        var sv = r.closest(".lab-row").querySelector(".sv");
        if (sv) sv.textContent = r.dataset.wells === "iso"
          ? "ISO " + Math.round(100 * Math.pow(2, st.iso))
          : (st.light > 0 ? "+" : "") + st.light.toFixed(1);
        draw();
      });
    });
    var re = cfg.root.querySelector("[data-resample]");
    if (re) re.addEventListener("click", draw);
    draw();
  }

  /* ================= СТЕНД 2: Байер ================= */
  function mountBayer(cfg) {
    var C = cfg.canvas, img = cfg.img, st = { mode: "scene" };
    var BW = 96, BH = 54;
    var work = document.createElement("canvas"); work.width = BW; work.height = BH;
    var src = null, mosaic = null; /* mosaic[i] = значение СВОЕГО канала пикселя */

    function chanAt(x, y) { /* RGGB: (0,0)=R (1,0)=G (0,1)=G (1,1)=B */
      return (y % 2) ? ((x % 2) ? 2 : 1) : ((x % 2) ? 1 : 0);
    }
    function prepare() {
      var ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, BW, BH);
      src = ctx.getImageData(0, 0, BW, BH);
      mosaic = new Float32Array(BW * BH);
      for (var y = 0; y < BH; y++) for (var x = 0; x < BW; x++) {
        var i = (y * BW + x);
        mosaic[i] = src.data[i * 4 + chanAt(x, y)];
      }
    }
    function mAt(x, y) { /* с зеркальным краем */
      x = Math.max(0, Math.min(BW - 1, x)); y = Math.max(0, Math.min(BH - 1, y));
      return mosaic[y * BW + x];
    }
    /* билинейная дебайеризация — базовый честный алгоритм (EDU_BASE §8е.5) */
    function debayerAt(x, y) {
      var ch = chanAt(x, y), v = mAt(x, y), r, g, b;
      var cross = (mAt(x - 1, y) + mAt(x + 1, y) + mAt(x, y - 1) + mAt(x, y + 1)) / 4;
      var diag = (mAt(x - 1, y - 1) + mAt(x + 1, y - 1) + mAt(x - 1, y + 1) + mAt(x + 1, y + 1)) / 4;
      var lr = (mAt(x - 1, y) + mAt(x + 1, y)) / 2, tb = (mAt(x, y - 1) + mAt(x, y + 1)) / 2;
      if (ch === 0) { r = v; g = cross; b = diag; }
      else if (ch === 2) { b = v; g = cross; r = diag; }
      else { g = v; if (y % 2) { r = tb; b = lr; } else { r = lr; b = tb; } }
      return [r, g, b];
    }

    function draw() {
      if (!mosaic) return;
      var out = work.getContext("2d").createImageData(BW, BH);
      for (var y = 0; y < BH; y++) for (var x = 0; x < BW; x++) {
        var i = (y * BW + x), o = i * 4, px;
        if (st.mode === "scene") px = [src.data[o], src.data[o + 1], src.data[o + 2]];
        else if (st.mode === "sensor") { var m = mosaic[i]; px = [m, m, m]; }
        else if (st.mode === "mosaic") {
          var ch = chanAt(x, y); px = [0, 0, 0]; px[ch] = mosaic[i];
        } else px = debayerAt(x, y);
        out.data[o] = px[0]; out.data[o + 1] = px[1]; out.data[o + 2] = px[2]; out.data[o + 3] = 255;
      }
      work.getContext("2d").putImageData(out, 0, 0);
      var ctx = C.getContext("2d");
      ctx.imageSmoothingEnabled = false; /* крупные пиксели: мозаику видно */
      ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, C.width, C.height);
      ctx.drawImage(work, 0, 0, C.width, C.height);
    }

    cfg.root.querySelectorAll("[data-bmode]").forEach(function (b) {
      b.addEventListener("click", function () {
        cfg.root.querySelectorAll("[data-bmode]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.mode = b.dataset.bmode;
        draw();
      });
    });
    function boot() { prepare(); draw(); }
    if (img.complete && img.naturalWidth) boot(); else img.addEventListener("load", boot);
  }

  /* ================= СТЕНД 3: ISO на посте ================= */
  function mountPost(cfg) {
    var st = { view: "waveform", stops: 0, method: "exposure" };
    var lut = new Float32Array(256), lutRef = new Float32Array(256);
    var LOG_STEP = Math.log10(2) * 261.5 / 1023; /* +1 стоп в S-Log3 = такой сдвиг сигнала */

    function apply(v, method, s) {
      if (method === "gain") return v * Math.pow(2, s);
      var L = inv709(v);
      if (method === "exposure") return f709(L * Math.pow(2, s));
      /* offset на log: кодируем честной S-Log3, сдвигаем, декодируем */
      var e = Math.min(1, slog3(L) + s * LOG_STEP);
      return f709(Math.max(0, slog3inv(e)));
    }
    function buildLuts() {
      for (var i = 0; i < 256; i++) {
        lut[i] = apply(i / 255, st.method, st.stops);
        lutRef[i] = apply(i / 255, "exposure", st.stops);
      }
    }
    function proc(px) {
      px[0] = Math.max(0, Math.min(255, lut[px[0]] * 255));
      px[1] = Math.max(0, Math.min(255, lut[px[1]] * 255));
      px[2] = Math.max(0, Math.min(255, lut[px[2]] * 255));
    }

    var board = PobubnimScope.create({
      img: cfg.img, canvases: cfg.canvases, state: st, process: proc,
      onStats: function (s) {
        if (!cfg.statEl) return;
        /* отличие метода от честной экспозиции — по всем входным уровням */
        var dSum = 0, dMax = 0;
        for (var i = 0; i < 256; i++) {
          var d = Math.abs(Math.min(1, Math.max(0, lut[i])) - Math.min(1, Math.max(0, lutRef[i]))) * 100;
          dSum += d; if (d > dMax) dMax = d;
        }
        var html = "<span>средняя " + s.avgIre.toFixed(0) + " IRE</span>";
        html += "<span>тени на " + s.loIre.toFixed(0) + " IRE</span>";
        html += "<span" + (s.highPct > 1 ? ' class="warn"' : "") + ">обрез светов " + s.highPct.toFixed(1) + "%</span>";
        html += "<span" + (dMax > 3 ? ' class="warn"' : "") + ">отличие от экспозиции: ср. " +
          (dSum / 256).toFixed(1) + " · макс " + dMax.toFixed(0) + " IRE</span>";
        cfg.statEl.innerHTML = html;
      }
    });

    function touch() { buildLuts(); board.update(); }

    cfg.root.querySelectorAll("[data-method]").forEach(function (b) {
      b.addEventListener("click", function () {
        cfg.root.querySelectorAll("[data-method]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.method = b.dataset.method;
        touch();
      });
    });
    cfg.root.querySelectorAll("[data-pview]").forEach(function (b) {
      b.addEventListener("click", function () {
        cfg.root.querySelectorAll("[data-pview]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.view = b.dataset.pview;
        board.update();
      });
    });
    var sl = cfg.root.querySelector("input[data-stops]");
    if (sl) sl.addEventListener("input", function () {
      st.stops = +sl.value / 10;
      var sv = sl.closest(".lab-row").querySelector(".sv");
      if (sv) sv.textContent = (st.stops > 0 ? "+" : "") + st.stops.toFixed(1);
      touch();
    });

    function boot() { touch(); }
    if (cfg.img.complete && cfg.img.naturalWidth) boot();
    else cfg.img.addEventListener("load", boot);
  }

  window.PobubnimSensor = { mountWells: mountWells, mountBayer: mountBayer, mountPost: mountPost };
})();
