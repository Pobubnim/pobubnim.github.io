/* ПОБУБНИМ — доска «мерцание: откуда на видео полосы»
   (uroki/mercanie-na-video.html).

   Считает, а не рисует полосы «для вида». Лампа на переменном токе светит с
   удвоенной частотой сети: L(t) = (1−m) + m·sin²(2πft). Строка кадра с роллинг-
   шаттером начинает экспозицию позже предыдущей, поэтому каждая строка ловит
   свой кусок пульсации. Экспозиция строки берётся точным интегралом:

     ∫ sin²(2πft) dt = t/2 − sin(4πft)/(8πf)

   Вывод и сверка численным интегрированием — EDU_BASE §8о.4.
   Модель (подписана на странице): глубина пульсации у лампы накаливания взята
   0,3 — у конкретной лампы своя тепловая инерция. */

(function () {
  var board = document.getElementById("fb");
  if (!board) return;
  var cv = document.getElementById("fb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("fb-stat");

  var SHUT = [1 / 25, 1 / 30, 1 / 50, 1 / 60, 1 / 100, 1 / 120, 1 / 200, 1 / 500, 1 / 1000];
  var READ = [1 / 120, 1 / 60, 1 / 30, 1 / 15];
  /* [название, глубина пульсации] */
  var LAMPS = [["Светодиод с ШИМ", 1], ["Люминесцентная", 0.8],
               ["Лампа накаливания", 0.3], ["Окно", 0]];

  var state = { shut: 3, read: 2, mains: 50, lamp: 0 };

  function shutter() { return SHUT[state.shut]; }
  function readout() { return READ[state.read]; }
  function depth() { return LAMPS[state.lamp][1]; }
  function pulse() { return state.mains * 2; }      /* два пика за период сети */

  /* точный интеграл яркости за время выдержки, начиная с момента t0 */
  function exposure(t0) {
    /* в интеграл идёт частота СЕТИ: sin² сам удваивает её до пульсации */
    var T = shutter(), f = state.mains, m = depth();
    var osc = (Math.sin(4 * Math.PI * f * (t0 + T)) - Math.sin(4 * Math.PI * f * t0)) /
      (8 * Math.PI * f);
    return (1 - m) * T + m * (T / 2 - osc);
  }

  var ROWS = 240;

  /* размах полос: (макс − мин) / среднее по строкам кадра */
  function banding() {
    var lo = Infinity, hi = -Infinity, sum = 0;
    for (var r = 0; r < ROWS; r++) {
      var e = exposure(r * readout() / ROWS);
      if (e < lo) lo = e;
      if (e > hi) hi = e;
      sum += e;
    }
    var mean = sum / ROWS;
    return mean > 0 ? (hi - lo) / mean : 0;
  }

  /* сколько периодов пульсации укладывается в выдержку — от этого всё и зависит */
  function periods() { return shutter() * pulse(); }

  function verdict() {
    var b = banding();
    if (b < 0.02) return ["полос нет", ""];
    if (b < 0.1) return ["видно на светлом", "warn"];
    if (b < 0.4) return ["полосы", "warn"];
    return ["кадр в полосах", "warn"];
  }

  /* ---------- рисование ---------- */
  var W = 880, H = 420;

  function scene() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a2723");
    g.addColorStop(0.55, "#221f1c");
    g.addColorStop(1, "#151311");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* пятно света от лампы сверху */
    var pool = ctx.createRadialGradient(W * 0.5, -40, 20, W * 0.5, 120, 460);
    pool.addColorStop(0, "rgba(255,226,170,0.55)");
    pool.addColorStop(1, "rgba(255,226,170,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, W, H);

    /* герой */
    ctx.fillStyle = "#3c3630";
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.46, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W * 0.5 - 150, H);
    ctx.quadraticCurveTo(W * 0.5 - 130, H * 0.62, W * 0.5, H * 0.60);
    ctx.quadraticCurveTo(W * 0.5 + 130, H * 0.62, W * 0.5 + 150, H);
    ctx.closePath();
    ctx.fill();

    /* белая карта слева — на ней полосы видны честнее всего */
    ctx.fillStyle = "#d8d2c4";
    ctx.fillRect(48, H * 0.30, 118, H * 0.46);
    ctx.fillStyle = "rgba(20,18,16,0.6)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText("БЕЛАЯ КАРТА", 56, H * 0.30 + 18);
  }

  function draw() {
    scene();

    var m = depth();
    if (m > 0) {
      var img = ctx.getImageData(0, 0, W, H);
      var d = img.data;
      var mean = 0, k = [];
      for (var r = 0; r < H; r++) {
        k[r] = exposure(r * readout() / H);
        mean += k[r];
      }
      mean /= H;
      for (r = 0; r < H; r++) {
        var f = mean > 0 ? k[r] / mean : 1;
        var row = r * W * 4;
        for (var x = 0; x < W; x++) {
          var i = row + x * 4;
          d[i] = clamp(d[i] * f);
          d[i + 1] = clamp(d[i + 1] * f);
          d[i + 2] = clamp(d[i + 2] * f);
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    profile();

    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.font = "500 13px 'JetBrains Mono', monospace";
    ctx.fillText("СЕТЬ " + state.mains + " Гц · ПУЛЬСАЦИЯ " + pulse() + " Гц · ВЫДЕРЖКА " +
      shutText(shutter()), 16, 26);

    stats();
  }

  /* сколько света досталось каждой строке — та же кривая, что модулирует кадр */
  function profile() {
    var x0 = W - 104, w = 88, k = [], lo = Infinity, hi = -Infinity;
    for (var r = 0; r < H; r++) {
      k[r] = exposure(r * readout() / H);
      if (k[r] < lo) lo = k[r];
      if (k[r] > hi) hi = k[r];
    }
    ctx.fillStyle = "rgba(12,11,10,0.72)";
    ctx.fillRect(x0 - 8, 0, w + 16, H);
    ctx.strokeStyle = "rgba(245,239,226,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 7.5, 0.5, w + 15, H - 1);

    ctx.beginPath();
    for (r = 0; r < H; r++) {
      var t = hi > lo ? (k[r] - lo) / (hi - lo) : 0.5;
      ctx[r ? "lineTo" : "moveTo"](x0 + t * w, r);
    }
    ctx.strokeStyle = "#f0c46e";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(x0 + w / 2, H - 12);
    ctx.fillStyle = "rgba(245,239,226,0.5)";
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.fillText("СВЕТ НА СТРОКУ", -38, 0);
    ctx.restore();
  }

  function clamp(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }
  function shutText(v) { return "1/" + Math.round(1 / v); }

  function stats() {
    var v = verdict(), p = periods();
    var whole = Math.abs(p - Math.round(p)) < 0.01;
    statEl.innerHTML =
      '<span class="' + (v[1]) + '"><i>РАЗМАХ ПОЛОС</i>' +
        Math.round(banding() * 100) + " %</span>" +
      '<span><i>ПУЛЬСАЦИЯ</i>' + pulse() + " Гц</span>" +
      '<span class="' + (whole ? "" : "warn") + '"><i>ПЕРИОДОВ В ВЫДЕРЖКЕ</i>' +
        p.toFixed(2).replace(".", ",") + (whole ? " — целое" : " — не целое") + "</span>" +
      '<span><i>СЧИТЫВАНИЕ КАДРА</i>' + shutText(readout()) + " с</span>" +
      '<span class="' + v[1] + '"><i>НА ЭКРАНЕ</i>' + v[0] + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-shut")) {
      state.shut = +r.value;
      sv.textContent = shutText(shutter());
    } else if (r.hasAttribute("data-read")) {
      state.read = +r.value;
      sv.textContent = shutText(readout());
    }
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    if (b.hasAttribute("data-mains")) state.mains = +b.dataset.mains;
    else if (b.hasAttribute("data-lamp")) state.lamp = +b.dataset.lamp;
    draw();
  });

  draw();
  window.PobubnimFlicker = {
    state: state, exposure: exposure, banding: banding, periods: periods,
    shutter: shutter, readout: readout, depth: depth, pulse: pulse, draw: draw
  };
})();
