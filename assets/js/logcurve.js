/* ПОБУБНИМ — доска «Log-кривая в числах»: настоящие кривые по опубликованным
   формулам (docs/EDU_BASE.md §8д.4–6, сверено 26.08):
   - Sony S-Log3 — Technical Summary S-Gamut3/S-Log3 (pro.sony)
   - ARRI LogC3 EI800 — white paper ARRI
   - Rec.709 OETF — ITU-R BT.709
   x — сценовая экспозиция в долях (0.18 = серая карта 18%), V — сигнал 0..1.
   Никаких имитаций: график, якоря и «кодов на стоп» считаются из формул. */

(function () {
  var GREY = 0.18;

  function slog3(x) {
    return x >= 0.01125
      ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023
      : (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023;
  }
  function logc3(x) { /* EI800 */
    var cut = 0.010591, a = 5.555556, b = 0.052272, c = 0.247190,
        d = 0.385537, e = 5.367655, f = 0.092809;
    return x > cut ? c * Math.log10(a * x + b) + d : e * x + f;
  }
  function r709(x) {
    x = Math.max(0, x);
    return x < 0.018 ? 4.5 * x : 1.099 * Math.pow(x, 0.45) - 0.099;
  }

  var CURVES = [
    { key: "slog3", name: "S-Log3", fn: slog3, col: "rgba(245,239,226,0.95)" },
    { key: "logc3", name: "LogC3", fn: logc3, col: "rgba(127,176,105,0.95)" },
    { key: "r709", name: "Rec.709", fn: r709, col: "rgba(224,73,47,0.95)" }
  ];

  function stopsToX(s) { return GREY * Math.pow(2, s); }
  /* потолок кривой: сколько стопов над серым до V=1 (бинарный поиск по формуле) */
  function headroom(fn) {
    var lo = 0, hi = 16;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (fn(stopsToX(mid)) >= 1) hi = mid; else lo = mid;
    }
    return hi;
  }

  function mount(cfg) {
    var root = cfg.root;
    var graphC = cfg.graph, codesC = cfg.codes;
    var st = { exp: 0, on: { slog3: true, logc3: true, r709: true } };
    var S_MIN = -8, S_MAX = 8;

    function X(cv, s) { return 34 + (s - S_MIN) / (S_MAX - S_MIN) * (cv.width - 42); }
    function Y(cv, v) { return cv.height - 22 - Math.max(0, Math.min(1.04, v)) * (cv.height - 34); }

    function drawGraph() {
      var W = graphC.width, H = graphC.height;
      var ctx = graphC.getContext("2d");
      ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, W, H);
      ctx.font = "10px 'JetBrains Mono', monospace";
      /* сетка: горизонтали — проценты сигнала, вертикали — стопы */
      for (var p = 0; p <= 100; p += 20) {
        var y = Y(graphC, p / 100);
        ctx.strokeStyle = p === 100 ? "rgba(224,73,47,0.4)" : "rgba(245,239,226,0.12)";
        ctx.beginPath(); ctx.moveTo(34, y + 0.5); ctx.lineTo(W - 8, y + 0.5); ctx.stroke();
        ctx.fillStyle = "rgba(245,239,226,0.45)";
        ctx.fillText(p, 6, y + 3);
      }
      for (var s = S_MIN; s <= S_MAX; s += 2) {
        var x = X(graphC, s);
        ctx.strokeStyle = s === 0 ? "rgba(245,239,226,0.3)" : "rgba(245,239,226,0.1)";
        ctx.beginPath(); ctx.moveTo(x + 0.5, 12); ctx.lineTo(x + 0.5, H - 22); ctx.stroke();
        ctx.fillStyle = "rgba(245,239,226,0.45)";
        ctx.fillText((s > 0 ? "+" : "") + s, x - 6, H - 8);
      }
      ctx.fillStyle = "rgba(245,239,226,0.55)";
      ctx.fillText("стопы от серой карты →", W - 168, H - 8);
      ctx.save(); ctx.translate(16, 150); ctx.rotate(-Math.PI / 2); ctx.fillText("сигнал, % →", 0, 0); ctx.restore();
      /* кривые */
      CURVES.forEach(function (c) {
        if (!st.on[c.key]) return;
        ctx.strokeStyle = c.col; ctx.lineWidth = 1.8; ctx.beginPath();
        for (var i = 0; i <= 256; i++) {
          var sp = S_MIN + (S_MAX - S_MIN) * i / 256;
          var v = c.fn(stopsToX(sp));
          var px = X(graphC, sp), py = Y(graphC, Math.min(v, 1.02));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
      });
      ctx.lineWidth = 1;
      /* маркеры: серая карта / кожа (+1) / белая бумага (+2.32) с учётом экспозиции */
      var marks = [
        { s: st.exp, nm: "серая 18%" },
        { s: st.exp + 1, nm: "кожа" },
        { s: st.exp + 2.32, nm: "бумага 90%" }
      ];
      marks.forEach(function (m, mi) {
        var x = X(graphC, m.s);
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = "rgba(245,239,226,0.4)";
        ctx.beginPath(); ctx.moveTo(x + 0.5, 12); ctx.lineTo(x + 0.5, H - 22); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(245,239,226,0.75)";
        ctx.fillText(m.nm, Math.min(x - 14, W - 84), 22 + mi * 12);
        CURVES.forEach(function (c) {
          if (!st.on[c.key]) return;
          var v = c.fn(stopsToX(m.s));
          if (v > 1.02) return;
          ctx.fillStyle = c.col;
          ctx.beginPath(); ctx.arc(x, Y(graphC, v), 3, 0, Math.PI * 2); ctx.fill();
        });
      });
    }

    /* «кодов на стоп»: сколько 10-битных кодов достаётся каждому стопу */
    function codesPerStop(fn, s) {
      var v0 = Math.min(1, fn(stopsToX(s))), v1 = Math.min(1, fn(stopsToX(s + 1)));
      return Math.max(0, Math.round((v1 - v0) * 1023));
    }
    var BAR_SERIES = [
      { name: "S-Log3", fn: slog3, col: "rgba(245,239,226,0.85)" },
      { name: "Rec.709", fn: r709, col: "rgba(224,73,47,0.8)" },
      { name: "линейно", fn: function (x) { return Math.min(1, x); }, col: "rgba(96,130,224,0.85)" }
    ];
    function drawCodes() {
      var W = codesC.width, H = codesC.height;
      var ctx = codesC.getContext("2d");
      ctx.fillStyle = "#0b0a09"; ctx.fillRect(0, 0, W, H);
      ctx.font = "10px 'JetBrains Mono', monospace";
      var stops = [-6, -5, -4, -3, -2, -1, 0, 1, 2];
      var max = 560; /* верх шкалы: у линейной верхний стоп ~512 кодов */
      var groupW = (W - 46) / stops.length;
      stops.forEach(function (s, gi) {
        var gx = 38 + gi * groupW;
        BAR_SERIES.forEach(function (b, bi) {
          var n = codesPerStop(b.fn, s);
          var bw = (groupW - 10) / BAR_SERIES.length;
          var bh = n / max * (H - 44);
          ctx.fillStyle = b.col;
          ctx.fillRect(gx + bi * bw, H - 26 - bh, bw - 2, bh);
          if (n > 0 && (n > 35 || bi === 0)) {
            ctx.fillStyle = "rgba(245,239,226,0.6)";
            ctx.fillText(n, gx + bi * bw - 1, H - 30 - bh);
          }
        });
        ctx.fillStyle = "rgba(245,239,226,0.5)";
        ctx.fillText((s > 0 ? "+" : "") + s, gx + groupW / 2 - 12, H - 10);
      });
      ctx.fillStyle = "rgba(245,239,226,0.55)";
      ctx.fillText("стоп →", W - 54, H - 10);
    }

    function chips() {
      var el = cfg.statEl;
      if (!el) return;
      var html = "";
      CURVES.forEach(function (c) {
        if (!st.on[c.key]) return;
        var g = c.fn(stopsToX(st.exp));
        var w = c.fn(stopsToX(st.exp + 2.32));
        var clip = w >= 1;
        html += "<span" + (clip ? ' class="warn"' : "") + ">" + c.name + ": серая " +
          (g * 100).toFixed(0) + "%" + (clip ? " · бумага В ОБРЕЗЕ" : " · бумага " + (w * 100).toFixed(0) + "%") + "</span>";
      });
      html += "<span>экспозиция " + (st.exp > 0 ? "+" : "") + st.exp.toFixed(1) + " стопа</span>";
      el.innerHTML = html;
    }

    function update() { drawGraph(); chips(); }

    root.querySelectorAll("[data-curve]").forEach(function (b) {
      b.addEventListener("click", function () {
        st.on[b.dataset.curve] = !st.on[b.dataset.curve];
        b.classList.toggle("on");
        update();
      });
    });
    var exp = root.querySelector("input[data-exp]");
    if (exp) exp.addEventListener("input", function () {
      st.exp = +exp.value / 10;
      var sv = exp.closest(".lab-row").querySelector(".sv");
      if (sv) sv.textContent = (st.exp > 0 ? "+" : "") + st.exp.toFixed(1);
      update();
    });

    /* якоря в таблицу — из формул, не руками */
    root.querySelectorAll("[data-anchor]").forEach(function (td) {
      var parts = td.dataset.anchor.split(":"); /* кривая:стопы | кривая:head */
      var c = CURVES.filter(function (x) { return x.key === parts[0]; })[0];
      if (!c) return;
      if (parts[1] === "head") {
        td.textContent = "+" + headroom(c.fn).toFixed(1) + " стопа";
      } else {
        var v = c.fn(stopsToX(+parts[1]));
        td.textContent = v >= 1 ? "обрез" : (v * 100).toFixed(1) + "%";
      }
    });

    update(); drawCodes();
  }

  window.PobubnimLogCurve = { mount: mount, slog3: slog3, logc3: logc3, r709: r709 };
})();
