/* ПОБУБНИМ — бриф на съёмку (instrumenty/brif-na-semku.html).
   Анкета клиенту под тип съёмки: вопросы можно править, переставлять и
   дописывать, ответы пишутся тут же. Готовое уходит в мессенджер, в Word
   или на печать. Обязательные вопросы отмечены — без них не собрать смету.
   Всё локально в браузере. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var listEl = document.getElementById("questions");
  if (!form || !paper || !listEl) return;

  var KEY = "pobubnim-brief-v1";

  /* наборы вопросов: [текст, обязательный] */
  var SETS = {
    reklama: [
      ["Что рекламируем: продукт, услуга или компания целиком?", true],
      ["Какая задача у ролика: продажи, узнаваемость, презентация на выставке?", true],
      ["Кто зритель — кто и где это увидит?", true],
      ["Где будет публиковаться: сайт, соцсети, экраны, ТВ?", true],
      ["Хронометраж: сколько секунд или минут?", true],
      ["Формат кадра: горизонталь, вертикаль или оба?", true],
      ["Два-три референса: ролики, которые нравятся, и чем именно", false],
      ["Что зритель должен запомнить после просмотра?", false],
      ["Что показывать нельзя: закрытые зоны, люди, конкуренты?", false],
      ["Кто в кадре: сотрудники, актёры, только продукт, голос за кадром?", false],
      ["Есть ли брендбук: логотип, шрифты, цвета, готовая графика?", false],
      ["Локация: своя площадка или искать?", false],
      ["Дата съёмки и дедлайн готового ролика", true],
      ["Бюджет: вилка, в которую нужно уложиться", true],
      ["Кто принимает работу и утверждает правки?", true]
    ],
    svadba: [
      ["Дата свадьбы и город", true],
      ["Тайминг дня: сборы, церемония, прогулка, банкет", true],
      ["Адреса локаций и как между ними добираться", true],
      ["Сколько гостей ожидается?", false],
      ["Какой фильм хотите: клип на 2–4 минуты, полный фильм, репортаж?", true],
      ["Нужна ли съёмка с воздуха?", false],
      ["Кто ещё снимает: фотограф, второй видеограф, ведущий со своей камерой?", false],
      ["Люди и моменты, которые нельзя пропустить", false],
      ["Музыка: есть ли пожелания или доверяете подбор?", false],
      ["Нужны ли вертикальные нарезки для соцсетей?", false],
      ["Дедлайн: к какой дате нужен готовый фильм?", true],
      ["Бюджет: вилка, в которую нужно уложиться", true]
    ],
    meropr: [
      ["Что за событие, где и когда проходит?", true],
      ["Программа и тайминг: во сколько что начинается", true],
      ["Что нужно на выходе: отчётный ролик, нарезки, полная запись, стрим?", true],
      ["Сколько камер нужно и есть ли бюджет на вторую?", false],
      ["Кто спикеры, нужны ли синхроны и интервью с гостями?", false],
      ["Можно ли писать звук с пульта или ставить свои микрофоны?", false],
      ["Есть ли аккредитация и кто пускает на площадку?", true],
      ["Нужны ли материалы в тот же день?", false],
      ["Дедлайн готового материала", true],
      ["Бюджет: вилка, в которую нужно уложиться", true]
    ],
    klip: [
      ["Артист и трек: ссылка на демо или готовую запись", true],
      ["Есть ли идея и сюжет или отдаёте режиссёру?", true],
      ["Референсы: два-три клипа и что в них нравится", false],
      ["Локации: свои варианты или искать?", false],
      ["Сколько смен готовы снимать?", true],
      ["Нужны ли актёры, танцоры, реквизит, грим и стилист?", false],
      ["Спецэффекты: дым, свет, вода, огонь, графика на посте", false],
      ["Дата релиза и дедлайн монтажа", true],
      ["Бюджет: вилка, в которую нужно уложиться", true]
    ],
    interv: [
      ["Кто герой и о чём разговор?", true],
      ["Формат: одна камера или две, студия или на месте героя?", true],
      ["Хронометраж готового материала", true],
      ["Нужны ли перебивки: процесс, детали, общие планы?", false],
      ["Титры, графика, субтитры — нужны ли?", false],
      ["Кто задаёт вопросы: вы, ведущий или нужен интервьюер?", false],
      ["Где будет публиковаться: сайт, соцсети, конференция?", true],
      ["Дедлайн", true],
      ["Бюджет: вилка, в которую нужно уложиться", true]
    ],
    predm: [
      ["Что снимаем: товар, размеры, сколько позиций?", true],
      ["Фон: белый, цветной, интерьерный или на модели?", true],
      ["Нужно ли движение: слайдер, облёт, распаковка?", false],
      ["Формат: вертикаль для маркетплейсов, горизонталь для сайта?", true],
      ["Есть ли брендбук и требования площадки к карточкам?", false],
      ["Кто предоставляет реквизит и доставляет товар?", false],
      ["Дедлайн", true],
      ["Бюджет: вилка, в которую нужно уложиться", true]
    ]
  };

  var items = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function kind() {
    var el = form.querySelector('input[name="kind"]:checked');
    return el ? el.value : "reklama";
  }
  function build(k) {
    return (SETS[k] || []).map(function (q) {
      return { q: q[0], must: q[1], a: "" };
    });
  }

  /* ---------- левая панель ---------- */
  function draw() {
    listEl.innerHTML = items.map(function (it, i) {
      return '<div class="qitem' + (it.must ? " must" : "") + '" data-i="' + i + '">' +
        '<div class="qtop">' +
          '<span class="qn">' + (i + 1) + "</span>" +
          '<input class="q" type="text" value="' + esc(it.q) + '" placeholder="Вопрос клиенту" aria-label="Вопрос">' +
          '<span class="rowbtns">' +
            '<button type="button" class="must-btn" aria-label="Пометить обязательным" title="Обязательный вопрос">' +
              (it.must ? "★" : "☆") + "</button>" +
            '<button type="button" class="up" aria-label="Выше">↑</button>' +
            '<button type="button" class="down" aria-label="Ниже">↓</button>' +
            '<button type="button" class="del-row" aria-label="Удалить вопрос">✕</button>' +
          "</span>" +
        "</div>" +
        '<input class="a" type="text" value="' + esc(it.a) + '" placeholder="Ответ клиента (можно оставить пустым)" aria-label="Ответ">' +
        "</div>";
    }).join("");
  }

  function read() {
    [].forEach.call(listEl.querySelectorAll(".qitem"), function (el) {
      var it = items[+el.dataset.i];
      it.q = el.querySelector(".q").value;
      it.a = el.querySelector(".a").value;
    });
  }

  function redraw() { draw(); render(); save(); }

  listEl.addEventListener("input", function () { read(); render(); save(); });
  listEl.addEventListener("click", function (e) {
    var row = e.target.closest(".qitem");
    if (!row) return;
    var i = +row.dataset.i;
    if (e.target.closest(".up") || e.target.closest(".down")) {
      read();
      var j = i + (e.target.closest(".up") ? -1 : 1);
      if (j < 0 || j >= items.length) return;
      var t = items[i]; items[i] = items[j]; items[j] = t;
    } else if (e.target.closest(".del-row")) {
      read();
      items.splice(i, 1);
      if (!items.length) items.push({ q: "", must: false, a: "" });
    } else if (e.target.closest(".must-btn")) {
      read();
      items[i].must = !items[i].must;
    } else {
      return;
    }
    redraw();
  });

  document.getElementById("add-q").addEventListener("click", function () {
    read();
    items.push({ q: "", must: false, a: "" });
    redraw();
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    items = build(kind());
    redraw();
  });

  /* ---------- счёт ---------- */
  function stats() {
    var must = 0, mustDone = 0, all = 0, done = 0;
    items.forEach(function (it) {
      if (!it.q) return;
      all++;
      if (it.a) done++;
      if (it.must) {
        must++;
        if (it.a) mustDone++;
      }
    });
    return { all: all, done: done, must: must, mustDone: mustDone, left: must - mustDone };
  }

  function drawMeter() {
    var st = stats();
    var box = document.getElementById("meter");
    box.querySelector(".bar i").style.width = (st.all ? st.done / st.all * 100 : 0) + "%";
    box.classList.toggle("warn", st.left > 0 && st.done > 0);
    box.querySelector(".mtext").innerHTML = st.all
      ? "Отвечено <b>" + st.done + " из " + st.all + "</b>" +
        (st.left ? " · без ответов на " + st.left + " обязательных смету не собрать"
                 : " · на всё важное ответы есть")
      : "Выберите тип съёмки — соберу вопросы";
  }

  /* ---------- лист ---------- */
  function render() {
    var st = stats();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h2>БРИФ НА СЪЁМКУ" + (val("f-proj") ? " · " + esc(val("f-proj")) : "") + "</h2>");
    if (val("f-client") || val("f-date")) {
      h.push('<table class="doc-meta"><tr><td>' + (val("f-client") ? "Заказчик: " + esc(val("f-client")) : "") +
        '</td><td style="text-align:right">' + (val("f-date") ? esc(val("f-date")) : "") + "</td></tr></table>");
    }
    var asked = items.filter(function (it) { return it.q; });
    if (!asked.length) {
      h.push("<p>Вопросов пока нет — выберите тип съёмки слева.</p>");
    } else {
      h.push('<div class="qa">' + asked.map(function (it, i) {
        return '<div class="qa-row"><b>' + (i + 1) + ". " + esc(it.q) + "</b>" +
          '<div class="qa-ans">' + (it.a ? esc(it.a) : BL) + "</div></div>";
      }).join("") + "</div>");
      h.push("<p>Ответы можно прислать текстом в мессенджер — по номерам вопросов, отдельные пункты можно пропустить. Чем точнее ответы про сроки, формат и бюджет, тем точнее смета и меньше правок потом.</p>");
    }
    if (st.all) {
      h.push("<p><b>Отвечено " + st.done + " из " + st.all + "</b>" +
        (st.left ? ", без ответов " + st.left + " обязательных." : " — на всё важное ответы есть.") + "</p>");
    }
    h.push('<p class="doc-note">Бриф — не договор: он фиксирует задачу и ожидания. Условия и деньги закрепляются договором и сметой. Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
    drawMeter();
  }

  /* текст для мессенджера: просто пронумерованные вопросы */
  function messengerText() {
    var lines = [];
    lines.push("Бриф на съёмку" + (val("f-proj") ? ": " + val("f-proj") : ""));
    lines.push("Ответьте, пожалуйста, по номерам — что-то можно пропустить.");
    lines.push("");
    items.filter(function (it) { return it.q; }).forEach(function (it, i) {
      lines.push((i + 1) + ". " + it.q + (it.must ? " *" : ""));
    });
    lines.push("");
    lines.push("* — без этого не получится посчитать смету и сроки.");
    return lines.join("\n");
  }

  /* ---------- черновик ---------- */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          kind: kind(), proj: val("f-proj"), client: val("f-client"),
          date: val("f-date"), items: items
        }));
      } catch (e) { /* приватный режим */ }
    }, 400);
  }
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (!raw) return false;
    var d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !d.items || !d.items.length) return false;
    ["proj", "client", "date"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      if (el && d[k]) el.value = d[k];
    });
    var r = form.querySelector('input[name="kind"][value="' + d.kind + '"]');
    if (r) r.checked = true;
    items = d.items;
    document.getElementById("draft-note").hidden = false;
    return true;
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "kind") items = build(kind());
    redraw();
  });
  form.addEventListener("input", function () { render(); save(); });

  /* ---------- выгрузка ---------- */
  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done);
    else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  }
  document.getElementById("btn-msg").addEventListener("click", function () {
    copyText(messengerText(), this);
  });
  document.getElementById("btn-copy").addEventListener("click", function () {
    copyText(paper.innerText, this);
  });
  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, "brif-na-semku-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  if (!load()) items = build(kind());
  draw();
  render();

  window.PobubnimBrief = { stats: stats, messengerText: messengerText,
    state: function () { return items; } };
})();
