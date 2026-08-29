/* ПОБУБНИМ — приборы онлайн: рабочая станция поверх ядра scopes-core.js.
   Источник кадра: файл, захват экрана, камера или демо-полосы. Всё считается
   в браузере и никуда не отправляется. Канон формул — docs/SCOPES_BASE.md,
   приёмка — tools/test_pribory.py. */

(function () {
  "use strict";
  var S = window.PobubnimScopes;
  if (!S) return;

  /* поля приборов: фиксированные, чтобы показания не зависели от размера окна */
  /* поля анализа: подгоняются под размер окон приборов (ensureBuffers) */
  var WF_W = 768, WF_H = 384, VEC_S = 384;

  var SCOPES = [
    { id: "wf-luma",   name: "Waveform · яркость",     kind: "wf", wf: "luma" },
    { id: "wf-color",  name: "Waveform · цветная трасса", kind: "wf", wf: "lumaColor" },
    { id: "wf-rgb",    name: "Waveform · RGB вместе",  kind: "wf", wf: "rgb" },
    { id: "wf-parade", name: "Парад RGB",              kind: "wf", wf: "parade" },
    { id: "wf-ycc",    name: "Парад Y′CbCr",           kind: "wf", wf: "ycc" },
    { id: "hist",      name: "Гистограмма",            kind: "hist" },
    { id: "vector",    name: "Вектроскоп",             kind: "vector" },
    { id: "fc",        name: "False color",            kind: "fc" },
    { id: "frame",     name: "Кадр (зебра, пикинг)",   kind: "frame" }
  ];

  var QUALITY = { fast: 480, work: 960, max: 1440, ultra: 1920 };
  var QUALITY_STEPS = [480, 960, 1440, 1920];
  /* «авто»: кадр анализируется в том разрешении, в котором прибор его рисует —
     тогда трасса идёт пиксель в пиксель. Меньше окно — дешевле кадр. */
  var wantAnalysisW = 960;
  function analysisWidth() {
    if (st.quality !== "auto") return QUALITY[st.quality] || 960;
    for (var i = 0; i < QUALITY_STEPS.length; i++) {
      /* потолок «авто» — 1440: на экране с двойной плотностью поле прибора
         просит 2–3 тысячи столбцов, а это уже 50 мс на кадр. 1920 остаётся,
         но включается руками, когда важнее точность, а не плавность */
      if (QUALITY_STEPS[i] >= wantAnalysisW || QUALITY_STEPS[i] >= 1440) return QUALITY_STEPS[i];
    }
    return 1440;
  }

  /* окно яркости для трассы (в долях сигнала): показывает нужную зону, не
     подменяя измерение — числа и гистограмма всегда по всему кадру */
  var ZONES = {
    all:  null,
    low:  { lo: -1e9, hi: 0.25 },
    mid:  { lo: 0.25, hi: 0.75 },
    high: { lo: 0.75, hi: 1e9 }
  };

  var DEF = {
    matrix: "709", range: "full", unit: "ire", curve: "709",
    gain: 2.2, histLog: true, histY: false, zone: "all",
    vecZoom: 1, vecColor: false, targets: 75, vecStep: 2,
    fcScale: "ire", fcEI: 800,
    zebra: false, zebraLevel: 0.95, zebraBand: false,
    peak: false, peakLevel: 0.35,
    quality: "auto", fps: 30,
    layout: 4, panel: true,
    slots: ["wf-luma", "vector", "hist", "frame"]
  };

  var st = load();
  var CROP = null;                        /* {x, y, w, h} в долях кадра */

  function load() {
    var s = {};
    for (var k in DEF) if (DEF.hasOwnProperty(k)) s[k] = DEF[k];
    /* телефон: два прибора, лёгкий анализ и убранная панель — иначе окна
       превращаются в полоски, а батарея тает */
    if (window.innerWidth < 1000) { s.panel = false; }
    if (window.innerWidth < 900) { s.layout = 2; s.quality = "fast"; s.slots = ["wf-luma", "frame", "vector", "hist"]; }
    try {
      var raw = localStorage.getItem("pobubnim-pribory-v1");
      if (raw) {
        var got = JSON.parse(raw);
        for (var j in got) if (s.hasOwnProperty(j)) s[j] = got[j];
      }
    } catch (e) { /* приватный режим — работаем на умолчаниях */ }
    return s;
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem("pobubnim-pribory-v1", JSON.stringify(st)); } catch (e) {}
    }, 300);
  }

  var el = function (id) { return document.getElementById(id); };
  var app = el("sc-app");
  if (!app) return;

  /* ---------------- источник ---------------- */

  var video = el("sc-video");
  var still = null, stream = null, frozen = null;
  var sourceName = "демо · цветные полосы 75%";

  var work = document.createElement("canvas");
  var wctx = work.getContext("2d", { willReadFrequently: true });
  wctx.imageSmoothingEnabled = false;

  var buf = S.makeBuffers(WF_W, WF_H, VEC_S);
  var wfImg = new ImageData(WF_W, WF_H);
  var vecImg = new ImageData(VEC_S, VEC_S);
  /* промежуточные полотна: накопление кладётся сюда, а на экран растягивается
     под размер окна — разметка при этом рисуется в разрешении экрана */
  var wfOff = document.createElement("canvas"); wfOff.width = WF_W; wfOff.height = WF_H;
  var vecOff = document.createElement("canvas"); vecOff.width = VEC_S; vecOff.height = VEC_S;
  var fcLut = null, fcZones = null;

  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  function setSource(label) { sourceName = label; frozen = null; setFreezeBtn(); }

  function useStream(s, label) {
    stopStream(); still = null; stream = s;
    video.srcObject = s; video.removeAttribute("src");
    video.play().catch(function () {});
    setSource(label);
    showTransport(false);
  }

  function note(text) {
    var n = el("sc-note");
    if (!n) return;
    n.textContent = text;
    n.classList.add("on");
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.classList.remove("on"); }, 5000);
  }

  el("sc-screen").addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      note("Захват экрана этот браузер не умеет — откройте файл или включите камеру.");
      return;
    }
    navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 60, resizeMode: "none" }, audio: false
    }).then(function (s) {
      useStream(s, "захват экрана");
      note("Выделите окно плеера кнопкой «Кроп» — прибор будет считать только его.");
    }).catch(function () { note("Захват отменён."); });
  });

  el("sc-camera").addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      note("Камера этому браузеру недоступна.");
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, facingMode: { ideal: "environment" } }, audio: false
    }).then(function (s) { useStream(s, "камера устройства"); })
      .catch(function () { note("Камера не открылась — проверьте разрешение в браузере."); });
  });

  el("sc-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    stopStream();
    if (f.type.indexOf("image") === 0) {
      var im = new Image();
      im.onload = function () {
        still = im; video.removeAttribute("src"); video.srcObject = null;
        setSource("файл · " + f.name); showTransport(false);
      };
      im.src = url;
    } else {
      still = null; video.srcObject = null;
      video.src = url; video.loop = true;
      video.play().catch(function () {});
      setSource("файл · " + f.name);
      showTransport(true);
    }
  });

  /* транспорт для видеофайла: пауза, перемотка, шаг кадра */
  var transport = el("sc-transport");
  function showTransport(on) { transport.classList.toggle("on", !!on); }
  function clock(t) {
    if (!isFinite(t)) return "0:00";
    var m = (t / 60) | 0, s = (t - m * 60) | 0;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  el("sc-play").addEventListener("click", function () {
    if (video.paused) { video.play(); this.textContent = "Пауза"; }
    else { video.pause(); this.textContent = "Играть"; }
  });
  var seek = el("sc-seek");
  seek.addEventListener("input", function () {
    if (video.duration) video.currentTime = video.duration * seek.value / 1000;
  });
  video.addEventListener("timeupdate", function () {
    if (video.duration && document.activeElement !== seek) {
      seek.value = Math.round(video.currentTime / video.duration * 1000);
    }
    var c = el("sc-clock");
    if (c) c.textContent = clock(video.currentTime) + " / " + clock(video.duration);
  });
  el("sc-prev").addEventListener("click", function () { video.pause(); video.currentTime = Math.max(0, video.currentTime - 1 / 25); el("sc-play").textContent = "Играть"; });
  el("sc-next").addEventListener("click", function () { video.pause(); video.currentTime += 1 / 25; el("sc-play").textContent = "Играть"; });

  /* ---------------- слоты приборов ---------------- */

  var grid = el("sc-grid");
  var slots = [];

  function buildSlots() {
    grid.innerHTML = "";
    slots = [];
    for (var i = 0; i < 4; i++) {
      var d = document.createElement("div");
      d.className = "sc-slot" + (i >= st.layout ? " off" : "");
      var head = document.createElement("div");
      head.className = "sc-slot-head";
      var sel = document.createElement("select");
      sel.setAttribute("aria-label", "Прибор в окне " + (i + 1));
      SCOPES.forEach(function (s) {
        var o = document.createElement("option");
        o.value = s.id; o.textContent = s.name;
        sel.appendChild(o);
      });
      sel.value = st.slots[i] || SCOPES[0].id;
      var note2 = document.createElement("span");
      note2.className = "sc-slot-note";
      head.appendChild(sel); head.appendChild(note2);
      var wrap = document.createElement("div");
      wrap.className = "sc-canvas-wrap";
      var cv = document.createElement("canvas");
      wrap.appendChild(cv);
      var legend = document.createElement("div");
      legend.className = "sc-legend";
      wrap.appendChild(legend);
      d.appendChild(head); d.appendChild(wrap);
      grid.appendChild(d);

      var slot = { box: d, sel: sel, canvas: cv, ctx: cv.getContext("2d"),
                   note: note2, legend: legend, wrap: wrap, index: i };
      (function (sl) {
        sel.addEventListener("change", function () {
          st.slots[sl.index] = sel.value; save();
          sl.box.dataset.kind = scopeOf(sel.value).kind;
          sl.legend.innerHTML = "";
          render(true);
        });
      })(slot);
      d.dataset.kind = scopeOf(sel.value).kind;
      slots.push(slot);
    }
    grid.className = "sc-grid lay-" + st.layout;
    bindFrameInteractions();
  }

  function scopeOf(id) {
    for (var i = 0; i < SCOPES.length; i++) if (SCOPES[i].id === id) return SCOPES[i];
    return SCOPES[0];
  }

  /* ---------------- захват кадра ---------------- */

  function frameReady() {
    if (frozen) return true;
    if (still) return true;
    return video.readyState >= 2 && video.videoWidth > 0;
  }

  function grab() {
    if (frozen) return frozen;
    var src = still || video;
    var sw = still ? (still.naturalWidth || still.width) : video.videoWidth;
    var sh = still ? (still.naturalHeight || still.height) : video.videoHeight;
    if (!sw || !sh) return null;

    var cx = 0, cy = 0, cw = sw, ch = sh;
    if (CROP) {
      cx = Math.round(CROP.x * sw); cy = Math.round(CROP.y * sh);
      cw = Math.max(2, Math.round(CROP.w * sw)); ch = Math.max(2, Math.round(CROP.h * sh));
    }
    var target = analysisWidth();
    var ar = cw / ch;
    var w = Math.min(cw, target), h = Math.round(w / ar);
    if (h < 2) h = 2;
    if (w !== work.width || h !== work.height) {
      work.width = w; work.height = h;
      wctx.imageSmoothingEnabled = false;   /* прибор смотрит на реальные пиксели */
    }
    wctx.imageSmoothingEnabled = false;
    wctx.drawImage(src, cx, cy, cw, ch, 0, 0, w, h);
    return wctx.getImageData(0, 0, w, h);
  }

  /* ---------------- разметка приборов ---------------- */

  function unitLabel() { return S.UNITS[st.unit].name; }

  function fmtUnit(sig) {
    var u = S.UNITS[st.unit];
    return S.toUnit(sig, st.unit, S.RANGE[st.range]).toFixed(u.digits);
  }

  /* Приборы считаются в своём разрешении, а рисуются в разрешении экрана:
     иначе на телефоне подписи шкалы сжимаются в нечитаемую кашу, а на большом
     мониторе трасса становится лесенкой. */
  function screenSize(slot, square) {
    var r = slot.canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(200, Math.round((r.width || 400) * dpr));
    var h = Math.max(140, Math.round((r.height || 300) * dpr));
    if (square) { w = h = Math.min(w, h); }
    if (slot.canvas.width !== w || slot.canvas.height !== h) {
      slot.canvas.width = w; slot.canvas.height = h;
    }
    return { W: w, H: h, k: dpr };
  }

  /* поля анализа подгоняются под размер окна прибора: буфер пересоздаётся
     только при заметном изменении, чтобы не дёргаться на каждый пиксель */
  function ensureBuffers(wfW, wfH, vecS) {
    /* поле прибора равно окну ПИКСЕЛЬ В ПИКСЕЛЬ: раньше размер округлялся до
       32, и трасса всегда шла через интерполяцию — тонкие детали мылились.
       Размер окна между кадрами постоянен, поэтому буфер пересоздаётся только
       при настоящем изменении раскладки. */
    wfW = Math.min(2048, Math.max(320, Math.round(wfW)));
    wfH = Math.min(1152, Math.max(192, Math.round(wfH)));
    vecS = Math.min(768, Math.max(240, Math.round(vecS)));
    if (wfW === WF_W && wfH === WF_H && vecS === VEC_S) return;
    WF_W = wfW; WF_H = wfH; VEC_S = vecS;
    buf = S.makeBuffers(WF_W, WF_H, VEC_S);
    extraBufs = {};
    wfImg = new ImageData(WF_W, WF_H);
    vecImg = new ImageData(VEC_S, VEC_S);
    wfOff.width = WF_W; wfOff.height = WF_H;
    vecOff.width = VEC_S; vecOff.height = VEC_S;
    markDirty();
  }

  function viewWindow() {
    var s = lastStats;
    var lo = s && s.viewLo !== undefined ? s.viewLo : (st.range === "legal" ? -0.1 : 0);
    var hi = s && s.viewHi !== undefined ? s.viewHi : (st.range === "legal" ? 1.1 : 1);
    return { lo: lo, hi: hi, span: hi - lo };
  }

  function drawScale(ctx, W, H, k, lanes, labels, ycc) {
    var v = viewWindow();
    var yOf = function (sig) { return Math.round((1 - (sig - v.lo) / v.span) * (H - 1)) + 0.5; };
    var x0 = Math.round(34 * k);
    ctx.save();
    ctx.font = Math.round(11 * k) + "px ui-monospace, monospace";
    ctx.lineWidth = Math.max(1, k * 0.75);
    ctx.fillStyle = "#060605";
    ctx.fillRect(0, 0, x0, H);
    /* зоны за номинальным чёрным и белым: у legal-сигнала там живут sub-black и
       super-white, и прибор обязан их показывать, а не прятать */
    ctx.fillStyle = "rgba(255, 80, 60, 0.05)";
    if (v.lo < 0) ctx.fillRect(x0, yOf(0), W - x0, H - yOf(0));
    if (v.hi > 1) ctx.fillRect(x0, 0, W - x0, yOf(1));

    ctx.textAlign = "right";
    for (var pc = -20; pc <= 120; pc += 10) {
      var sig = pc / 100;
      if (sig < v.lo - 1e-9 || sig > v.hi + 1e-9) continue;
      var y = yOf(sig);
      var major = pc % 20 === 0;
      var edge = pc === 0 || pc === 100;
      ctx.strokeStyle = edge ? "rgba(245,239,226,0.3)"
                     : major ? "rgba(245,239,226,0.14)" : "rgba(245,239,226,0.07)";
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(W, y); ctx.stroke();
      if (major) {
        ctx.fillStyle = edge ? "rgba(245,239,226,0.72)" : "rgba(245,239,226,0.45)";
        ctx.fillText(String(Math.round(S.toUnit(sig, st.unit, S.RANGE[st.range]))),
                     x0 - 6 * k, Math.min(H - 3, y + 4 * k));
      }
    }
    ctx.textAlign = "left";
    if (lanes > 1) {
      var laneW = (W - x0) / lanes;
      ctx.strokeStyle = "rgba(245,239,226,0.2)";
      for (var i = 1; i < lanes; i++) {
        var x = Math.round(x0 + laneW * i) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      /* у парада Y′CbCr нулевая цветность лежит посередине поля */
      if (ycc) {
        var y0 = yOf(0.5);
        ctx.strokeStyle = "rgba(245,239,226,0.22)";
        ctx.setLineDash([3 * k, 3 * k]);
        ctx.beginPath(); ctx.moveTo(x0 + laneW, y0); ctx.lineTo(W, y0); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (labels) {
        ctx.fillStyle = "rgba(245,239,226,0.55)";
        for (var j = 0; j < labels.length; j++) {
          ctx.fillText(labels[j], x0 + laneW * j + 7 * k, 15 * k);
        }
      }
    }
    ctx.restore();
    return x0;
  }

  function drawVectorGrid(ctx, size, k) {
    var half = size / 2, zoom = st.vecZoom;
    ctx.save();
    ctx.lineWidth = Math.max(1, k * 0.75);
    ctx.strokeStyle = "rgba(245,239,226,0.12)";
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(size, half); ctx.stroke();
    [0.125, 0.25, 0.375, 0.5].forEach(function (r) {
      ctx.beginPath(); ctx.arc(half, half, r * size * zoom, 0, Math.PI * 2); ctx.stroke();
    });

    /* линия кожи 123° (EDU_BASE §8б.4а) */
    var a = 123 * Math.PI / 180;
    ctx.strokeStyle = "rgba(240,214,150,0.5)";
    ctx.setLineDash([4 * k, 4 * k]);
    ctx.beginPath(); ctx.moveTo(half, half);
    ctx.lineTo(half + Math.cos(a) * half, half - Math.sin(a) * half);
    ctx.stroke();
    ctx.setLineDash([]);

    /* мишени с боксами допуска ±5° и ±5% насыщенности (SCOPES_BASE §6) */
    ctx.font = Math.round(11 * k) + "px ui-monospace, monospace";
    S.barTargets(st.matrix, st.targets).forEach(function (t) {
      var ang = t.angle * Math.PI / 180, rad = t.radius * size * zoom;
      var d = 5 * Math.PI / 180;
      var pts = [[ang - d, rad * 0.95], [ang + d, rad * 0.95], [ang + d, rad * 1.05], [ang - d, rad * 1.05]];
      ctx.strokeStyle = "rgba(245,239,226,0.45)";
      ctx.beginPath();
      pts.forEach(function (pt, i) {
        var x = half + Math.cos(pt[0]) * pt[1], y = half - Math.sin(pt[0]) * pt[1];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "rgba(245,239,226,0.6)";
      ctx.fillText(t.name, half + Math.cos(ang) * (rad + 14 * k) - 5 * k,
                           half - Math.sin(ang) * (rad + 14 * k) + 4 * k);
    });
    ctx.restore();
  }

  function drawHistogram(ctx, W, Hfull, k, hist) {
    var foot = Math.round(18 * k), H = Hfull - foot;
    ctx.fillStyle = "#060605";
    ctx.fillRect(0, 0, W, Hfull);
    var chans = [
      { d: hist.r, c: "rgba(224,73,47,0.78)" },
      { d: hist.g, c: "rgba(127,176,105,0.78)" },
      { d: hist.b, c: "rgba(74,111,224,0.82)" }
    ];
    if (st.histY) chans = [{ d: hist.y, c: "rgba(245,239,226,0.8)" }];
    var peak = 1;
    chans.forEach(function (ch) {
      for (var i = 0; i < 256; i++) if (ch.d[i] > peak) peak = ch.d[i];
    });
    var scale = st.histLog
      ? function (v) { return Math.log1p(v) / Math.log1p(peak); }
      : function (v) { return v / peak; };
    ctx.globalCompositeOperation = st.histY ? "source-over" : "lighter";
    var bw = W / 256;
    chans.forEach(function (ch) {
      ctx.fillStyle = ch.c;
      for (var i = 0; i < 256; i++) {
        var bh = scale(ch.d[i]) * (H - 2);
        if (bh > 0) ctx.fillRect(i * bw, H - bh, Math.max(1, bw), bh);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    /* границы номинального диапазона — куда сигнал не должен вылезать */
    var r = S.RANGE[st.range];
    ctx.lineWidth = Math.max(1, k * 0.75);
    ctx.strokeStyle = "rgba(255,120,90,0.35)";
    [r.black, r.white].forEach(function (v) {
      var x = Math.round(v * bw) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });
    /* шкала снизу — подписи вне поля графика, в выбранных единицах */
    ctx.fillStyle = "#0a0a09";
    ctx.fillRect(0, H, W, foot);
    ctx.font = Math.round(10.5 * k) + "px ui-monospace, monospace";
    ctx.fillStyle = "rgba(245,239,226,0.45)";
    ctx.textAlign = "center";
    [0, 64, 128, 192, 255].forEach(function (code) {
      var val = S.toUnit(S.signal(code, r), st.unit, r);
      ctx.fillText(val.toFixed(S.UNITS[st.unit].digits),
                   Math.min(W - 18 * k, Math.max(18 * k, code * bw)), H + 13 * k);
    });
    ctx.textAlign = "left";
  }

  /* ---------------- false color ---------------- */

  function fcRebuild() {
    var range = S.RANGE[st.range];
    if (st.fcScale === "arri") fcZones = S.arriZones(Number(st.fcEI), st.range);
    else if (st.fcScale === "stops") fcZones = S.stopZones(st.curve);
    else fcZones = S.ireZones(S.FC_IRE);
    fcLut = S.buildLUT(fcZones, range);
  }

  function fcLegendHTML() {
    return fcZones.map(function (z) {
      return '<span><i style="background:rgb(' + z.rgb.join(",") + ')"></i>' + z.t + "</span>";
    }).join("");
  }

  /* ---------------- отрисовка ---------------- */

  var fps = { t: 0, n: 0, val: 0 };
  var lastStats = null;

  function needsOf() {
    var need = { wf: null, hist: false, vec: false, frame: false, fc: false };
    for (var i = 0; i < st.layout; i++) {
      var sc = scopeOf(slots[i].sel.value);
      if (sc.kind === "wf") need.wf = need.wf || sc.wf;
      if (sc.kind === "hist") need.hist = true;
      if (sc.kind === "vector") need.vec = true;
      if (sc.kind === "frame") need.frame = true;
      if (sc.kind === "fc") need.fc = true;
    }
    return need;
  }

  var dirty = true, lastKey = null;
  function markDirty() { dirty = true; }

  /* окно яркости трассы: приборы показывают только выбранную зону */
  function zoneOpts(o) {
    var z = ZONES[st.zone];
    if (z) { o.zoneLo = z.lo; o.zoneHi = z.hi; }
    return o;
  }

  function render(force) {
    if (!frameReady()) return;
    /* статичный кадр не надо пересчитывать 30 раз в секунду: это греет машину
       и сажает батарею телефона. Живой источник опознаётся по времени кадра. */
    var key = frozen ? "frozen" : still ? "still" : (video.currentTime + "/" + video.readyState);
    if (!force && !dirty && key === lastKey) return;
    lastKey = key; dirty = false;

    var d = grab();
    if (!d) return;

    /* поля приборов — под размер окон, которые сейчас открыты, но не шире
       самого кадра: иначе часть столбцов прибора остаётся пустой и сплошная
       трасса рассыпается в пунктир */
    var wantWf = null, wantVec = null;
    for (var q = 0; q < st.layout; q++) {
      var kind = scopeOf(slots[q].sel.value).kind;
      var box = slots[q].canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      if (kind === "wf") {
        wantWf = { w: Math.min(box.width * dpr - 34 * dpr, work.width), h: box.height * dpr };
        /* «авто» смотрит на поле прибора: столько столбцов кадра и нужно */
        wantAnalysisW = Math.round(box.width * dpr - 34 * dpr);
      }
      if (kind === "vector") wantVec = Math.min(box.width, box.height) * dpr;
    }
    ensureBuffers(wantWf ? wantWf.w : WF_W, wantWf ? wantWf.h : WF_H, wantVec || VEC_S);

    var m = S.MATRIX[st.matrix], range = S.RANGE[st.range];
    var need = needsOf();
    var modes = {};
    for (var i = 0; i < st.layout; i++) {
      var sc = scopeOf(slots[i].sel.value);
      if (sc.kind === "wf") modes[sc.wf] = true;
    }
    var modeList = Object.keys(modes);
    var primary = modeList[0] || "luma";

    S.analyze(d.data, work.width, work.height,
      zoneOpts({ matrix: m, range: range, wfMode: primary, needWf: !!need.wf,
        vecColor: st.vecColor, vecStep: need.vec ? st.vecStep : 64 }), buf);
    lastStats = buf.stats;

    /* второй режим waveform в другом окне — отдельный проход (редкий случай) */
    var extra = {};
    for (var k2 = 1; k2 < modeList.length; k2++) {
      var b2 = extraBuf(modeList[k2]);
      S.analyze(d.data, work.width, work.height,
        zoneOpts({ matrix: m, range: range, wfMode: modeList[k2], needWf: true,
          vecColor: false, vecStep: 64 }), b2);
      extra[modeList[k2]] = b2;
    }

    for (var s2 = 0; s2 < st.layout; s2++) drawSlot(slots[s2], d, primary, extra);

    drawPreview();
    updateNumbers();
    var now = performance.now();
    fps.n++;
    if (now - fps.t > 500) { fps.val = Math.round(fps.n * 1000 / (now - fps.t)); fps.n = 0; fps.t = now; }
    updateSignature();
    void force;
  }

  var extraBufs = {};
  function extraBuf(mode) {
    if (!extraBufs[mode]) extraBufs[mode] = S.makeBuffers(WF_W, WF_H, 8);
    return extraBufs[mode];
  }

  function drawSlot(slot, d, primary, extra) {
    var sc = scopeOf(slot.sel.value);
    var ctx = slot.ctx;

    if (sc.kind === "wf") {
      var sz = screenSize(slot, false);
      var b = sc.wf === primary ? buf : (extra[sc.wf] || buf);
      if (sc.wf === "lumaColor") {
        S.waveformColorImage(b.wf, b.wfHue, WF_W, WF_H, wfImg, st.gain, work.width, work.height);
      } else {
        S.waveformToImage(b.wf, WF_W, WF_H, wfImg, st.gain,
          sc.wf === "luma" ? "luma" : "rgb", work.width, work.height);
      }
      wfOff.getContext("2d").putImageData(wfImg, 0, 0);
      ctx.fillStyle = "#060605";
      ctx.fillRect(0, 0, sz.W, sz.H);
      var gut = Math.round(34 * sz.k);
      /* поле прибора равно окну — рисуем один к одному: интерполяция размывает
         тонкую трассу, а именно по её толщине читают шум и клип */
      ctx.imageSmoothingEnabled = (sz.W - gut) !== WF_W || sz.H !== WF_H;
      ctx.drawImage(wfOff, gut, 0, sz.W - gut, sz.H);
      var lanes = (sc.wf === "parade" || sc.wf === "ycc") ? 3 : 1;
      var labels = sc.wf === "parade" ? ["R", "G", "B"] : (sc.wf === "ycc" ? ["Y′", "Cb", "Cr"] : null);
      drawScale(ctx, sz.W, sz.H, sz.k, lanes, labels, sc.wf === "ycc");
      slot.note.textContent = unitLabel() + " · " + S.RANGE[st.range].short +
        (sc.wf === "ycc" ? " · Cb/Cr ±0,5" : "") + zoneNote();

    } else if (sc.kind === "hist") {
      var sz2 = screenSize(slot, false);
      drawHistogram(ctx, sz2.W, sz2.H, sz2.k, buf.hist);
      slot.note.textContent = (st.histY ? "яркость" : "R G B") + " · 256 корзин · " +
        (st.histLog ? "лог" : "линейно");

    } else if (sc.kind === "vector") {
      var sz3 = screenSize(slot, true);
      S.vectorToImage(buf.vec, buf.vecHue, VEC_S, vecImg, st.gain,
        buf.stats.vecN, st.vecColor, st.vecZoom);
      vecOff.getContext("2d").putImageData(vecImg, 0, 0);
      ctx.fillStyle = "#060605";
      ctx.fillRect(0, 0, sz3.W, sz3.H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(vecOff, 0, 0, sz3.W, sz3.H);
      drawVectorGrid(ctx, sz3.W, sz3.k);
      slot.note.textContent = "×" + st.vecZoom + " · мишени " + st.targets + "% · кожа 123°";
      if (!slot.legend.innerHTML) {
        slot.legend.innerHTML = '<span><i style="background:rgba(240,214,150,0.8)"></i>линия кожи</span>' +
          "<span>рамки — допуск мишеней ±5° и ±5%</span>";
      }

    } else if (sc.kind === "fc" || sc.kind === "frame") {
      if (slot.canvas.width !== work.width || slot.canvas.height !== work.height) {
        slot.canvas.width = work.width; slot.canvas.height = work.height;
      }
      if (!slot.img || slot.img.width !== work.width || slot.img.height !== work.height) {
        slot.img = ctx.createImageData(work.width, work.height);
      }
      var copy = slot.img;
      copy.data.set(d.data);
      if (sc.kind === "fc") {
        S.applyFalseColor(copy.data, work.width * work.height * 4, fcLut, S.MATRIX[st.matrix]);
      } else {
        if (st.zebra) {
          S.applyZebra(copy.data, work.width, work.height, {
            matrix: S.MATRIX[st.matrix], range: S.RANGE[st.range],
            lo: st.zebraLevel, hi: st.zebraBand ? st.zebraLevel + 0.05 : 1e4,
            period: 10, phase: (performance.now() / 60) | 0
          });
        }
        if (st.peak) {
          S.applyPeaking(copy.data, work.width, work.height,
            { matrix: S.MATRIX[st.matrix], threshold: st.peakLevel });
        }
      }
      ctx.putImageData(copy, 0, 0);
      if (sc.kind === "fc") {
        slot.legend.innerHTML = fcLegendHTML();
        slot.note.textContent = st.fcScale === "arri" ? "ARRI LogC3 · EI " + st.fcEI
          : st.fcScale === "stops" ? "стопы от 18% серого · " + S.CURVES[st.curve].name
          : "шкала IRE · Rec.709";
      } else {
        slot.legend.innerHTML = "";
        slot.note.textContent = (st.zebra ? "зебра " + Math.round(st.zebraLevel * 100) + " · " : "") +
          (st.peak ? "пикинг · " : "") + work.width + "×" + work.height;
      }
    }
  }

  function updateNumbers() {
    var s = lastStats;
    if (!s) return;
    setNum("sc-min", fmtUnit(s.minSig));
    setNum("sc-avg", fmtUnit(s.avgSig));
    setNum("sc-max", fmtUnit(s.maxSig));
    setNum("sc-clip-lo", s.clipLow.toFixed(2) + "%", s.clipLow > 1 ? "bad" : (s.clipLow > 0.05 ? "warn" : ""));
    setNum("sc-clip-hi", s.clipHigh.toFixed(2) + "%", s.clipHigh > 1 ? "bad" : (s.clipHigh > 0.05 ? "warn" : ""));
    setNum("sc-legal", s.chanOut.toFixed(2) + "%", s.chanOut > 5 ? "warn" : "");
  }
  function setNum(id, text, cls) {
    var n = el(id);
    if (!n) return;
    n.textContent = text;
    n.className = cls || "";
  }

  var ZONE_NAME = { all: "", low: "тени", mid: "средние", high: "света" };
  function zoneNote() {
    return ZONE_NAME[st.zone] ? " · только " + ZONE_NAME[st.zone] : "";
  }

  function updateSignature() {
    var sig = el("sc-signature");
    if (!sig) return;
    var live = !!(stream || (video.src && !video.paused)) && !frozen;
    /* та же правда в верхней полосе: что за источник и живой ли он — видно,
       даже когда нижняя лента ушла за край экрана */
    var top = el("sc-live");
    if (top) {
      top.innerHTML = '<span class="dot' + (live ? "" : " idle") + '"></span>' +
        "<b>" + escapeHtml(sourceName) + "</b>" +
        (frozen ? " · заморожен" : "") + (CROP ? " · кроп" : "") +
        (ZONE_NAME[st.zone] ? " · " + ZONE_NAME[st.zone] : "");
    }
    sig.innerHTML =
      '<span><span class="dot' + (live ? "" : " idle") + '"></span> ' +
      (frozen ? "кадр заморожен" : live ? "живой сигнал" : "стоп-кадр") + "</span>" +
      "<span>Источник: <b>" + escapeHtml(sourceName) + "</b></span>" +
      (ZONE_NAME[st.zone] ? "<span>Трасса: <b>только " + ZONE_NAME[st.zone] + "</b></span>" : "") +
      "<span>Матрица: <b>" + S.MATRIX[st.matrix].name + "</b></span>" +
      "<span>Диапазон: <b>" + S.RANGE[st.range].name + "</b></span>" +
      "<span>Шкала: <b>" + unitLabel() + "</b></span>" +
      "<span>Анализ: <b>" + work.width + "×" + work.height + "</b>" +
      (CROP ? " · кроп" : "") + "</span>" +
      "<span>Обновление: <b>" + fps.val + "/с</b></span>";
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------------- кроп и пипетка по кадру ---------------- */

  var cropping = false, cropStart = null, cropBox = null, cropHint = null;

  function setCropBtn() {
    var b = el("sc-crop");
    if (!b) return;
    b.textContent = CROP ? "Снять кроп" : "Кроп";
    b.classList.toggle("on", !!CROP || cropping);
  }

  el("sc-crop").addEventListener("click", function () {
    if (CROP) { CROP = null; cropping = false; removeCropUI(); paintCropFrame(); setCropBtn(); note("Кроп снят — считаю весь кадр."); render(true); return; }
    cropping = true;
    setCropBtn();
    /* область выделяется мышью: по превью в панели — всегда, по окну «Кадр» —
       если оно открыто. Раньше без окна «Кадр» кроп задать было нельзя */
    var fs = frameSlot();
    if (fs) {
      cropHint = document.createElement("div");
      cropHint.className = "sc-crop-hint";
      cropHint.textContent = "Выделите область мышью";
      fs.wrap.appendChild(cropHint);
    }
    setPanel(true);
    note("Выделите область мышью по превью источника в панели слева" +
         (fs ? " или прямо по окну «Кадр»." : "."));
  });

  function frameSlot() {
    for (var i = 0; i < st.layout; i++) {
      if (scopeOf(slots[i].sel.value).kind === "frame") return slots[i];
    }
    return null;
  }
  function removeCropUI() {
    if (cropBox && cropBox.parentNode) cropBox.parentNode.removeChild(cropBox);
    if (cropHint && cropHint.parentNode) cropHint.parentNode.removeChild(cropHint);
    cropBox = null; cropHint = null;
  }

  function canvasPoint(slot, ev) {
    var r = slot.canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), rect: r };
  }

  function bindFrameInteractions() {
    slots.forEach(function (slot) {
      slot.canvas.addEventListener("pointerdown", function (ev) {
        if (!cropping || scopeOf(slot.sel.value).kind !== "frame") return;
        cropStart = canvasPoint(slot, ev);
        cropBox = document.createElement("div");
        cropBox.className = "sc-crop";
        slot.wrap.appendChild(cropBox);
        slot.canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      });
      slot.canvas.addEventListener("pointermove", function (ev) {
        if (cropping && cropStart && cropBox) {
          var p = canvasPoint(slot, ev);
          var r = slot.canvas.getBoundingClientRect(), wr = slot.wrap.getBoundingClientRect();
          var x0 = Math.min(cropStart.x, p.x), x1 = Math.max(cropStart.x, p.x);
          var y0 = Math.min(cropStart.y, p.y), y1 = Math.max(cropStart.y, p.y);
          cropBox.style.left = (r.left - wr.left + x0 * r.width) + "px";
          cropBox.style.top = (r.top - wr.top + y0 * r.height) + "px";
          cropBox.style.width = ((x1 - x0) * r.width) + "px";
          cropBox.style.height = ((y1 - y0) * r.height) + "px";
          return;
        }
        if (scopeOf(slot.sel.value).kind === "frame" || scopeOf(slot.sel.value).kind === "fc") {
          showProbe(slot, ev);
        }
      });
      slot.canvas.addEventListener("pointerup", function (ev) {
        if (!cropping || !cropStart) return;
        var p = canvasPoint(slot, ev);
        var x0 = Math.min(cropStart.x, p.x), x1 = Math.max(cropStart.x, p.x);
        var y0 = Math.min(cropStart.y, p.y), y1 = Math.max(cropStart.y, p.y);
        cropping = false; cropStart = null;
        removeCropUI();
        if (x1 - x0 > 0.02 && y1 - y0 > 0.02) {
          var prev = CROP || { x: 0, y: 0, w: 1, h: 1 };
          CROP = { x: prev.x + x0 * prev.w, y: prev.y + y0 * prev.h,
                   w: (x1 - x0) * prev.w, h: (y1 - y0) * prev.h };
          paintCropFrame();
          note("Кроп задан: прибор считает выделенную область.");
        } else {
          note("Область слишком мала — кроп не задан.");
        }
        setCropBtn();
      });
      slot.canvas.addEventListener("pointerleave", function () { hideProbe(); });
    });
  }

  /* ---------------- превью источника в панели ---------------- */
  /* Кроп задаётся прямо здесь: раньше для этого приходилось держать на сетке
     окно «Кадр», то есть тратить на служебную задачу целое окно прибора. */

  var prevWrap = el("sc-preview"), prevCv = el("sc-preview-cv");
  var prevCtx = prevCv ? prevCv.getContext("2d") : null;
  var prevFrame = null, prevSel = null, prevStart = null;

  function drawPreview() {
    if (!prevCtx || !prevWrap.offsetParent) return;   /* панель закрыта — не тратим кадр */
    var src = still || (video.videoWidth ? video : null);
    if (!src) return;
    var sw = still ? (still.naturalWidth || still.width) : video.videoWidth;
    var sh = still ? (still.naturalHeight || still.height) : video.videoHeight;
    if (!sw || !sh) return;
    var W = Math.max(120, Math.round(prevWrap.clientWidth));
    var H = Math.max(60, Math.round(W * sh / sw));
    if (prevCv.width !== W || prevCv.height !== H) { prevCv.width = W; prevCv.height = H; }
    prevCtx.drawImage(src, 0, 0, sw, sh, 0, 0, W, H);
    paintCropFrame();
  }

  function paintCropFrame() {
    if (!prevWrap) return;
    if (!CROP) {
      if (prevFrame && prevFrame.parentNode) prevFrame.parentNode.removeChild(prevFrame);
      prevFrame = null;
      return;
    }
    if (!prevFrame) {
      prevFrame = document.createElement("div");
      prevFrame.className = "sc-crop";
      prevWrap.appendChild(prevFrame);
    }
    prevFrame.style.left = (CROP.x * 100).toFixed(2) + "%";
    prevFrame.style.top = (CROP.y * 100).toFixed(2) + "%";
    prevFrame.style.width = (CROP.w * 100).toFixed(2) + "%";
    prevFrame.style.height = (CROP.h * 100).toFixed(2) + "%";
  }

  function prevPoint(ev) {
    var r = prevWrap.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
  }

  if (prevWrap) {
    prevWrap.addEventListener("pointerdown", function (ev) {
      prevStart = prevPoint(ev);
      if (!prevSel) {
        prevSel = document.createElement("div");
        prevSel.className = "sc-crop";
      }
      prevWrap.appendChild(prevSel);
      prevSel.style.left = (prevStart.x * 100) + "%";
      prevSel.style.top = (prevStart.y * 100) + "%";
      prevSel.style.width = "0%"; prevSel.style.height = "0%";
      prevWrap.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    prevWrap.addEventListener("pointermove", function (ev) {
      if (!prevStart || !prevSel) return;
      var p = prevPoint(ev);
      prevSel.style.left = (Math.min(prevStart.x, p.x) * 100) + "%";
      prevSel.style.top = (Math.min(prevStart.y, p.y) * 100) + "%";
      prevSel.style.width = (Math.abs(p.x - prevStart.x) * 100) + "%";
      prevSel.style.height = (Math.abs(p.y - prevStart.y) * 100) + "%";
    });
    prevWrap.addEventListener("pointerup", function (ev) {
      if (!prevStart) return;
      var p = prevPoint(ev);
      var x0 = Math.min(prevStart.x, p.x), x1 = Math.max(prevStart.x, p.x);
      var y0 = Math.min(prevStart.y, p.y), y1 = Math.max(prevStart.y, p.y);
      prevStart = null;
      if (prevSel && prevSel.parentNode) prevSel.parentNode.removeChild(prevSel);
      cropping = false;
      removeCropUI();
      if (x1 - x0 > 0.02 && y1 - y0 > 0.02) {
        /* превью показывает ВЕСЬ кадр, поэтому доли берутся как есть */
        CROP = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        note("Кроп задан: прибор считает выделенную область.");
      } else {
        CROP = null;
        note("Кроп снят — считаю весь кадр.");
      }
      paintCropFrame(); setCropBtn(); render(true);
    });
  }

  var probeBox = null;
  function showProbe(slot, ev) {
    var p = canvasPoint(slot, ev);
    var x = Math.floor(p.x * work.width), y = Math.floor(p.y * work.height);
    if (x < 0 || y < 0 || x >= work.width || y >= work.height) return;
    var d = wctx.getImageData(x, y, 1, 1).data;
    var pr = S.probe(d[0], d[1], d[2], S.MATRIX[st.matrix], S.RANGE[st.range], st.curve);
    if (!probeBox) {
      probeBox = document.createElement("div");
      probeBox.className = "sc-probe";
      app.appendChild(probeBox);
    }
    probeBox.parentNode !== slot.wrap && slot.wrap.appendChild(probeBox);
    probeBox.classList.add("on");
    probeBox.innerHTML =
      '<span class="sw" style="background:rgb(' + d[0] + "," + d[1] + "," + d[2] + ')"></span>' +
      "R <b>" + d[0] + "</b> G <b>" + d[1] + "</b> B <b>" + d[2] + "</b><br>" +
      unitLabel() + " <b>" + fmtUnit(pr.signal) + "</b><br>" +
      "оттенок <b>" + pr.angle.toFixed(1) + "°</b> нас. <b>" + (pr.sat * 100).toFixed(1) + "</b><br>" +
      "от серого <b>" + (isFinite(pr.stops) ? (pr.stops > 0 ? "+" : "") + pr.stops.toFixed(2) : "—") + " ст</b>";
  }
  function hideProbe() { if (probeBox) probeBox.classList.remove("on"); }

  /* ---------------- фриз, снимок, раскладка ---------------- */

  function setFreezeBtn() {
    var b = el("sc-freeze");
    if (b) { b.classList.toggle("on", !!frozen); b.textContent = frozen ? "Разморозить" : "Заморозить"; }
  }
  el("sc-freeze").addEventListener("click", function () {
    if (frozen) { frozen = null; }
    else {
      var d = grab();
      if (!d) { note("Кадра ещё нет."); return; }
      frozen = d;
    }
    setFreezeBtn();
    render(true);
  });

  el("sc-shot").addEventListener("click", function () {
    var pad = 12, cols = st.layout > 1 ? 2 : 1;
    var rows = Math.ceil(st.layout / cols);
    var cellW = 640, cellH = 360;
    var out = document.createElement("canvas");
    out.width = cols * cellW + pad * (cols + 1);
    out.height = rows * cellH + pad * (rows + 1) + 56;
    var c = out.getContext("2d");
    c.fillStyle = "#0b0b0a"; c.fillRect(0, 0, out.width, out.height);
    for (var i = 0; i < st.layout; i++) {
      var col = i % cols, row = (i / cols) | 0;
      var x = pad + col * (cellW + pad), y = pad + row * (cellH + pad);
      c.fillStyle = "#060605"; c.fillRect(x, y, cellW, cellH);
      var cv = slots[i].canvas;
      var sc2 = Math.min(cellW / cv.width, cellH / cv.height);
      var dw = cv.width * sc2, dh = cv.height * sc2;
      c.drawImage(cv, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
      c.fillStyle = "rgba(245,239,226,0.75)";
      c.font = "13px sans-serif";
      c.fillText(scopeOf(slots[i].sel.value).name, x + 8, y + 18);
    }
    c.fillStyle = "rgba(245,239,226,0.6)";
    c.font = "13px monospace";
    var s = lastStats || { minSig: 0, avgSig: 0, maxSig: 0, clipHigh: 0 };
    c.fillText(sourceName + " · " + S.MATRIX[st.matrix].name + " · " + S.RANGE[st.range].name +
      " · " + unitLabel() + " " + fmtUnit(s.minSig) + "/" + fmtUnit(s.avgSig) + "/" + fmtUnit(s.maxSig) +
      " · клип " + s.clipHigh.toFixed(2) + "% · pobubnim.github.io",
      pad, out.height - 20);
    var a = document.createElement("a");
    a.download = "pribory-" + Date.now() + ".png";
    a.href = out.toDataURL("image/png");
    a.click();
    note("Снимок приборов сохранён в загрузки.");
  });

  document.querySelectorAll("[data-layout]").forEach(function (b) {
    b.addEventListener("click", function () {
      st.layout = Number(b.dataset.layout);
      document.querySelectorAll("[data-layout]").forEach(function (x) { x.classList.toggle("on", x === b); });
      grid.className = "sc-grid lay-" + st.layout;
      slots.forEach(function (s, i) { s.box.classList.toggle("off", i >= st.layout); });
      save(); render(true);
    });
  });

  /* полный экран и окно поверх других окон */
  el("sc-full").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (app.requestFullscreen) app.requestFullscreen().catch(function () { note("Полный экран не разрешён браузером."); });
  });

  var pipWin = null, appHome = null, appNext = null;
  el("sc-pip").addEventListener("click", function () {
    if (pipWin) { pipWin.close(); return; }
    if (!window.documentPictureInPicture) {
      note("Окно поверх умеют Chrome и Edge на компьютере. В остальных браузерах — полный экран.");
      return;
    }
    window.documentPictureInPicture.requestWindow({ width: 900, height: 620 }).then(function (w) {
      pipWin = w;
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(function (node) {
        pipWin.document.head.appendChild(node.cloneNode(true));
      });
      pipWin.document.body.style.background = "#000";
      pipWin.document.body.style.margin = "0";
      appHome = app.parentNode; appNext = app.nextSibling;
      pipWin.document.body.appendChild(app);
      /* в отдельном окне стойка занимает его целиком: там нет ни шапки сайта,
         ни заголовка — только приборы */
      app.style.height = "100vh";
      app.style.borderRadius = "0";
      app.style.border = "0";
      el("sc-pip").classList.add("on");
      pipWin.addEventListener("pagehide", function () {
        app.style.height = ""; app.style.borderRadius = ""; app.style.border = "";
        if (appNext) appHome.insertBefore(app, appNext); else appHome.appendChild(app);
        el("sc-pip").classList.remove("on");
        pipWin = null;
      });
    }).catch(function () { note("Окно поверх не открылось."); });
  });

  /* ---------------- настройки ---------------- */

  /* панель управления: свернуть — значит отдать приборам всю ширину экрана */
  function setPanel(on) {
    st.panel = !!on; save();
    var box = el("sc-cfg"), btn = el("sc-settings");
    if (box) box.classList.toggle("on", st.panel);
    if (btn) {
      btn.classList.toggle("on", st.panel);
      btn.setAttribute("aria-expanded", st.panel ? "true" : "false");
    }
    markDirty(); render(true);
  }
  el("sc-settings").addEventListener("click", function () { setPanel(!st.panel); });

  /* на телефоне панель лежит поверх приборов: тап по прибору её убирает —
     иначе за выдвинутым ящиком не видно того, ради чего он открыт */
  app.addEventListener("pointerdown", function (ev) {
    if (!st.panel || window.innerWidth > 1000) return;
    var box = el("sc-cfg"), btn = el("sc-settings");
    if ((box && box.contains(ev.target)) || (btn && btn.contains(ev.target))) return;
    setPanel(false);
  }, true);

  function bindSelect(id, key, cast, after) {
    var n = el(id);
    if (!n) return;
    n.value = String(st[key]);
    n.addEventListener("change", function () {
      st[key] = cast ? cast(n.value) : n.value;
      save();
      if (after) after();
      markDirty(); render(true);
    });
  }
  function bindCheck(id, key, after) {
    var n = el(id);
    if (!n) return;
    n.checked = !!st[key];
    n.addEventListener("change", function () {
      st[key] = n.checked; save();
      if (after) after();
      render(true);
    });
  }
  function bindRange(id, key, valId, fmt, after) {
    var n = el(id), v = el(valId);
    if (!n) return;
    n.value = String(st[key]);
    if (v) v.textContent = fmt(st[key]);
    n.addEventListener("input", function () {
      st[key] = Number(n.value); save();
      if (v) v.textContent = fmt(st[key]);
      if (after) after();
      render(true);
    });
  }

  bindSelect("cfg-matrix", "matrix");
  bindSelect("cfg-range", "range", null, fcRebuild);
  bindSelect("cfg-unit", "unit");
  bindSelect("cfg-curve", "curve", null, fcRebuild);
  bindSelect("cfg-quality", "quality");
  bindSelect("cfg-fps", "fps", Number);
  bindSelect("cfg-zone", "zone");
  bindSelect("cfg-targets", "targets", Number);
  bindSelect("cfg-vzoom", "vecZoom", Number);
  bindSelect("cfg-fc", "fcScale", null, function () {
    fcRebuild();
    el("cfg-ei-row").style.display = st.fcScale === "arri" ? "" : "none";
  });
  bindSelect("cfg-ei", "fcEI", Number, fcRebuild);
  bindCheck("cfg-hist-log", "histLog");
  bindCheck("cfg-hist-y", "histY");
  bindCheck("cfg-vcolor", "vecColor");
  bindCheck("cfg-zebra", "zebra");
  bindCheck("cfg-zebra-band", "zebraBand");
  bindCheck("cfg-peak", "peak");
  bindRange("cfg-gain", "gain", "cfg-gain-val", function (v) { return v.toFixed(1) + "×"; });
  bindRange("cfg-zebra-level", "zebraLevel", "cfg-zebra-val", function (v) { return Math.round(v * 100) + " IRE"; });
  bindRange("cfg-peak-level", "peakLevel", "cfg-peak-val", function (v) { return Math.round(v * 100) + "%"; });
  el("cfg-ei-row").style.display = st.fcScale === "arri" ? "" : "none";

  /* ---------------- горячие клавиши ---------------- */

  document.addEventListener("keydown", function (e) {
    var tg = e.target;
    if (tg && tg.matches && tg.matches("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "f") { el("sc-freeze").click(); }
    else if (k === "c") { el("sc-crop").click(); }
    else if (k === "s") { el("sc-shot").click(); }
    else if (k === "z") { st.zebra = !st.zebra; el("cfg-zebra").checked = st.zebra; save(); render(true); }
    else if (k === "p") { st.peak = !st.peak; el("cfg-peak").checked = st.peak; save(); render(true); }
    else if (k === "u") {
      var order = ["ire", "code8", "code10"];
      st.unit = order[(order.indexOf(st.unit) + 1) % 3];
      el("cfg-unit").value = st.unit; save(); render(true);
      note("Шкала: " + unitLabel());
    } else if (k === "b") { setPanel(!st.panel); }
    else if (k >= "1" && k <= "4") {
      var b = document.querySelector('[data-layout="' + k + '"]');
      if (b) b.click();
    } else if (k === " " && video.src) {
      e.preventDefault(); el("sc-play").click();
    }
  });

  /* ---------------- цикл ---------------- */

  var lastDraw = 0;
  function loop(t) {
    var interval = 1000 / st.fps;
    if (t - lastDraw >= interval) {
      lastDraw = t;
      try { render(false); } catch (e) { /* один плохой кадр не роняет прибор */ }
    }
    requestAnimationFrame(loop);
  }

  /* демо-кадр: цветные полосы 75% — прибор живой до выбора источника,
     и мишени можно проверить глазами (SCOPES_BASE §6) */
  function demoFrame() {
    var c = document.createElement("canvas");
    c.width = 960; c.height = 540;
    var g = c.getContext("2d");
    var bars = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1]];
    bars.forEach(function (b, i) {
      g.fillStyle = "rgb(" + b.map(function (v) { return Math.round(v * 0.75 * 255); }).join(",") + ")";
      g.fillRect(Math.round(i * c.width / 7), 0, Math.ceil(c.width / 7), c.height);
    });
    return c;
  }

  fcRebuild();
  buildSlots();
  document.querySelectorAll("[data-layout]").forEach(function (x) {
    x.classList.toggle("on", Number(x.dataset.layout) === st.layout);
  });
  el("sc-cfg").classList.toggle("on", st.panel);
  el("sc-settings").classList.toggle("on", st.panel);
  el("sc-settings").setAttribute("aria-expanded", st.panel ? "true" : "false");
  setCropBtn();
  still = demoFrame();
  showTransport(false);
  setFreezeBtn();
  /* окно меняет размер — меняются и поля приборов: статичный кадр иначе
     остался бы нарисованным под старый размер */
  window.addEventListener("resize", markDirty);
  render(true);
  requestAnimationFrame(loop);

  /* наружу — для приёмки tools/test_pribory.py и отладки */
  window.PobubnimPribory = {
    state: st, render: render, stats: function () { return lastStats; },
    buffers: function () { return buf; },
    targets: function () { return S.barTargets(st.matrix, st.targets); },
    zones: function () { return fcZones; },
    slots: function () { return slots.map(function (s) { return s.sel.value; }); },
    setSlot: function (i, id) { slots[i].sel.value = id; slots[i].box.dataset.kind = scopeOf(id).kind; st.slots[i] = id; render(true); },
    setCrop: function (c) { CROP = c; render(true); },
    crop: function () { return CROP; },
    useSource: function (src, label) {
      stopStream(); frozen = null; still = src;
      video.removeAttribute("src"); video.srcObject = null;
      setSource(label || "тестовый кадр"); render(true);
    },
    field: function () { return { WF_W: WF_W, WF_H: WF_H, VEC_S: VEC_S }; },
    work: work
  };
})();
