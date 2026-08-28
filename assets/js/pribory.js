/* ПОБУБНИМ — приборы онлайн: интерфейс поверх ядра scopes-core.js.
   Источник кадра: файл, захват экрана или камера — всё считается в браузере,
   ничего никуда не отправляется. Канон формул и разметки — docs/SCOPES_BASE.md. */

(function () {
  "use strict";
  var S = window.PobubnimScopes;
  if (!S) return;

  var WORK_W = 480, WORK_H = 270;        /* рабочая копия кадра для расчётов */
  var WF_W = 480, WF_H = 256;            /* поле waveform */
  var VEC_S = 320;                       /* поле вектроскопа, квадрат */

  var state = {
    matrix: "709",
    range: "full",
    gain: 2.2,
    vecStep: 2,
    vecZoom: 1,
    targets: 75,
    wfMode: "luma",
    histLog: true,
    fc: false
  };

  var el = function (id) { return document.getElementById(id); };
  var video = el("pr-video");
  var still = null;                       /* картинка, если источник — фото */
  var stream = null;

  var work = document.createElement("canvas");
  work.width = WORK_W; work.height = WORK_H;
  var wctx = work.getContext("2d", { willReadFrequently: true });
  /* прибор смотрит на РЕАЛЬНЫЕ пиксели: при уменьшении кадра берём выборку,
     а не усреднение. Сглаживание размывало бы границы и рисовало на waveform
     уровни, которых в кадре нет (поймано приёмкой на цветных полосах). */
  wctx.imageSmoothingEnabled = false;

  var wfCan = el("pr-wf"), histCan = el("pr-hist"), vecCan = el("pr-vec"), fcCan = el("pr-fc");
  var wfCtx = wfCan.getContext("2d"), histCtx = histCan.getContext("2d");
  var vecCtx = vecCan.getContext("2d"), fcCtx = fcCan.getContext("2d");

  var wfAcc = new Uint16Array(WF_W * WF_H * 3);
  var wfImg = wfCtx.createImageData(WF_W, WF_H);
  var vecAcc = new Uint32Array(VEC_S * VEC_S);
  var fcLut = S.falseColorLUT(S.FC_IRE, S.RANGE[state.range]);

  /* ---------------- источники ---------------- */

  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  function useStream(s, label) {
    stopStream();
    still = null;
    stream = s;
    video.srcObject = s;
    video.play().catch(function () {});
    setSource(label);
  }

  function setSource(label) {
    var n = el("pr-source-name");
    if (n) n.textContent = label;
  }

  el("pr-screen").addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      note("Захват экрана этот браузер не умеет — откройте файл.");
      return;
    }
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
      .then(function (s) { useStream(s, "захват экрана"); })
      .catch(function () { note("Захват отменён."); });
  });

  el("pr-camera").addEventListener("click", function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      note("Камера этому браузеру недоступна.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: false })
      .then(function (s) { useStream(s, "камера"); })
      .catch(function () { note("Камера не открылась — проверьте разрешение в браузере."); });
  });

  el("pr-file").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f);
    stopStream();
    if (f.type.indexOf("image") === 0) {
      var im = new Image();
      im.onload = function () { still = im; video.removeAttribute("src"); video.load(); setSource("файл: " + f.name); };
      im.src = url;
    } else {
      still = null;
      video.srcObject = null;
      video.src = url;
      video.loop = true;
      video.play().catch(function () {});
      setSource("файл: " + f.name);
    }
  });

  function note(text) {
    var n = el("pr-note");
    if (!n) return;
    n.textContent = text;
    n.classList.add("on");
    setTimeout(function () { n.classList.remove("on"); }, 4000);
  }

  /* ---------------- настройки ---------------- */

  function bindChips(name, key, cast) {
    document.querySelectorAll('[data-set="' + name + '"]').forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll('[data-set="' + name + '"]').forEach(function (x) {
          x.classList.toggle("on", x === b);
        });
        state[key] = cast ? cast(b.dataset.val) : b.dataset.val;
        if (key === "range") fcLut = S.falseColorLUT(S.FC_IRE, S.RANGE[state.range]);
        drawStaticLabels();
      });
    });
  }
  bindChips("matrix", "matrix");
  bindChips("range", "range");
  bindChips("wfmode", "wfMode");
  bindChips("targets", "targets", Number);
  bindChips("zoom", "vecZoom", Number);

  var gainInput = el("pr-gain");
  gainInput.addEventListener("input", function () {
    state.gain = Number(gainInput.value);
    el("pr-gain-val").textContent = state.gain.toFixed(1) + "×";
  });

  var fcToggle = el("pr-fc-toggle");
  fcToggle.addEventListener("change", function () {
    state.fc = fcToggle.checked;
    el("pr-fc-card").classList.toggle("off", !state.fc);
  });

  var logToggle = el("pr-hist-log");
  logToggle.addEventListener("change", function () { state.histLog = logToggle.checked; });

  /* ---------------- разметка приборов ---------------- */

  function drawIreGrid(ctx, W, H, lanes) {
    ctx.save();
    ctx.strokeStyle = "rgba(245,239,226,0.13)";
    ctx.fillStyle = "rgba(245,239,226,0.42)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.lineWidth = 1;
    for (var v = 0; v <= 100; v += 20) {
      var y = Math.round((1 - v / 100) * (H - 1)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillText(v, 3, Math.min(H - 3, y + 11));
    }
    if (lanes > 1) {
      ctx.strokeStyle = "rgba(245,239,226,0.22)";
      for (var i = 1; i < lanes; i++) {
        var x = Math.round(W / lanes * i) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* мишени цветных полос: углы одни для 75% и 100%, отличается радиус
     (SCOPES_BASE §6). Считаем прямо из матрицы — таблиц не держим. */
  function vectorTargets() {
    var m = S.MATRIX[state.matrix];
    var bars = [
      ["R", 1, 0, 0], ["Mg", 1, 0, 1], ["B", 0, 0, 1],
      ["Cy", 0, 1, 1], ["G", 0, 1, 0], ["Yl", 1, 1, 0]
    ];
    var lvl = state.targets / 100;
    return bars.map(function (b) {
      var c = S.ycbcr(b[1] * lvl, b[2] * lvl, b[3] * lvl, m);
      return { name: b[0], cb: c.cb, cr: c.cr };
    });
  }

  function drawVectorGrid(ctx, S_) {
    var half = S_ / 2, k = state.vecZoom;
    ctx.save();
    ctx.strokeStyle = "rgba(245,239,226,0.12)";
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, S_); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(S_, half); ctx.stroke();
    /* круги насыщенности */
    [0.125, 0.25, 0.375, 0.5].forEach(function (r) {
      ctx.beginPath(); ctx.arc(half, half, r * S_ * k, 0, Math.PI * 2); ctx.stroke();
    });
    /* линия кожи 123° (EDU_BASE §8б.4а) */
    var a = 123 * Math.PI / 180;
    ctx.strokeStyle = "rgba(240,214,150,0.55)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(half + Math.cos(a) * half, half - Math.sin(a) * half);
    ctx.stroke();
    ctx.setLineDash([]);
    /* мишени */
    ctx.strokeStyle = "rgba(245,239,226,0.5)";
    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.font = "10px ui-monospace, monospace";
    vectorTargets().forEach(function (t) {
      var x = half + t.cb * S_ * k, y = half - t.cr * S_ * k;
      ctx.strokeRect(x - 5, y - 5, 10, 10);
      ctx.fillText(t.name, x + 8, y + 3);
    });
    ctx.restore();
  }

  function drawStaticLabels() {
    var box = el("pr-signature");
    if (!box) return;
    box.textContent = S.MATRIX[state.matrix].name + " · " + S.RANGE[state.range].name;
  }

  /* ---------------- цикл ---------------- */

  function frameReady() {
    if (still) return true;
    return video.readyState >= 2 && video.videoWidth > 0;
  }

  function grab() {
    var src = still || video;
    /* still — картинка или canvas (у canvas нет naturalWidth) */
    var sw = still ? (still.naturalWidth || still.width) : video.videoWidth;
    var sh = still ? (still.naturalHeight || still.height) : video.videoHeight;
    if (!sw || !sh) return null;
    /* сохраняем пропорции кадра в рабочей копии */
    var ar = sw / sh;
    var w = WORK_W, h = Math.round(WORK_W / ar);
    if (h > WORK_H) { h = WORK_H; w = Math.round(WORK_H * ar); }
    work.width = w; work.height = h;
    wctx.imageSmoothingEnabled = false;   /* смена размера канваса сбрасывает флаг */
    wctx.drawImage(src, 0, 0, w, h);
    return wctx.getImageData(0, 0, w, h);
  }

  var lastStats = null;

  function render() {
    if (!frameReady()) return;
    var d = grab();
    if (!d) return;
    var m = S.MATRIX[state.matrix], range = S.RANGE[state.range];
    var w = work.width, h = work.height;

    /* waveform / парад */
    S.waveform(d.data, w, h, wfAcc, WF_W, WF_H, state.wfMode, m, range);
    S.waveformToImage(wfAcc, WF_W, WF_H, wfImg, state.gain, state.wfMode);
    wfCtx.putImageData(wfImg, 0, 0);
    drawIreGrid(wfCtx, WF_W, WF_H, state.wfMode === "parade" ? 3 : 1);

    /* гистограмма */
    drawHistogram(S.histogram(d.data, w, h, m));

    /* вектроскоп */
    S.vector(d.data, w, h, vecAcc, VEC_S, m, state.vecStep);
    drawVector();

    /* false color */
    if (state.fc) drawFalseColor(d, w, h, m);

    /* числа */
    var st = S.stats(d.data, w, h, m, range);
    lastStats = st;
    el("pr-min").textContent = st.min.toFixed(1);
    el("pr-avg").textContent = st.avg.toFixed(1);
    el("pr-max").textContent = st.max.toFixed(1);
    el("pr-clip-low").textContent = st.lowPct.toFixed(2) + "%";
    el("pr-clip-high").textContent = st.highPct.toFixed(2) + "%";
  }

  function drawHistogram(hist) {
    var W = histCan.width, H = histCan.height;
    histCtx.fillStyle = "#0b0b0a";
    histCtx.fillRect(0, 0, W, H);
    var chans = [
      { d: hist.r, c: "rgba(224,73,47,0.75)" },
      { d: hist.g, c: "rgba(127,176,105,0.75)" },
      { d: hist.b, c: "rgba(74,111,224,0.8)" }
    ];
    var peak = 1;
    chans.forEach(function (ch) {
      for (var i = 0; i < 256; i++) if (ch.d[i] > peak) peak = ch.d[i];
    });
    var scale = state.histLog
      ? function (v) { return Math.log1p(v) / Math.log1p(peak); }
      : function (v) { return v / peak; };
    histCtx.globalCompositeOperation = "lighter";
    chans.forEach(function (ch) {
      histCtx.fillStyle = ch.c;
      for (var i = 0; i < 256; i++) {
        var bh = scale(ch.d[i]) * (H - 2);
        histCtx.fillRect(i * W / 256, H - bh, W / 256, bh);
      }
    });
    histCtx.globalCompositeOperation = "source-over";
    /* границы legal — куда сигнал не должен вылезать у видео */
    if (state.range === "legal") {
      histCtx.strokeStyle = "rgba(245,239,226,0.28)";
      [16, 235].forEach(function (v) {
        var x = Math.round(v * W / 256) + 0.5;
        histCtx.beginPath(); histCtx.moveTo(x, 0); histCtx.lineTo(x, H); histCtx.stroke();
      });
    }
  }

  function drawVector() {
    var img = vecCtx.createImageData(VEC_S, VEC_S);
    var dd = img.data, k = state.vecZoom, half = VEC_S / 2;
    /* зум применяем при отрисовке, чтобы накопление осталось честным */
    for (var y = 0; y < VEC_S; y++) {
      for (var x = 0; x < VEC_S; x++) {
        var sx = Math.round(half + (x - half) / k);
        var sy = Math.round(half + (y - half) / k);
        var v = (sx >= 0 && sx < VEC_S && sy >= 0 && sy < VEC_S) ? vecAcc[sy * VEC_S + sx] : 0;
        var a = v ? Math.min(255, v * state.gain * 6) : 0;
        var o = (y * VEC_S + x) * 4;
        dd[o] = 245 * a / 255; dd[o + 1] = 239 * a / 255; dd[o + 2] = 226 * a / 255; dd[o + 3] = 255;
      }
    }
    vecCtx.putImageData(img, 0, 0);
    drawVectorGrid(vecCtx, VEC_S);
  }

  function drawFalseColor(d, w, h, m) {
    var copy = fcCtx.createImageData(w, h);
    copy.data.set(d.data);
    S.applyFalseColor(copy.data, w * h * 4, fcLut, m);
    fcCan.width = w; fcCan.height = h;
    fcCtx.putImageData(copy, 0, 0);
  }

  /* ---------------- запуск ---------------- */

  function loop() {
    try { render(); } catch (e) { /* один плохой кадр не должен ронять прибор */ }
    requestAnimationFrame(loop);
  }
  drawStaticLabels();
  el("pr-gain-val").textContent = state.gain.toFixed(1) + "×";
  loop();

  /* Наружу — для приёмки (tools/test_pribory.py) и отладки: тест подаёт свой
     эталонный кадр и просит посчитать, не завися от requestAnimationFrame
     (в скрытой вкладке он не тикает). */
  window.PobubnimPribory = {
    state: state,
    render: render,
    stats: function () { return lastStats; },
    targets: vectorTargets,
    useSource: function (canvasOrImage) { stopStream(); still = canvasOrImage; setSource("тестовый кадр"); },
    field: { WF_W: WF_W, WF_H: WF_H, VEC_S: VEC_S },
    vecAcc: vecAcc,
    wfAcc: wfAcc,
    work: work
  };

  /* демо-кадр: цветные полосы, чтобы прибор был живым до выбора источника —
     и чтобы мишени можно было проверить глазами (SCOPES_BASE §6) */
  var demo = document.createElement("canvas");
  demo.width = 480; demo.height = 270;
  (function () {
    var c = demo.getContext("2d");
    var bars = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1]];
    bars.forEach(function (b, i) {
      c.fillStyle = "rgb(" + b.map(function (v) { return Math.round(v * 0.75 * 255); }).join(",") + ")";
      c.fillRect(i * demo.width / 7, 0, demo.width / 7 + 1, demo.height);
    });
    var im = new Image();
    im.onload = function () { if (!still && !stream && !video.src) still = im; };
    im.src = demo.toDataURL();
  })();
})();
