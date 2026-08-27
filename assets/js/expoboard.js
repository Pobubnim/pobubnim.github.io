/* ПОБУБНИМ — доска «экспозиционный треугольник» (uroki/ekspozicionnyj-treugolnik.html).
   Три ползунка — три платы: диафрагма платит глубиной резкости, выдержка —
   смазом движения, ISO — шумом. Экспозиция считается по EV (EDU_BASE §8к),
   глубина резкости — по формулам ГРИП (§8и, assets/js/dof.js).
   Шум смоделирован: при усилении отношение сигнал/шум падает как корень из
   числа фотонов — это подписано на странице. */

(function () {
  var board = document.getElementById("eb");
  if (!board || !window.PobubnimDof) return;
  var D = window.PobubnimDof;

  var cv = document.getElementById("eb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("eb-stat");

  var APS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
  var SHUT = [1 / 500, 1 / 250, 1 / 125, 1 / 100, 1 / 50, 1 / 25, 1 / 12];
  var ISOS = [100, 200, 400, 800, 1600, 3200, 6400, 12800];
  var SCENES = [["Солнце", 15], ["Облачно", 13], ["Тень / закат", 11], ["Комната", 7], ["Ночь", 4]];

  var state = { ap: 2, shut: 4, iso: 2, scene: 1, fps: 25 };

  function N() { return APS[state.ap]; }
  function t() { return SHUT[state.shut]; }
  function iso() { return ISOS[state.iso]; }
  function ev() { return SCENES[state.scene][1]; }

  /* отклонение экспозиции в стопах: >0 — пересвет, <0 — темно */
  function offset() {
    var evSet = Math.log(N() * N() / t()) / Math.LN2 - Math.log(iso() / 100) / Math.LN2;
    return ev() - evSet;
  }

  var SENSOR = 36, FOCAL = 50, DIST = 3;          /* полный кадр, 50 мм, герой в 3 м */

  function dof() {
    return D.dof(FOCAL, N(), DIST * 1000, D.coc("print", 36, 24, 3840));
  }
  /* длина смаза в пикселях кадра: герой идёт со скоростью 1,4 м/с поперёк кадра */
  function blurPx() {
    var fovM = (SENSOR / FOCAL) * DIST;            /* ширина поля зрения в метрах */
    return (1.4 * t()) / fovM * cv.width;
  }
  /* относительный шум: усиление на N стопов над базой съедает корень из фотонов */
  function noise() {
    return Math.sqrt(iso() / 100);
  }

  function draw() {
    var W = cv.width, H = cv.height;
    var off = offset();
    var gain = Math.pow(2, off);                   /* во сколько раз кадр ярче нужного */
    var lift = Math.max(0.06, Math.min(2.6, gain));

    ctx.clearRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(26, lift));
    g.addColorStop(0.65, shade(38, lift));
    g.addColorStop(1, shade(18, lift));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* фон: огни, размер — кружок нерезкости на 25 м */
    var bg = D.blur(FOCAL, N(), DIST * 1000, 25000) * (W / SENSOR);
    for (var i = 0; i < 26; i++) {
      var x = ((i * 137) % 100) / 100 * W, y = 30 + ((i * 71) % 45) / 100 * H;
      var r = Math.max(1.5, bg / 2);
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      var a = Math.min(0.85, 0.5 * lift) / Math.max(1, r / 7);
      grad.addColorStop(0, "rgba(255,214,150," + a + ")");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* герой в движении: смаз — несколько копий вдоль пути */
    var smear = blurPx();
    var steps = Math.max(1, Math.min(48, Math.round(smear / 3)));
    for (var s = 0; s < steps; s++) {
      var dx = (s / Math.max(1, steps - 1) - 0.5) * smear;
      ctx.globalAlpha = 1 / steps;
      figure(W * 0.42 + dx, H * 0.95, H * 0.66, lift);
    }
    ctx.globalAlpha = 1;

    if (state.iso > 0) grain(noise(), lift);

    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    ctx.fillText("f/" + String(N()).replace(".", ",") + " · " + shutterText(t()) +
      " · ISO " + iso(), 16, 24);

    stats();
  }

  function shade(base, lift) {
    var v = Math.round(Math.max(0, Math.min(255, base * lift)));
    return "rgb(" + v + "," + Math.round(v * 1.02) + "," + Math.round(v * 1.1) + ")";
  }

  function figure(cx, base, h, lift) {
    ctx.fillStyle = shade(14, Math.max(0.35, lift * 0.7));
    ctx.strokeStyle = "rgba(240,214,150," + Math.min(0.5, 0.22 * lift) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, base - h * 0.82, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - h * 0.28, base);
    ctx.quadraticCurveTo(cx - h * 0.24, base - h * 0.60, cx, base - h * 0.66);
    ctx.quadraticCurveTo(cx + h * 0.24, base - h * 0.60, cx + h * 0.28, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /* зерно: амплитуда растёт с усилением, в тенях виднее */
  function grain(k, lift) {
    var img = ctx.getImageData(0, 0, cv.width, cv.height);
    var d = img.data, amp = (k - 1) * 9;
    if (amp <= 0.5) return;
    for (var i = 0; i < d.length; i += 4) {
      var lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      var local = amp * (1.4 - Math.min(1, lum / 120));
      var n = (Math.random() - 0.5) * local * 2;
      d[i] = clamp(d[i] + n);
      d[i + 1] = clamp(d[i + 1] + n);
      d[i + 2] = clamp(d[i + 2] + n * 1.1);
    }
    ctx.putImageData(img, 0, 0);
  }
  function clamp(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  function shutterText(v) {
    if (v >= 1) return v + " с";
    return "1/" + Math.round(1 / v);
  }

  function stats() {
    var off = offset(), d = dof(), sm = blurPx();
    var expo = Math.abs(off) < 0.2 ? "в точку"
      : (off > 0 ? "+" : "") + off.toFixed(1).replace(".", ",") + " ст. " +
        (off > 0 ? "пересвет" : "темно");
    var cls = Math.abs(off) < 0.2 ? "" : (Math.abs(off) > 1.5 ? " warn" : "");
    var need = 1 / (2 * state.fps);
    var motion = Math.abs(Math.log(t() / need) / Math.LN2) < 0.35 ? "как в кино"
      : (t() > need ? "смазанное" : "рваное");
    statEl.innerHTML =
      '<span class="' + cls.trim() + '"><i>ЭКСПОЗИЦИЯ</i>' + expo + "</span>" +
      '<span><i>ГЛУБИНА</i>' + (isFinite(d.total) ? (d.total / 1000).toFixed(2).replace(".", ",") + " м" : "до ∞") + "</span>" +
      '<span><i>СМАЗ</i>' + Math.round(sm) + " px · " + motion + "</span>" +
      '<span><i>ШУМ</i>×' + noise().toFixed(1).replace(".", ",") + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var row = r.closest(".lab-row"), v = +r.value;
    if (r.hasAttribute("data-ap")) {
      state.ap = v;
      row.querySelector(".sv").textContent = "f/" + String(N()).replace(".", ",");
    } else if (r.hasAttribute("data-shut")) {
      state.shut = v;
      row.querySelector(".sv").textContent = shutterText(t());
    } else if (r.hasAttribute("data-iso")) {
      state.iso = v;
      row.querySelector(".sv").textContent = String(iso());
    }
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(board.querySelectorAll(".vbtn"), function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    state.scene = +b.dataset.scene;
    draw();
  });

  draw();
  window.PobubnimExpo = {
    state: state, offset: offset, dof: dof, blurPx: blurPx, noise: noise,
    N: N, t: t, iso: iso, draw: draw
  };
})();
