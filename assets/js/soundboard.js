/* ПОБУБНИМ — доска «звук: расстояние против цены микрофона»
   (uroki/petlichka-ili-pushka.html).

   Считает, а не изображает. Прямое поле падает по обратным квадратам,
   отражённое в комнате от расстояния почти не зависит, и точка их равенства —
   критическое расстояние r_c = 0,057·√(V/T60)·√Q (вывод и сверка — EDU_BASE §8о.1).
   Нижняя панель — импульсный отклик: прямой щелчок и хвост, затухающий на
   60 дБ за время реверберации T60.

   Модель (подписана на странице): ранние отражения расставлены по правдоподобным
   задержкам, а не рассчитаны по геометрии конкретной комнаты; Q пушки взят для
   речевой середины. Всё остальное — формулы. */

(function () {
  var board = document.getElementById("sb");
  if (!board) return;
  var cv = document.getElementById("sb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("sb-stat");

  var DIST = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 4, 5];
  var MICS = [["Петличка", 1], ["Кардиоида", 3], ["Суперкардиоида", 3.9], ["Пушка", 10]];
  /* [название, объём м³, время реверберации с] */
  var ROOMS = [["Глухая студия", 40, 0.25], ["Комната с мебелью", 60, 0.5],
               ["Пустая комната", 60, 0.9], ["Зал, ресторан", 600, 1.2],
               ["Ангар, храм", 3000, 2.5]];

  var state = { dist: 10, mic: 0, room: 1 };

  function d() { return DIST[state.dist]; }
  function Q() { return MICS[state.mic][1]; }
  function T60() { return ROOMS[state.room][2]; }
  function V() { return ROOMS[state.room][1]; }

  /* критическое расстояние: граница, за которой отражений больше, чем голоса */
  function rc() { return 0.057 * Math.sqrt(V() / T60()) * Math.sqrt(Q()); }
  /* уровень прямого звука относительно петлички в 20 см */
  function directDb() { return -20 * Math.log(d() / 0.2) / Math.LN10; }
  /* уровень отражённого поля: он равен прямому на критическом расстоянии */
  function reverbDb() { return -20 * Math.log(rc() / 0.2) / Math.LN10; }
  /* отношение прямого к отражённому */
  function dr() { return directDb() - reverbDb(); }
  /* доля отражений по энергии */
  function wet() { return 1 / (1 + Math.pow(10, dr() / 10)); }

  function verdict() {
    var r = dr();
    if (r >= 10) return ["сухо, как в студии", ""];
    if (r >= 3) return ["речь чистая, комната слышна", ""];
    if (r >= -3) return ["комната вровень с голосом", "warn"];
    return ["как из бочки", "warn"];
  }

  /* ---------- рисование ---------- */
  var W = 880, H = 420;
  var PLAN = { x: 40, y: 18, w: 800, h: 212 };
  var TALENT = { x: 130, y: PLAN.y + PLAN.h / 2 };
  var SCALE = 128;                     /* пикселей на метр плана */
  var IR = { x: 92, y: 392, w: 748, h: 128 };
  var TMAX = 3;                        /* секунд на оси отклика */

  function draw() {
    ctx.clearRect(0, 0, W, H);
    plan();
    impulse();
    stats();
  }

  function plan() {
    ctx.fillStyle = "#121110";
    ctx.fillRect(PLAN.x, PLAN.y, PLAN.w, PLAN.h);
    ctx.strokeStyle = "rgba(245,239,226,0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PLAN.x + 0.5, PLAN.y + 0.5, PLAN.w - 1, PLAN.h - 1);

    var mx = TALENT.x + d() * SCALE;
    var w = wet();

    /* отражения: путь голос → стена → микрофон, яркость по доле отражений */
    var walls = [PLAN.y + 8, PLAN.y + PLAN.h - 8];
    ctx.lineWidth = 1;
    for (var i = 0; i < 6; i++) {
      var wy = walls[i % 2];
      var bx = PLAN.x + 60 + (i * 137 % 520);
      ctx.strokeStyle = "rgba(120,170,255," + (0.08 + 0.5 * w) + ")";
      ctx.beginPath();
      ctx.moveTo(TALENT.x, TALENT.y);
      ctx.lineTo(bx, wy);
      ctx.lineTo(mx, TALENT.y);
      ctx.stroke();
    }

    /* граница прямого звука */
    var r = rc() * SCALE;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(240,196,110,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(TALENT.x, TALENT.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(240,196,110,0.75)";
    ctx.font = "500 11px 'JetBrains Mono', monospace";
    ctx.fillText("ГРАНИЦА " + fmt(rc()) + " М", TALENT.x + r + 8, TALENT.y - r * 0.7 + 4);

    /* прямой звук */
    ctx.strokeStyle = "rgba(245,239,226,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(TALENT.x, TALENT.y);
    ctx.lineTo(mx, TALENT.y);
    ctx.stroke();

    /* герой */
    ctx.fillStyle = "#f5efe2";
    ctx.beginPath();
    ctx.arc(TALENT.x, TALENT.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "500 10.5px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.65)";
    ctx.fillText("ГОЛОС", TALENT.x - 18, TALENT.y + 30);

    /* микрофон */
    ctx.fillStyle = "#f0c46e";
    ctx.fillRect(mx - 5, TALENT.y - 16, 10, 32);
    ctx.beginPath();
    ctx.arc(mx, TALENT.y - 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(240,196,110,0.9)";
    ctx.fillText(MICS[state.mic][0].toUpperCase(), mx - 20, TALENT.y + 36);
    ctx.fillStyle = "rgba(245,239,226,0.6)";
    ctx.fillText(fmt(d()) + " М", (TALENT.x + mx) / 2 - 14, TALENT.y - 12);
  }

  /* импульсный отклик: щелчок и хвост, −60 дБ за T60.
     Ось времени сжата корнем — иначе ранние отражения (10–60 мс) слипаются
     в одну линию у нуля. Сжатие подписано прямо на панели и в подписи под доской. */
  function xOf(t) { return IR.x + IR.w * Math.sqrt(Math.min(t, TMAX) / TMAX); }

  function impulse() {
    var base = IR.y, t60 = T60();
    var dAmp = amp(directDb()), rAmp = amp(reverbDb());

    ctx.strokeStyle = "rgba(245,239,226,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(IR.x - 22, base + 0.5);
    ctx.lineTo(IR.x + IR.w, base + 0.5);
    ctx.stroke();

    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.45)";
    ctx.fillText("ИМПУЛЬСНЫЙ ОТКЛИК · ХВОСТ ГАСНЕТ НА 60 дБ ЗА " + fmt(t60) +
      " С · ОСЬ ВРЕМЕНИ СЖАТА", IR.x - 22, base - IR.h - 8);

    /* хвост реверберации */
    ctx.beginPath();
    ctx.moveTo(IR.x, base);
    for (var px = 0; px <= IR.w; px++) {
      var t = TMAX * Math.pow(px / IR.w, 2);
      ctx.lineTo(IR.x + px, base - rAmp * Math.pow(10, -3 * t / t60) * IR.h);
    }
    ctx.lineTo(IR.x + IR.w, base);
    ctx.closePath();
    ctx.fillStyle = "rgba(120,170,255,0.32)";
    ctx.fill();

    /* ранние отражения — модель: правдоподобные задержки, а не расчёт стен */
    var early = [0.011, 0.019, 0.028, 0.041, 0.058, 0.077];
    ctx.strokeStyle = "rgba(120,170,255,0.85)";
    ctx.lineWidth = 2;
    for (var i = 0; i < early.length; i++) {
      var a = rAmp * Math.pow(10, -3 * early[i] / t60) * (1 - i * 0.1);
      ctx.beginPath();
      ctx.moveTo(xOf(early[i]), base);
      ctx.lineTo(xOf(early[i]), base - a * IR.h);
      ctx.stroke();
    }

    /* метки времени */
    ctx.fillStyle = "rgba(245,239,226,0.32)";
    [0.1, 0.5, 1, 2].forEach(function (t) {
      var x = xOf(t);
      ctx.fillRect(x, base + 1, 1, 5);
      ctx.fillText(fmt(t) + " с", x - 10, base + 17);
    });

    /* прямой звук */
    ctx.strokeStyle = "#f5efe2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(IR.x, base);
    ctx.lineTo(IR.x, base - dAmp * IR.h);
    ctx.stroke();
    ctx.fillStyle = "rgba(245,239,226,0.85)";
    ctx.fillText("ГОЛОС", IR.x - 22, base - dAmp * IR.h - 7);
    ctx.fillStyle = "rgba(120,170,255,0.95)";
    ctx.fillText("КОМНАТА", xOf(0.02) + 8, base - rAmp * IR.h - 7);
  }

  /* уровень в дБ → доля высоты панели: ноль на уровне петлички в 20 см, дно −40 дБ */
  function amp(db) { return Math.max(0, Math.min(1, (db + 40) / 42)); }

  function fmt(v) {
    var s = v >= 10 ? v.toFixed(0) : (v < 1 ? v.toFixed(2) : v.toFixed(1));
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  }
  function sgn(v) { return (v > 0 ? "+" : "") + v.toFixed(1).replace(".", ","); }

  function stats() {
    var v = verdict();
    statEl.innerHTML =
      '<span><i>ПРЯМОЙ ЗВУК</i>' + sgn(directDb()) + " дБ</span>" +
      '<span class="' + (dr() < 3 ? "warn" : "") + '"><i>ГОЛОС / КОМНАТА</i>' + sgn(dr()) + " дБ</span>" +
      '<span><i>ГРАНИЦА</i>' + fmt(rc()) + " м</span>" +
      '<span><i>ОТРАЖЕНИЙ</i>' + Math.round(wet() * 100) + " %</span>" +
      '<span class="' + v[1] + '"><i>НА СЛУХ</i>' + v[0] + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r || !r.hasAttribute("data-dist")) return;
    state.dist = +r.value;
    r.closest(".lab-row").querySelector(".sv").textContent = fmt(d()) + " м";
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    var group = b.parentNode;
    [].forEach.call(group.querySelectorAll(".vbtn"), function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    if (b.hasAttribute("data-mic")) state.mic = +b.dataset.mic;
    else if (b.hasAttribute("data-room")) state.room = +b.dataset.room;
    draw();
  });

  draw();
  window.PobubnimSound = {
    state: state, rc: rc, dr: dr, directDb: directDb, reverbDb: reverbDb,
    wet: wet, d: d, Q: Q, T60: T60, V: V, draw: draw
  };
})();
