/* ПОБУБНИМ — доска «глубина резкости» (uroki/glubina-rezkosti.html).
   Кружки на кадре — это буквально кружки нерезкости: точечный источник света
   на дистанции d превращается в диск диаметром f²·|d−s| / (N·d·(s−f)) на
   сенсоре. Никакой имитации размытия: радиус берётся из формулы (EDU_BASE §8и),
   считает assets/js/dof.js. */

(function () {
  var board = document.getElementById("db");
  if (!board || !window.PobubnimDof) return;
  var D = window.PobubnimDof;

  var cv = document.getElementById("db-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("db-stat");
  var rulerEl = document.getElementById("db-ruler");

  var state = { f: 50, N: 2.8, s: 3, fmt: 0 };

  /* огни фона: детерминированные позиции, чтобы картинка не прыгала */
  var LIGHTS = [];
  (function () {
    var seed = 7;
    function rnd() {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    }
    for (var i = 0; i < 46; i++) {
      var d = 4 + Math.pow(rnd(), 1.6) * 46;          /* 4…50 м */
      LIGHTS.push({
        d: d,
        x: rnd(),
        y: 0.18 + rnd() * 0.52,
        warm: rnd(),
        power: 0.5 + rnd() * 0.5
      });
    }
    LIGHTS.sort(function (a, b) { return b.d - a.d; });   /* дальние рисуем первыми */
  })();

  function fmt() { return D.FORMATS[state.fmt]; }

  function calc() {
    var F = fmt();
    var c = D.coc("print", F[1], F[2], 3840);
    var d = D.dof(state.f, state.N, state.s * 1000, c);
    return { c: c, dof: d, sensorW: F[1] };
  }

  /* диаметр пятна в пикселях канваса для объекта на дистанции d (метры) */
  function spotPx(d, st) {
    st = st || calc();
    var mm = D.blur(state.f, state.N, state.s * 1000, d * 1000);
    return mm * (cv.width / st.sensorW);
  }

  function draw() {
    var st = calc();
    var W = cv.width, H = cv.height;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0b0c10");
    g.addColorStop(0.62, "#121319");
    g.addColorStop(1, "#0a0a0c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* огни фона: каждый — диск размером с кружок нерезкости */
    LIGHTS.forEach(function (l) {
      var r = Math.max(1.2, spotPx(l.d, st) / 2);
      var x = l.x * W, y = l.y * H;
      /* дальше — тусклее: свет падает как 1/d² */
      var fade = Math.min(1, 26 / (l.d * l.d) * 12) * l.power;
      var alpha = Math.max(0.05, Math.min(0.9, fade / Math.max(1, r / 6)));
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      var warm = l.warm > 0.55;
      grad.addColorStop(0, "rgba(" + (warm ? "255,214,150" : "196,214,255") + "," + alpha + ")");
      grad.addColorStop(0.72, "rgba(" + (warm ? "240,196,120" : "160,186,240") + "," + (alpha * 0.75) + ")");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    /* объект в фокусе: силуэт головы и плеч, резкость по формуле */
    var objSpot = spotPx(state.s, st);
    drawFigure(W * 0.32, H * 0.94, H * 0.72, objSpot);

    /* передний план — трава на 60% дистанции объекта */
    var frontD = Math.max(0.3, state.s * 0.55);
    drawGrass(spotPx(frontD, st));

    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    ctx.fillText("фокус " + state.s.toFixed(1).replace(".", ",") + " м · " +
      state.f + " мм · f/" + String(state.N).replace(".", ","), 16, 24);

    stats(st);
    ruler(st);
  }

  function drawFigure(cx, base, h, spot) {
    var blur = Math.max(0, spot / 2);
    ctx.save();
    ctx.filter = blur > 0.4 ? "blur(" + blur.toFixed(1) + "px)" : "none";
    ctx.fillStyle = "#171922";
    ctx.strokeStyle = "rgba(240,214,150,0.30)";
    ctx.lineWidth = 2;
    var headR = h * 0.15;
    ctx.beginPath();
    ctx.arc(cx, base - h * 0.82, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.30, base);
    ctx.quadraticCurveTo(cx - h * 0.26, base - h * 0.60, cx, base - h * 0.66);
    ctx.quadraticCurveTo(cx + h * 0.26, base - h * 0.60, cx + h * 0.30, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawGrass(spot) {
    var blur = Math.max(0, spot / 2);
    ctx.save();
    ctx.filter = blur > 0.4 ? "blur(" + blur.toFixed(1) + "px)" : "none";
    ctx.strokeStyle = "rgba(60,72,58,0.85)";
    ctx.lineWidth = 3;
    for (var i = 0; i < 42; i++) {
      var x = (i / 41) * cv.width + ((i * 37) % 11) - 5;
      var hgt = 26 + ((i * 53) % 34);
      ctx.beginPath();
      ctx.moveTo(x, cv.height);
      ctx.quadraticCurveTo(x + 6, cv.height - hgt * 0.6, x + ((i % 3) - 1) * 10, cv.height - hgt);
      ctx.stroke();
    }
    ctx.restore();
  }

  function m(v) {
    if (!isFinite(v)) return "∞";
    if (v < 1000) return Math.round(v / 10) + " см";
    return (v / 1000).toLocaleString("ru-RU", { maximumFractionDigits: v < 10000 ? 2 : 1 }) + " м";
  }

  function stats(st) {
    var d = st.dof;
    var bgSpot = spotPx(30, st);
    statEl.innerHTML =
      '<span><i>РЕЗКОСТЬ</i>' + m(d.near) + " – " + m(d.far) + "</span>" +
      '<span><i>ГЛУБИНА</i>' + (isFinite(d.total) ? m(d.total) : "до ∞") + "</span>" +
      '<span><i>ГИПЕРФОКАЛ</i>' + m(d.H) + "</span>" +
      '<span><i>ОГОНЬ НА 30 М</i>' + Math.round(bgSpot) + " px</span>";
  }

  var RMIN = 0.3, RMAX = 60;
  function pos(v) {
    if (!isFinite(v) || v >= RMAX) return 100;
    if (v <= RMIN) return 0;
    return (Math.log(v) - Math.log(RMIN)) / (Math.log(RMAX) - Math.log(RMIN)) * 100;
  }
  function ruler(st) {
    var d = st.dof;
    var a = pos(d.near / 1000), b = pos(d.far / 1000);
    rulerEl.innerHTML =
      '<i class="zone" style="left:' + a + "%;width:" + Math.max(1.5, b - a) + '%"></i>' +
      '<i class="mark" style="left:' + pos(state.s) + '%"></i>';
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var row = r.closest(".lab-row");
    /* у data-focal значение пустое, поэтому проверяем наличие атрибута, а не его */
    if (r.hasAttribute("data-focal")) {
      state.f = +r.value;
      row.querySelector(".sv").textContent = state.f + " мм";
    } else if (r.hasAttribute("data-ap")) {
      var APS = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16];
      state.N = APS[Math.min(APS.length - 1, +r.value)];
      row.querySelector(".sv").textContent = "f/" + String(state.N).replace(".", ",");
    } else if (r.hasAttribute("data-dist")) {
      state.s = +r.value / 10;
      row.querySelector(".sv").textContent = state.s.toFixed(1).replace(".", ",") + " м";
    }
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(board.querySelectorAll(".vbtn"), function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    state.fmt = +b.dataset.fmt;
    draw();
  });

  draw();
  window.PobubnimDofBoard = { state: state, calc: calc, spotPx: spotPx, draw: draw };
})();
