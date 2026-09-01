/* ПОБУБНИМ — доска «Колёса цветокоррекции»: прототип колёс Primaries.
   Математика — docs/EDU_BASE.md §8д (сверено 26.08 по первоисточникам):
     v = in + offset
     v = gain × ( v + lift × (1 − v) )        — каноническая модель LGG
     v = v ^ (1 / gamma)
     v = (v − pivot) × contrast + pivot        — линейная форма Contrast/Pivot
     затем насыщенность через luma Rec.709 (0.2126 / 0.7152 / 0.0722)
   Эквивалент ASC CDL (только колёса, без Contrast):
     slope = gain×(1−lift); offset = gain×((1−lift)×off + lift); power = 1/gamma
   Пиксели считаются честно через scope.js (cfg.process), скоупы — из результата. */

(function () {
  var LR = 0.2126, LG = 0.7152, LB = 0.0722;
  var TAU = Math.PI * 2 / 3; /* 120° — примари на круге: R восток, дальше по часовой */

  /* масштаб баланса: насколько край круга уводит канал */
  var K = { lift: 0.20, gamma: 0.40, gain: 0.50, offset: 0.20 };
  /* мастер из положения рейки t ∈ [−1,1] */
  var M = {
    lift: function (t) { return 0.25 * t; },
    gamma: function (t) { return Math.pow(2, 1.2 * t); },
    gain: function (t) { return Math.pow(2, 1.2 * t); },
    offset: function (t) { return 0.25 * t; }
  };

  function freshState() {
    return {
      view: "curve",
      lift: { t: 0, bx: 0, by: 0 }, gamma: { t: 0, bx: 0, by: 0 },
      gain: { t: 0, bx: 0, by: 0 }, offset: { t: 0, bx: 0, by: 0 },
      contrast: 1, pivot: 0.435, sat: 1,
      scene: "clean"
    };
  }

  /* сценарии-задания: предискажение исходника (что «сломано» в кадре) */
  var SCENES = {
    clean: null,
    milky: function (v) { return v * 0.80 + 0.13; },                    /* молочные тени */
    warm: function (v, c) { return c === 0 ? v * 1.12 : c === 2 ? v * 0.88 : v; } /* тёплый перекос */
  };

  function balance(w, k) {
    var r = Math.min(1, Math.hypot(w.bx, w.by));
    if (!r) return [0, 0, 0];
    var phi = Math.atan2(w.by, w.bx); /* экранные оси: по часовой от востока */
    return [k * r * Math.cos(phi), k * r * Math.cos(phi - TAU), k * r * Math.cos(phi - 2 * TAU)];
  }

  function channelParams(st) {
    var lb = balance(st.lift, K.lift), gb = balance(st.gamma, K.gamma),
        nb = balance(st.gain, K.gain), ob = balance(st.offset, K.offset);
    var p = { lift: [], gamma: [], gain: [], off: [] };
    for (var c = 0; c < 3; c++) {
      p.lift[c] = M.lift(st.lift.t) + lb[c];
      p.gamma[c] = Math.max(0.2, M.gamma(st.gamma.t) + gb[c]);
      p.gain[c] = Math.max(0, M.gain(st.gain.t) + nb[c]);
      p.off[c] = M.offset(st.offset.t) + ob[c];
    }
    return p;
  }

  /* полный канал (без насыщенности): вход 0..1 → выход (может выйти за 0..1) */
  function transfer(v, c, p, st) {
    v = v + p.off[c];
    v = p.gain[c] * (v + p.lift[c] * (1 - v));
    v = Math.pow(Math.max(0, v), 1 / p.gamma[c]);
    return (v - st.pivot) * st.contrast + st.pivot;
  }

  function cdlOf(p) {
    var s = [], o = [], pw = [];
    for (var c = 0; c < 3; c++) {
      s[c] = p.gain[c] * (1 - p.lift[c]);
      o[c] = p.gain[c] * ((1 - p.lift[c]) * p.off[c] + p.lift[c]);
      pw[c] = 1 / p.gamma[c];
    }
    return { slope: s, offset: o, power: pw };
  }

  function mount(cfg) {
    var root = cfg.root, img = cfg.img;
    var st = freshState();
    var lut = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    var params = channelParams(st);
    var rawMeans = null; /* средние каналы ЧИСТОГО исходника — эталон для задания «перекос» */

    function buildLuts() {
      params = channelParams(st);
      var pre = SCENES[st.scene];
      for (var c = 0; c < 3; c++) for (var i = 0; i < 256; i++) {
        var v = i / 255;
        if (pre) v = pre(v, c);
        lut[c][i] = transfer(v, c, params, st);
      }
    }

    function proc(px) {
      var r = lut[0][px[0]], g = lut[1][px[1]], b = lut[2][px[2]];
      var l = LR * r + LG * g + LB * b, s = st.sat;
      r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
      px[0] = Math.max(0, Math.min(255, r * 255));
      px[1] = Math.max(0, Math.min(255, g * 255));
      px[2] = Math.max(0, Math.min(255, b * 255));
    }

    /* ---------- прибор «кривая переноса»: что реально делают колёса ---------- */
    function drawCurve(ctx, d, W, H) {
      var PAD = 26;
      ctx.font = "9px 'JetBrains Mono', monospace";
      for (var ire = 0; ire <= 100; ire += 20) {
        var y = H - 8 - (ire / 100) * (H - 16), x = PAD + (ire / 100) * (W - PAD - 8);
        ctx.strokeStyle = ire === 0 || ire === 100 ? "rgba(224,73,47,0.4)" : "rgba(245,239,226,0.12)";
        ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - 8, y + 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 0.5, 8); ctx.lineTo(x + 0.5, H - 8); ctx.stroke();
        ctx.fillStyle = "rgba(245,239,226,0.45)";
        ctx.fillText(ire, 3, y + 3);
      }
      function X(v) { return PAD + v * (W - PAD - 8); }
      function Y(v) { return H - 8 - Math.max(-0.06, Math.min(1.06, v)) * (H - 16); }
      /* диагональ «ничего не тронуто» */
      ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(245,239,226,0.25)";
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke();
      ctx.setLineDash([]);
      /* кривые: одна кремовая, если каналы совпадают, иначе R G B */
      var same = params.lift[0] === params.lift[1] && params.lift[1] === params.lift[2] &&
                 params.gain[0] === params.gain[1] && params.gain[1] === params.gain[2] &&
                 params.gamma[0] === params.gamma[1] && params.gamma[1] === params.gamma[2] &&
                 params.off[0] === params.off[1] && params.off[1] === params.off[2];
      var chans = same ? [{ c: 0, col: "rgba(245,239,226,0.95)" }] :
        [{ c: 0, col: "rgba(224,73,47,0.9)" }, { c: 1, col: "rgba(127,176,105,0.9)" }, { c: 2, col: "rgba(96,130,224,0.95)" }];
      ctx.globalCompositeOperation = "lighter";
      chans.forEach(function (ch) {
        ctx.strokeStyle = ch.col; ctx.lineWidth = 1.6; ctx.beginPath();
        for (var i = 0; i <= 128; i++) {
          var t = i / 128, v = transfer(t, ch.c, params, st);
          i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v));
        }
        ctx.stroke();
      });
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1;
      /* pivot: точка, вокруг которой вращается контраст */
      if (st.contrast !== 1) {
        ctx.fillStyle = "rgba(245,239,226,0.9)";
        ctx.beginPath(); ctx.arc(X(st.pivot), Y(st.pivot), 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(245,239,226,0.55)";
        ctx.fillText("PIVOT " + st.pivot.toFixed(2), X(st.pivot) + 6, Y(st.pivot) - 6);
      }
      ctx.fillStyle = "rgba(245,239,226,0.45)";
      ctx.fillText("ВХОД →", W - 52, H - 12);
      ctx.save(); ctx.translate(12, 64); ctx.rotate(-Math.PI / 2); ctx.fillText("ВЫХОД →", 0, 0); ctx.restore();
    }

    var board = PobubnimScope.create({
      img: img, canvases: cfg.canvases, state: st,
      process: proc, views: { curve: drawCurve },
      onStats: onStats
    });

    function fmt(v, plus) { return (plus && v > 0 ? "+" : "") + v.toFixed(2); }

    function readout() {
      root.querySelectorAll("[data-wheel]").forEach(function (el) {
        var name = el.dataset.wheel, plus = name === "lift" || name === "offset";
        var vals = { lift: params.lift, gamma: params.gamma, gain: params.gain, offset: params.off }[name];
        el.querySelector("[data-val]").textContent =
          vals.map(function (v) { return fmt(v, plus); }).join(" ");
        var w = st[name];
        var dot = el.querySelector("[data-dot]"), disc = el.querySelector("[data-disc]");
        var R = disc.clientWidth / 2 - 10;
        dot.style.transform = "translate(" + (w.bx * R) + "px," + (w.by * R) + "px)";
        el.querySelector("[data-thumb]").style.left = ((w.t + 1) / 2 * 100) + "%";
        var railEl = el.querySelector("[data-rail]");
        if (railEl) railEl.setAttribute("aria-valuenow", w.t.toFixed(2));
      });
      var cdl = cdlOf(params);
      function trio(a, plus) {
        return a[0] === a[1] && a[1] === a[2] ? fmt(a[0], plus)
          : a.map(function (v) { return fmt(v, plus); }).join(" ");
      }
      var f = root.querySelector("[data-formula]");
      if (f) f.textContent = "out = ( " + trio(params.gain) + " × ( in + " + trio(params.lift, true) +
        "×(1−in) ) )^(1/" + trio(params.gamma) + ")  →  contrast " + st.contrast.toFixed(2) +
        " @ pivot " + st.pivot.toFixed(2) + "  →  sat " + st.sat.toFixed(2);
      var cl = root.querySelector("[data-cdl]");
      if (cl) cl.textContent = "ASC CDL · slope " + trio(cdl.slope) + " · offset " + trio(cdl.offset, true) +
        " · power " + trio(cdl.power) + " · sat " + st.sat.toFixed(2);
    }

    function onStats(s) {
      var el = cfg.statEl;
      if (!el) return;
      var html = "<span>средняя " + s.avgIre.toFixed(0) + " IRE</span>";
      html += "<span>тени на " + s.loIre.toFixed(0) + " IRE</span>";
      html += "<span" + (s.lowPct > 1 ? ' class="warn"' : "") + ">обрез теней " + s.lowPct.toFixed(1) + "%</span>";
      html += "<span" + (s.highPct > 1 ? ' class="warn"' : "") + ">обрез светов " + s.highPct.toFixed(1) + "%</span>";
      /* проверка заданий — по тем же честным цифрам, что и скоупы */
      if (st.scene === "milky") {
        var okM = s.loIre <= 5 && s.lowPct < 3;
        html += okM ? '<span class="ok">задание: чёрное село на место ✓</span>'
          : "<span>задание: опустите тени до 0–5 IRE без обреза</span>";
      } else if (st.scene === "warm" && rawMeans) {
        var dRG = (s.meanR - s.meanG) - (rawMeans.r - rawMeans.g);
        var dBG = (s.meanB - s.meanG) - (rawMeans.b - rawMeans.g);
        var okW = Math.abs(dRG) < 5 && Math.abs(dBG) < 5;
        html += okW ? '<span class="ok">задание: баланс выправлен ✓</span>'
          : "<span>задание: уберите тёплый перекос (R−B сейчас " + fmt((dRG - dBG) / 255 * 100, true) + " IRE)</span>";
      }
      el.innerHTML = html;
    }

    function measureRaw() {
      var c = document.createElement("canvas");
      c.width = 160; c.height = Math.max(1, Math.round(160 * (img.naturalHeight / img.naturalWidth || 0.5625)));
      var x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0, c.width, c.height);
      var d = x.getImageData(0, 0, c.width, c.height).data, r = 0, g = 0, b = 0, n = d.length / 4;
      for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      rawMeans = { r: r / n, g: g / n, b: b / n };
    }

    function touch() { buildLuts(); readout(); board.update(); }

    /* ---------- драг колёс и реек (относительный, как в Resolve) ---------- */
    root.querySelectorAll("[data-wheel]").forEach(function (el) {
      var name = el.dataset.wheel, w = st[name];
      var disc = el.querySelector("[data-disc]"), rail = el.querySelector("[data-rail]");
      function dragify(target, move) {
        var last = null;
        target.addEventListener("pointerdown", function (e) {
          last = { x: e.clientX, y: e.clientY };
          target.setPointerCapture(e.pointerId);
          e.preventDefault();
        });
        target.addEventListener("pointermove", function (e) {
          if (!last) return;
          move(e.clientX - last.x, e.clientY - last.y);
          last = { x: e.clientX, y: e.clientY };
          touch();
        });
        ["pointerup", "pointercancel"].forEach(function (t) {
          target.addEventListener(t, function () { last = null; });
        });
      }
      dragify(disc, function (dx, dy) {
        var R = disc.clientWidth / 2;
        w.bx += dx / R * 0.7; w.by += dy / R * 0.7;
        var r = Math.hypot(w.bx, w.by);
        if (r > 1) { w.bx /= r; w.by /= r; }
      });
      dragify(rail, function (dx) {
        w.t = Math.max(-1, Math.min(1, w.t + dx / rail.clientWidth * 2));
      });
      disc.addEventListener("dblclick", function () { w.bx = w.by = 0; touch(); });
      rail.addEventListener("dblclick", function () { w.t = 0; touch(); });
      /* то же самое с клавиатуры: мышь есть не у всех, а колесо — суть урока */
      function keyed(target, move) {
        target.addEventListener("keydown", function (e) {
          var step = e.shiftKey ? 0.1 : 0.02;
          var dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
          var dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
          if (!dx && !dy && e.key !== "Home" && e.key !== "End") return;
          e.preventDefault();
          move(dx, dy, e.key);
          touch();
        });
      }
      keyed(disc, function (dx, dy, key) {
        if (key === "Home" || key === "End") { w.bx = w.by = 0; return; }
        w.bx = Math.max(-1, Math.min(1, w.bx + dx));
        w.by = Math.max(-1, Math.min(1, w.by + dy));
        var r = Math.hypot(w.bx, w.by);
        if (r > 1) { w.bx /= r; w.by /= r; }
      });
      keyed(rail, function (dx, dy, key) {
        if (key === "Home") { w.t = -1; return; }
        if (key === "End") { w.t = 1; return; }
        w.t = Math.max(-1, Math.min(1, w.t + dx));
      });
      var rst = el.querySelector("[data-wreset]");
      if (rst) rst.addEventListener("click", function () { w.bx = w.by = 0; w.t = 0; touch(); });
    });

    /* ползунки contrast / pivot / sat */
    root.querySelectorAll("input[data-param]").forEach(function (r) {
      var out = r.closest(".lab-row").querySelector(".sv");
      function apply() {
        st[r.dataset.param] = +r.value / 100;
        if (out) out.textContent = r.dataset.param === "pivot" ? (+r.value / 100).toFixed(2) : r.value + "%";
        touch();
      }
      r.addEventListener("input", apply);
    });

    /* виды прибора */
    var names = { curve: "КРИВАЯ ПЕРЕНОСА · IRE", waveform: "WAVEFORM · IRE", parade: "PARADE · R G B", vector: "VECTORSCOPE" };
    root.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("[data-view]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.view = b.dataset.view;
        var nm = root.querySelector("[data-scope-name]");
        if (nm) nm.textContent = names[st.view] || st.view;
        board.update();
      });
    });

    /* кадры */
    root.querySelectorAll("[data-frame]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("[data-frame]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var next = new Image();
        next.onload = function () { img.src = next.src; measureRaw(); touch(); };
        next.src = "../assets/img/" + b.dataset.frame + ".webp";
      });
    });

    /* сценарии-задания */
    root.querySelectorAll("[data-scene]").forEach(function (b) {
      b.addEventListener("click", function () {
        root.querySelectorAll("[data-scene]").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        st.scene = b.dataset.scene;
        touch();
      });
    });

    /* общий сброс грейда (сценарий и вид остаются) */
    var all = root.querySelector("[data-reset-all]");
    if (all) all.addEventListener("click", function () {
      ["lift", "gamma", "gain", "offset"].forEach(function (n) { st[n].bx = st[n].by = 0; st[n].t = 0; });
      st.contrast = 1; st.pivot = 0.435; st.sat = 1;
      root.querySelectorAll("input[data-param]").forEach(function (r) {
        r.value = { contrast: 100, pivot: 43.5, sat: 100 }[r.dataset.param];
        var out = r.closest(".lab-row").querySelector(".sv");
        if (out) out.textContent = r.dataset.param === "pivot" ? "0.44" : r.value + "%";
      });
      touch();
    });

    function boot() { measureRaw(); touch(); }
    if (img.complete && img.naturalWidth) boot();
    else img.addEventListener("load", boot);
    window.addEventListener("resize", readout);
    return board;
  }

  window.PobubnimWheels = { mount: mount };
})();
