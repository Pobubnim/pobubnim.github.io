/* ПОБУБНИМ — калькулятор карты памяти (instrumenty/kalkulyator-karty-pamyati.html).
   Честная математика: МБ = Мбит/с ÷ 8 × секунды. Гигабайты ДЕСЯТИЧНЫЕ, как
   маркируют карты (1 ГБ = 1000 МБ); ГиБ компьютера — отдельной строкой.
   Все числа пресетов и классы скорости — EDU_BASE §8г. */

(function () {
  var paper = document.getElementById("paper");
  var cfg = document.getElementById("cfg");
  if (!paper || !cfg) return;

  var CARDS = [32, 64, 128, 256, 512, 1000];
  /* [подпись, Мбит/с] — типовые режимы из спецификаций производителей (§8г.3) */
  var VID = [
    ["Телефон 4K/30", 25],
    ["Телефон 4K/60", 60],
    ["Камера 4K/25–30", 100],
    ["Камера 4K/50–60", 200],
    ["All-Intra 4K", 600],
    ["Full HD", 30]
  ];
  /* средние веса кадра (§8г.4) — в интерфейсе подписаны как средние */
  var PH = [
    ["JPEG 24 Мп", 10],
    ["RAW 24 Мп", 25],
    ["RAW 45+ Мп", 50]
  ];

  function chipRow(list, unit) {
    return list.map(function (p) {
      return '<button type="button" class="chip" data-v="' + p[1] + '">' + p[0] + " · " + p[1] + " " + unit + "</button>";
    }).join("");
  }
  document.getElementById("chips-v").innerHTML = chipRow(VID, "Мбит/с");
  document.getElementById("chips-p").innerHTML = chipRow(PH, "МБ");
  document.getElementById("chips-c").innerHTML = CARDS.map(function (c) {
    return '<button type="button" class="chip" data-v="' + c + '">' + (c >= 1000 ? "1 ТБ" : c + " ГБ") + "</button>";
  }).join("");

  function bindChips(boxId, inputId) {
    document.getElementById(boxId).addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      document.getElementById(inputId).value = b.dataset.v;
      render();
    });
  }
  bindChips("chips-v", "f-bit");
  bindChips("chips-c", "f-card");
  bindChips("chips-p", "f-shot");

  function clamp(v, lo, hi, dflt) {
    v = parseFloat(String(v).replace(",", "."));
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }
  function num(n) { return n.toLocaleString("ru-RU"); }
  function fmtMB(mb) {
    if (mb >= 1000) {
      var g = mb / 1000;
      return num(g >= 100 ? Math.round(g) : Math.round(g * 10) / 10) + " ГБ";
    }
    return num(Math.round(mb)) + " МБ";
  }
  /* «влезет» округляем ВНИЗ — лишнюю минуту записи не обещаем */
  function fmtDur(sec) {
    if (sec < 60) return Math.floor(sec) + " сек";
    var m = Math.floor(sec / 60);
    if (m < 60) return m + " мин";
    var h = Math.floor(m / 60); m = m % 60;
    return num(h) + " ч " + (m < 10 ? "0" : "") + m + " мин";
  }
  function fmtSpeed(sp) { return num(Math.round(sp * 10) / 10); }
  /* класс скорости SD: гарантия записи V6/V10/V30/V60/V90 = 6/10/30/60/90 МБ/с (§8г.2) */
  function klass(sp) {
    var need = fmtSpeed(sp) + " МБ/с";
    if (sp <= 6) return "V6 или быстрее (поток " + need + ")";
    if (sp <= 10) return "V10 / U1 или быстрее (поток " + need + ")";
    if (sp <= 30) return "V30 / U3 или быстрее (поток " + need + ")";
    if (sp <= 60) return "V60 или быстрее (поток " + need + ")";
    if (sp <= 90) return "V90 (поток " + need + ")";
    return "CFexpress или SSD — поток " + need + ", выше гарантии V90";
  }
  function cardLabel(c) { return c >= 1000 ? num(c / 1000) + " ТБ" : num(c) + " ГБ"; }
  function gib(c) { return num(Math.round(c * 1e9 / Math.pow(2, 30))); }
  function minCard(mb) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i] * 1000 >= mb) return cardLabel(CARDS[i]);
    }
    return "больше 1 ТБ — понадобится несколько носителей";
  }

  function read() {
    return {
      mode: (cfg.querySelector('input[name="mode"]:checked') || {}).value || "fit",
      bit: clamp(document.getElementById("f-bit").value, 1, 10000, 100),
      card: clamp(document.getElementById("f-card").value, 1, 8000, 128),
      shot: clamp(document.getElementById("f-shot").value, 0.1, 500, 25),
      sec: clamp(document.getElementById("f-h").value, 0, 99, 1) * 3600 +
           clamp(document.getElementById("f-m").value, 0, 59, 0) * 60
    };
  }

  function data() {
    var d = read();
    var sp = d.bit / 8;
    var flow = [
      ["Поток записи", num(d.bit) + " Мбит/с = " + fmtSpeed(sp) + " МБ/с"],
      ["Минута записи", "≈ " + fmtMB(sp * 60)],
      ["Час записи", "≈ " + fmtMB(sp * 3600)]
    ];
    if (d.mode === "fit") {
      return {
        big: "≈ " + fmtDur(d.card * 1000 / sp),
        sub: "видео при " + num(d.bit) + " Мбит/с на карте " + cardLabel(d.card),
        lines: flow.concat([
          ["Класс карты", klass(sp)],
          ["Карта на компьютере", "≈ " + gib(d.card) + " ГиБ — это норма, не брак"]
        ]),
        note: "Считается по маркировке карт (1 ГБ = 1000 МБ). Камера дополнительно резервирует немного места под служебные файлы."
      };
    }
    if (d.mode === "size") {
      var mb = sp * Math.max(60, d.sec);
      return {
        big: "≈ " + fmtMB(mb),
        sub: "запись " + fmtDur(Math.max(60, d.sec)) + " при " + num(d.bit) + " Мбит/с",
        lines: flow.concat([
          ["Минимальная карта", minCard(mb)],
          ["Класс карты", klass(sp)]
        ]),
        note: "Считается по маркировке карт (1 ГБ = 1000 МБ). Держите запас: паузы между дублями карту не занимают, а вот второй дубль — да."
      };
    }
    return {
      big: "≈ " + num(Math.floor(d.card * 1000 / d.shot)) + " кадров",
      sub: "по " + num(d.shot) + " МБ на карте " + cardLabel(d.card),
      lines: [
        ["Вес кадра", "≈ " + num(d.shot) + " МБ — среднее значение"],
        ["Серия 20 кадров", "≈ " + fmtMB(d.shot * 20)],
        ["1 000 кадров", "≈ " + fmtMB(d.shot * 1000)],
        ["Карта на компьютере", "≈ " + gib(d.card) + " ГиБ — это норма, не брак"]
      ],
      note: "Вес кадра — средний ориентир: реальный зависит от сцены, ISO и степени сжатия. Считается по маркировке карт (1 ГБ = 1000 МБ)."
    };
  }

  function render() {
    var d = read();
    document.getElementById("sec-bit").hidden = d.mode === "photo";
    document.getElementById("sec-photo").hidden = d.mode !== "photo";
    document.getElementById("sec-card").hidden = d.mode === "size";
    document.getElementById("sec-dur").hidden = d.mode !== "size";

    ["chips-v:f-bit", "chips-c:f-card", "chips-p:f-shot"].forEach(function (pair) {
      var p = pair.split(":");
      var v = document.getElementById(p[1]).value;
      Array.prototype.forEach.call(document.getElementById(p[0]).children, function (ch) {
        ch.classList.toggle("on", ch.dataset.v === String(v));
      });
    });

    var r = data();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>РАСЧЁТ КАРТЫ ПАМЯТИ</h3>");
    h.push('<p style="text-align:center;font-size:12px;color:#6b675e">видео и фото · pobubnim.github.io</p>');
    h.push('<p class="big">' + r.big + "</p>");
    h.push('<p class="big-sub">' + r.sub + "</p>");
    r.lines.forEach(function (l) {
      h.push('<div class="line"><b>' + l[0] + "</b><span>" + l[1] + "</span></div>");
    });
    h.push('<p class="doc-note">' + r.note + "</p>");
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
  }

  cfg.addEventListener("input", render);
  cfg.addEventListener("change", render);

  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this;
    var r = data();
    var txt = "Расчёт карты памяти — pobubnim.github.io\n" +
      r.big + " — " + r.sub + "\n" +
      r.lines.map(function (l) { return l[0] + ": " + l[1]; }).join("\n") +
      "\n" + r.note;
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  });

  render();
})();
