/* ПОБУБНИМ — доска «RAW или log» (uroki/raw-ili-log.html).

   Считает, сколько РАЗНЫХ кодов файл тратит на каждую ступень экспозиции и что
   из этого следует при правке в посте. Кривые — опубликованные (EDU_BASE §8д.4,6),
   числа сверены в §8п.1.

   Три вещи, которые доска показывает арифметикой, а не словами:
   1. Rec.709 обрывается на L = 1,0 — это всего +2,5 ступени над серой картой,
      и всё, что ярче, сенсор видел, а файл не сохранил.
   2. S-Log3 тянет до потолка сенсора, тратя ровно 261,5·lg2 = 78,7 кода на
      ступень в пределе (у серой карты фактически 75,7 — смещение +0,01 ещё влияет).
   3. Линейный RAW тратит коды на света: у серой карты их вдвое больше, чем у log,
      а на пять ступеней ниже — в шесть раз МЕНЬШЕ. «RAW лучше в тенях» — миф;
      преимущество RAW в другом: баланс белого там метаданные (§8б.3).

   МОДЕЛЬ, подписанная на странице: потолок сенсора взят +6,5 ступени над серой
   картой (около 13 ступеней полного диапазона); у конкретной камеры он свой.
   Правка в посте считается в плавающей точке — то есть в лучшем для файла
   случае: единственная потеря, которую видно, это квантование при съёмке. */

(function () {
  var board = document.getElementById("rb");
  if (!board) return;
  var cv = document.getElementById("rb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("rb-stat");

  var W = 880, H = 420;
  var WEDGE = { x: 0, y: 0, w: 440, h: 168 };
  var DEEP = { x: 0, y: 176, w: 440, h: 72 };
  var CURVE = { x: 456, y: 0, w: 424, h: 248 };
  var BARS = { x: 0, y: 258, w: 880, h: 160 };

  var GREY = 0.18;
  var LMAX = GREY * Math.pow(2, 6.5);     /* потолок сенсора — модель */
  var STOPS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

  /* [подпись, кодировка, максимальный код] */
  var FMT = [
    ["RAW 12 бит", "lin", 4095],
    ["RAW 14 бит", "lin", 16383],
    ["S-Log3 10 бит", "slog3", 1023],
    ["Rec.709 10 бит", "r709", 1023]
  ];

  var state = { fmt: 2, exp: 0, wb: 40 };

  /* ---------- кривые ---------- */
  function oetf709(L) {
    if (L < 0) L = 0;
    return L < 0.018 ? 4.5 * L : 1.099 * Math.pow(L, 0.45) - 0.099;
  }
  function eotf709(v) {
    return v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45);
  }
  function slog3(x) {
    if (x < 0) x = 0;
    return x >= 0.01125 ? (420 + Math.log((x + 0.01) / 0.19) / Math.LN10 * 261.5) / 1023
                        : (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023;
  }
  function slog3Inv(v) {
    var c = v * 1023;
    return c >= 171.2102946929 ? Math.pow(10, (c - 420) / 261.5) * 0.19 - 0.01
                               : (c - 95) * 0.01125 / (171.2102946929 - 95);
  }

  function fmt() { return FMT[state.fmt]; }
  function isRaw() { return fmt()[1] === "lin"; }
  function maxCode() { return fmt()[2]; }

  /* потолок формата в единицах сцены */
  function ceiling() {
    var f = fmt()[1];
    if (f === "r709") return Math.min(LMAX, 1.0);
    if (f === "slog3") return Math.min(LMAX, slog3Inv(1));
    return LMAX;
  }

  /* сцена → целый код файла */
  function capture(L) {
    var f = fmt()[1], m = maxCode(), v;
    if (L < 0) L = 0;
    if (L > LMAX) L = LMAX;                 /* сенсор упёрся — это уже не вернуть */
    if (f === "lin") v = L / LMAX;
    else if (f === "slog3") v = slog3(L);
    else v = oetf709(L);
    if (v > 1) v = 1;
    return Math.round(v * m);
  }

  /* код файла → линейный свет */
  function decode(code) {
    var f = fmt()[1], m = maxCode(), v = code / m;
    if (f === "lin") return v * LMAX;
    if (f === "slog3") return slog3Inv(v);
    return eotf709(v);
  }

  /* сколько разных кодов приходится на октаву, начинающуюся с L */
  function perStop(L) {
    var hi = Math.min(L * 2, LMAX), lo = Math.min(L, LMAX);
    return capture(hi) - capture(lo);
  }

  /* ---------- баланс белого ---------- */
  /* Промах по балансу на камере: усиления по каналам, нормированные по яркости,
     чтобы промах менял цвет, а не экспозицию. */
  function camGain() {
    var k = state.wb / 100;
    var g = [1 + 0.45 * k, 1, 1 - 0.30 * k];
    var y = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    return [g[0] / y, g[1] / y, g[2] / y];
  }

  /* Итог для нейтрального участка сцены яркости L: что получится после правки.
     В RAW баланс — метаданные, значит промах камеры в файл не попал вовсе.
     В log и 709 он запечён, и вернуть его можно только делением уже записанного. */
  function through(L) {
    var g = camGain(), e = Math.pow(2, state.exp), out = [0, 0, 0];
    for (var c = 0; c < 3; c++) {
      if (isRaw()) out[c] = decode(capture(L)) * e;
      else out[c] = decode(capture(L * g[c])) / g[c] * e;
    }
    return out;
  }

  /* насколько неверен цвет нейтрального участка после правки */
  function castAt(L) {
    var v = through(L);
    var mx = Math.max(v[0], v[1], v[2]), mn = Math.min(v[0], v[1], v[2]);
    return mx > 0 ? (mx - mn) / mx * 100 : 0;
  }

  /* самый яркий нейтральный участок, где цвет уже не вернуть */
  function worstCast() {
    var worst = 0;
    STOPS.forEach(function (s) {
      var c = castAt(GREY * Math.pow(2, s));
      if (c > worst) worst = c;
    });
    return worst;
  }

  function clipped() {
    var n = 0;
    STOPS.forEach(function (s) {
      if (GREY * Math.pow(2, s) > ceiling() + 1e-9) n++;
    });
    return n;
  }

  function headroom() { return Math.log(ceiling() / GREY) / Math.LN2; }

  /* ---------- вывод на экран ---------- */
  function show(L) {
    var v = through(L);
    return [Math.round(oetf709(Math.min(v[0], 1)) * 255),
            Math.round(oetf709(Math.min(v[1], 1)) * 255),
            Math.round(oetf709(Math.min(v[2], 1)) * 255)];
  }
  function css(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

  /* ---------- рисование ---------- */
  function draw() {
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, W, H);
    wedge();
    deep();
    curve();
    bars();
    stats();
  }

  function panel(p, title) {
    ctx.fillStyle = "rgba(18,16,15,0.9)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText(title, p.x + 12, p.y + 17);
  }

  /* ступенчатый клин: по патчу на ступень сцены, в двух видах */
  function wedge() {
    panel(WEDGE, "СЕРАЯ ШКАЛА СЦЕНЫ · ПО СТУПЕНИ НА ПАТЧ");
    var x0 = WEDGE.x + 10, w = (WEDGE.w - 20) / STOPS.length;
    var y1 = WEDGE.y + 38, y2 = WEDGE.y + 100, h = 42;
    var g = camGain(), m = maxCode();
    ctx.font = "500 9px 'JetBrains Mono', monospace";

    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.fillText("ЧТО ЛЕЖИТ В ФАЙЛЕ (яркость патча = значение кода)", x0, y1 - 6);
    ctx.fillText("ЧТО НА ЭКРАНЕ ПОСЛЕ ПРАВКИ", x0, y2 - 6);

    STOPS.forEach(function (s, i) {
      var L = GREY * Math.pow(2, s), x = x0 + i * w;

      /* верхний ряд — сами коды файла: у линейного RAW они прижаты к верху шкалы,
         у логарифма размазаны ровно, у 709 упираются в потолок раньше всех */
      var c = [0, 0, 0];
      for (var k = 0; k < 3; k++) {
        c[k] = Math.round(capture(isRaw() ? L : L * g[k]) / m * 255);
      }
      ctx.fillStyle = css(c);
      ctx.fillRect(x, y1, w - 2, h);

      /* нижний ряд — результат после конверсии и правки */
      ctx.fillStyle = css(show(L));
      ctx.fillRect(x, y2, w - 2, h);

      if (L > ceiling() + 1e-9) {
        ctx.strokeStyle = "#e0553c";
        ctx.strokeRect(x + 0.5, y1 + 0.5, w - 3, h - 1);
        ctx.strokeRect(x + 0.5, y2 + 0.5, w - 3, h - 1);
      }
      ctx.fillStyle = s === 0 ? "#f0c46e" : "rgba(245,239,226,0.45)";
      ctx.fillText((s > 0 ? "+" : "") + s, x + w / 2 - 6, y2 + h + 13);
    });

    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.fillText("ступени от серой карты", x0, y2 + h + 26);
    var cl = clipped();
    if (cl) {
      ctx.fillStyle = "#e0553c";
      ctx.fillText("красным — ступеней, которых в файле уже нет: " + cl,
        x0 + 132, y2 + h + 26);
    }
  }

  /* та же тень, поднятая в посте, но крупно — здесь видно полосы */
  function deep() {
    panel(DEEP, "ТЕНЬ −5…−3 СТ., ПОДНЯТАЯ НА +3 · КРУПНО");
    var x0 = DEEP.x + 10, y0 = DEEP.y + 26, w = DEEP.w - 20, h = 26;
    var seen = {};
    for (var i = 0; i < w; i++) {
      var s = -5 + 2 * i / (w - 1);
      var L = GREY * Math.pow(2, s);
      var code = capture(L);
      seen[code] = 1;
      var lin = decode(code) * 8;          /* +3 ступени */
      var v = Math.round(oetf709(Math.min(lin, 1)) * 255);
      ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
      ctx.fillRect(x0 + i, y0, 1, h);
    }
    ctx.strokeStyle = "rgba(245,239,226,0.12)";
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, h + 1);
    ctx.fillStyle = "rgba(245,239,226,0.5)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.fillText("разных кодов на эти две ступени: " + Object.keys(seen).length,
      x0, y0 + h + 14);
  }

  /* кривая: сцена в ступенях → код файла */
  function curve() {
    panel(CURVE, "СЦЕНА → КОД ФАЙЛА");
    var x0 = CURVE.x + 46, y0 = CURVE.y + 32, w = CURVE.w - 70, h = CURVE.h - 66;
    var S0 = -7, S1 = 6;
    function px(s) { return x0 + (s - S0) / (S1 - S0) * w; }
    function py(v) { return y0 + h - v * h; }

    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      ctx.beginPath();
      ctx.moveTo(x0, py(v) + 0.5); ctx.lineTo(x0 + w, py(v) + 0.5);
      ctx.stroke();
      ctx.fillText(Math.round(v * 100) + " %", x0 - 38, py(v) + 3);
    });
    for (var s = S0 + 1; s < S1; s += 2) {
      ctx.fillText((s > 0 ? "+" : "") + s, px(s) - 5, y0 + h + 14);
    }

    /* все три кривые: своя — ярко, чужие — приглушённо */
    var keep = state.fmt;
    [0, 2, 3].forEach(function (k) {
      state.fmt = k;
      var mine = (k === keep) || (k === 0 && keep === 1);
      ctx.strokeStyle = mine ? "#f0c46e" : "rgba(245,239,226,0.22)";
      ctx.lineWidth = mine ? 2 : 1;
      ctx.beginPath();
      for (var i = 0; i <= 260; i++) {
        var ss = S0 + (S1 - S0) * i / 260;
        var v = capture(GREY * Math.pow(2, ss)) / maxCode();
        ctx[i ? "lineTo" : "moveTo"](px(ss), py(v));
      }
      ctx.stroke();
    });
    state.fmt = keep;
    ctx.lineWidth = 1;

    /* серая карта и потолок формата */
    ctx.strokeStyle = "rgba(240,196,110,0.45)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px(0), y0); ctx.lineTo(px(0), y0 + h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(240,196,110,0.75)";
    ctx.fillText("серая карта", px(0) - 26, y0 - 6);

    var hr = headroom();
    ctx.strokeStyle = "#e0553c";
    ctx.beginPath();
    ctx.moveTo(px(hr), y0); ctx.lineTo(px(hr), y0 + h);
    ctx.stroke();
    ctx.fillStyle = "#e0553c";
    ctx.fillText("потолок +" + hr.toFixed(1).replace(".", ",") + " ст.",
      Math.min(px(hr) + 4, x0 + w - 78), y0 + 10);

    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.fillText("серым — две другие записи для сравнения", x0, CURVE.y + CURVE.h - 10);
  }

  /* кодов на ступень — по ступеням */
  function bars() {
    panel(BARS, "СКОЛЬКО РАЗНЫХ КОДОВ ФАЙЛ ТРАТИТ НА КАЖДУЮ СТУПЕНЬ");
    var x0 = BARS.x + 52, y0 = BARS.y + 30, w = BARS.w - 74, h = BARS.h - 60;
    var bw = w / STOPS.length;
    var TOP = 8192;

    function bh(v) { return v < 1 ? 0 : Math.log(v) / Math.log(TOP) * h; }

    ctx.strokeStyle = "rgba(245,239,226,0.09)";
    ctx.fillStyle = "rgba(245,239,226,0.35)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    [1, 10, 100, 1000].forEach(function (v) {
      var y = y0 + h - bh(v);
      ctx.beginPath();
      ctx.moveTo(x0, y + 0.5); ctx.lineTo(x0 + w, y + 0.5);
      ctx.stroke();
      ctx.fillText(v, x0 - 34, y + 3);
    });

    STOPS.forEach(function (s, i) {
      var L = GREY * Math.pow(2, s), v = perStop(L);
      var x = x0 + i * bw, height = bh(v);
      ctx.fillStyle = v < 1 ? "rgba(224,85,60,0.35)" : (s === 0 ? "#f0c46e" : "#7f8fa8");
      ctx.fillRect(x + 4, y0 + h - height, bw - 8, Math.max(height, 1));
      ctx.fillStyle = "rgba(245,239,226,0.75)";
      ctx.fillText(v < 1 ? "нет" : Math.round(v), x + bw / 2 - 9, y0 + h - height - 5);
      ctx.fillStyle = s === 0 ? "#f0c46e" : "rgba(245,239,226,0.4)";
      ctx.fillText((s > 0 ? "+" : "") + s, x + bw / 2 - 5, y0 + h + 14);
    });
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.fillText("ступени от серой карты · шкала логарифмическая", x0, BARS.y + BARS.h - 8);
  }

  /* ---------- показания ---------- */
  function n1(v) { return (Math.round(v * 10) / 10).toString().replace(".", ","); }

  function verdict() {
    var cast = worstCast();
    if (clipped() >= 3) return ["света уже не вернуть", "warn"];
    if (cast > 8) return ["цвет в светах не вернуть", "warn"];
    if (perStop(GREY * Math.pow(2, -5)) < 8) return ["в тенях будут полосы", "warn"];
    if (cast > 1) return ["цвет почти вернулся", ""];
    return ["правится без потерь", ""];
  }

  function stats() {
    var v = verdict(), cast = worstCast();
    statEl.innerHTML =
      "<span><i>КОДОВ НА СТУПЕНЬ У СЕРОГО</i>" + Math.round(perStop(GREY)) + "</span>" +
      '<span class="' + (perStop(GREY * Math.pow(2, -5)) < 8 ? "warn" : "") +
        '"><i>КОДОВ НА ТЕНЬ −5 СТ.</i>' + Math.round(perStop(GREY * Math.pow(2, -5))) + "</span>" +
      '<span class="' + (headroom() < 3 ? "warn" : "") + '"><i>ЗАПАС НАД СЕРЫМ</i>+' +
        n1(headroom()) + " ст.</span>" +
      '<span class="' + (cast > 1 ? "warn" : "") + '"><i>ЦВЕТ ПОСЛЕ ПРАВКИ ББ</i>' +
        (cast < 0.5 ? "вернулся точно" : "промах " + n1(cast) + " %") + "</span>" +
      '<span class="' + v[1] + '"><i>ВЕРДИКТ</i>' + v[0] + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    if (b.hasAttribute("data-fmt")) state.fmt = +b.dataset.fmt;
    draw();
  });
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-exp")) {
      state.exp = +r.value / 10;
      sv.textContent = (state.exp > 0 ? "+" : "") + n1(state.exp) + " ст.";
    } else if (r.hasAttribute("data-wb")) {
      state.wb = +r.value;
      sv.textContent = state.wb === 0 ? "точно"
        : (state.wb > 0 ? "теплее на " : "холоднее на ") + Math.abs(state.wb) + " %";
    }
    draw();
  });

  draw();
  window.PobubnimRawLog = {
    state: state, draw: draw, FMT: FMT, LMAX: LMAX, GREY: GREY, STOPS: STOPS,
    capture: capture, decode: decode, perStop: perStop, ceiling: ceiling,
    headroom: headroom, through: through, castAt: castAt, worstCast: worstCast,
    camGain: camGain, clipped: clipped, oetf709: oetf709, slog3: slog3,
    slog3Inv: slog3Inv, eotf709: eotf709
  };
})();
