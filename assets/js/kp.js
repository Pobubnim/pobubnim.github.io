/* ПОБУБНИМ — коммерческое предложение на видеосъёмку
   (instrumenty/kommercheskoe-predlozhenie-na-videosemku.html).
   Варианты работы с галочками состава, этапы, границы, условия и
   сопроводительное письмо. Проверка КП подсвечивает, чего не хватает.
   Всё живёт в браузере: черновик в localStorage, ссылка — через share.js. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;

  var KEY = "pobubnim-kp-v1";
  var mode = "kp";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function money(n) { return (+n).toLocaleString("ru-RU") + " ₽"; }
  function lines(t) {
    return String(t || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- наборы под тип съёмки: только состав, цены ставит исполнитель ---------- */
  var PACKS = ["Базовый", "Оптимальный", "Расширенный"];
  var KINDS = {
    reklama: {
      title: "Рекламный ролик", gen: "рекламному ролику",
      task: "Запускаем новую линейку и хотим ролик для рекламы во ВКонтакте: показать продукт в деле за 15–30 секунд и привести на сайт",
      where: "ВКонтакте, Яндекс Директ, сайт", dur: "30 секунд + версии по 15",
      items: [["Сценарий и раскадровка", 1, 1, 1], ["Съёмочная смена до 8 часов", 1, 1, 1],
        ["Свет и запись звука на площадке", 1, 1, 1], ["Монтаж, цветокоррекция, сведение звука", 1, 1, 1],
        ["Основная версия ролика", 1, 1, 1], ["Короткие версии для рекламы в соцсетях", 0, 1, 1],
        ["Вертикальные версии 9:16", 0, 1, 1], ["Музыка по лицензии", 0, 1, 1],
        ["Вторая съёмочная смена", 0, 0, 1], ["Кастинг и актёры", 0, 0, 1]],
      stages: ["Бриф и созвон: задача, площадки показа, хронометраж", "Сценарий и раскадровка на согласование",
        "Подготовка: локации, люди, реквизит, техника", "Съёмочный день", "Черновой монтаж и правки",
        "Цвет, звук и выдача финальных версий"],
      out: ["Аренда платной локации и пропуска", "Актёры и модели сверх оговорённых",
        "Размещение и продвижение ролика", "Правки сверх оговорённых раундов и переделка утверждённого сценария"]
    },
    film: {
      title: "Фильм о компании", gen: "фильму о компании",
      task: "Нужен фильм о компании для сайта и переговоров с партнёрами: кто мы, как устроено производство, почему нам доверяют",
      where: "сайт, презентации для партнёров, выставки", dur: "2–3 минуты",
      items: [["Сценарный план и вопросы для интервью", 1, 1, 1], ["Съёмочная смена до 8 часов", 1, 1, 1],
        ["Интервью с руководителем на две камеры", 1, 1, 1], ["Съёмка производства, офиса, команды", 1, 1, 1],
        ["Монтаж, цветокоррекция, сведение звука", 1, 1, 1], ["Фильм о компании", 1, 1, 1],
        ["Короткая версия для соцсетей", 0, 1, 1], ["Субтитры", 0, 1, 1],
        ["Вторая съёмочная смена", 0, 0, 1], ["Съёмка с квадрокоптера там, где это разрешено", 0, 0, 1]],
      stages: ["Созвон: для кого фильм и что зритель должен запомнить", "Сценарный план, список героев и локаций",
        "Пропуска и график съёмки", "Съёмочные дни", "Черновой монтаж и правки", "Цвет, звук и финальные версии"],
      out: ["Пропуска и согласования на режимные объекты", "Озвучка профессиональным диктором",
        "Перевод и субтитры на другие языки", "Правки сверх оговорённых раундов"]
    },
    meropr: {
      title: "Съёмка мероприятия", gen: "съёмке мероприятия",
      task: "Конференция на 300 человек: нужен ролик для отчёта и соцсетей и записи докладов для участников",
      where: "соцсети, сайт, рассылка участникам", dur: "ролик 2–3 минуты + записи докладов",
      items: [["Съёмка события по таймингу", 1, 1, 1], ["Запись звука со сцены", 1, 1, 1],
        ["Итоговый ролик о событии", 1, 1, 1], ["Второй оператор", 0, 1, 1],
        ["Вертикальные фрагменты для соцсетей", 0, 1, 1], ["Тизер на следующий день", 0, 1, 1],
        ["Полные записи выступлений", 0, 0, 1], ["Интервью с гостями и спикерами", 0, 0, 1]],
      stages: ["Тайминг и площадка: где сцена, свет и точка звука", "Проверка техники и звука до начала",
        "Съёмка события", "Тизер", "Итоговый ролик и записи выступлений", "Правки"],
      out: ["Трансляция в интернет", "Часы сверх оговорённого тайминга", "Дорога за пределы города",
        "Правки сверх оговорённых раундов"]
    },
    svadba: {
      title: "Свадебная съёмка", gen: "съёмке свадьбы",
      task: "Свадьба 14 июня, выездная регистрация и банкет в загородном клубе. Хотим фильм, который приятно пересматривать, и полную запись клятв",
      where: "показ гостям, соцсети", dur: "фильм 3–5 минут",
      items: [["Съёмка дня по таймингу", 1, 1, 1], ["Свадебный фильм", 1, 1, 1], ["Церемония целиком", 1, 1, 1],
        ["Запись клятв на петличку", 1, 1, 1], ["Съёмка сборов", 0, 1, 1], ["Тосты полными записями", 0, 1, 1],
        ["Тизер", 0, 1, 1], ["Вертикальные фрагменты", 0, 1, 1], ["Вторая камера", 0, 0, 1]],
      stages: ["Знакомство: дата, площадки, фотограф", "Тайминг и звонок ведущему за неделю", "Съёмочный день",
        "Тизер", "Фильм и полные записи", "Правки"],
      out: ["Второй съёмочный день", "Дорога и ночёвка за пределами зоны выезда", "Съёмка с квадрокоптера",
        "Часы сверх оговорённых"]
    },
    klip: {
      title: "Музыкальный клип", gen: "клипу",
      task: "Сингл выходит 20 октября, нужен клип для VK Видео и YouTube и вертикальный тизер под анонс",
      where: "VK Видео, YouTube, VK Клипы", dur: "по треку, 3:10",
      items: [["Идея и раскадровка", 1, 1, 1], ["Съёмочная смена до 8 часов", 1, 1, 1], ["Свет на площадке", 1, 1, 1],
        ["Монтаж под трек", 1, 1, 1], ["Цветокоррекция", 1, 1, 1], ["Вертикальный тизер под релиз", 0, 1, 1],
        ["Отдельная сцена с артистом в павильоне", 0, 0, 1], ["Вторая съёмочная смена", 0, 0, 1]],
      stages: ["Трек и референсы", "Идея, раскадровка, план смены", "Локации, люди, реквизит", "Съёмка",
        "Монтаж под трек и правки", "Цвет и выдача"],
      out: ["Аренда павильона или платной локации", "Реквизит, костюмы, грим", "Актёры и танцоры",
        "Правки сверх оговорённых раундов"]
    },
    kontent: {
      title: "Интервью и контент", gen: "съёмке интервью и контента",
      task: "Эксперт компании ведёт блог: нужна серия коротких роликов на месяц с одного съёмочного дня",
      where: "Telegram, VK Клипы, YouTube Shorts", dur: "10 роликов по 40–60 секунд",
      items: [["Съёмка интервью на две камеры", 1, 1, 1], ["Петличные микрофоны", 1, 1, 1], ["Свет на лицо", 1, 1, 1],
        ["Монтаж роликов", 1, 1, 1], ["Цветокоррекция", 1, 1, 1], ["Субтитры", 0, 1, 1],
        ["Нарезка вертикальных фрагментов", 0, 1, 1], ["Съёмка перебивок", 0, 1, 1], ["Вторая съёмочная смена", 0, 0, 1]],
      stages: ["Темы, герой, вопросы", "Локация и свет", "Съёмка", "Монтаж и правки", "Выдача роликов и нарезки"],
      out: ["Аренда студии", "Визажист", "Правки сверх оговорённых раундов", "Публикация и ведение соцсетей"]
    }
  };

  /* ---------- состояние ---------- */
  var FIELDS = ["client", "person", "task", "where", "dur", "deadline", "stages", "out",
    "pre", "rounds", "valid", "nds", "exec", "contact", "links", "num", "date", "why"];
  var st;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function fresh(kind, keep) {
    var k = KINDS[kind] || KINDS.reklama;
    var s = {
      kind: kind, who: "selfemp", n: 3, rec: 1, offer: true,
      packs: PACKS.map(function (nm) { return { name: nm, price: "", days: "" }; }),
      items: k.items.map(function (r) { return { name: r[0], on: [!!r[1], !!r[2], !!r[3]] }; }),
      stages: k.stages.join("\n"), out: k.out.join("\n"),
      pre: "50", rounds: "2", valid: "14", nds: "", date: today()
    };
    FIELDS.forEach(function (f) { if (!(f in s)) s[f] = ""; });
    /* при смене типа то, что человек написал о себе и о клиенте, не теряется */
    if (keep) ["who", "client", "person", "exec", "contact", "links", "num", "date", "pre", "rounds", "valid", "nds", "offer"]
      .forEach(function (f) { s[f] = keep[f]; });
    return s;
  }

  /* ---------- форма ---------- */
  var packsEl = document.getElementById("packs");
  var matrixEl = document.getElementById("matrix");

  function syncForm() {
    FIELDS.forEach(function (f) {
      var el = document.getElementById("f-" + f);
      if (el && el.value !== String(st[f])) el.value = st[f];
    });
    ["kind", "who", "n"].forEach(function (name) {
      var r = form.querySelector('input[name="' + name + '"][value="' + st[name] + '"]');
      if (r) r.checked = true;
    });
    document.getElementById("f-offer").checked = !!st.offer;
    var k = KINDS[st.kind];
    document.getElementById("f-task").placeholder = "Например: " + k.task;
    document.getElementById("f-where").placeholder = k.where;
    document.getElementById("f-dur").placeholder = k.dur;
  }

  function drawPacks() {
    var h = [];
    for (var i = 0; i < st.n; i++) {
      var p = st.packs[i];
      h.push('<div class="pack" data-i="' + i + '">' +
        '<input class="pname" type="text" value="' + esc(p.name) + '" aria-label="Название варианта ' + (i + 1) + '" placeholder="Вариант ' + (i + 1) + '">' +
        '<input class="pprice" type="number" min="0" step="1000" value="' + esc(p.price) + '" placeholder="Цена, ₽" aria-label="Цена варианта ' + (i + 1) + '">' +
        '<input class="pdays" type="number" min="0" step="1" value="' + esc(p.days) + '" placeholder="Дней" aria-label="Срок изготовления варианта ' + (i + 1) + ', рабочих дней">' +
        (st.n > 1 ? '<label class="prec"><input type="radio" name="rec" value="' + i + '"' + (st.rec === i ? " checked" : "") + '>советую</label>' : "") +
        "</div>");
    }
    packsEl.innerHTML = h.join("");
  }

  function drawMatrix() {
    /* число колонок уходит в CSS-переменную: на телефоне строка складывается
       в две линии (название сверху, галочки под ним) — см. стиль страницы */
    matrixEl.style.setProperty("--n", st.n);
    var h = ['<div class="mhead"><span>Что входит</span>'];
    for (var i = 0; i < st.n; i++) {
      var nm = st.packs[i].name || "Вариант " + (i + 1);
      /* на ПК колонка 44 px — короткая подпись; на телефоне колонка широкая — полная */
      h.push('<span title="' + esc(nm) + '"><i class="s">' + esc(nm.slice(0, 5)) + '</i><i class="f">' + esc(nm) + "</i></span>");
    }
    h.push("<span></span></div>");
    st.items.forEach(function (it, r) {
      h.push('<div class="mrow" data-r="' + r + '">' +
        '<input class="iname" type="text" value="' + esc(it.name) + '" placeholder="Что входит" aria-label="Позиция ' + (r + 1) + '">');
      for (var j = 0; j < st.n; j++) {
        h.push('<label class="mcell"><input type="checkbox" data-j="' + j + '"' + (it.on[j] ? " checked" : "") +
          ' aria-label="«' + esc(it.name || "позиция") + '» в варианте ' + esc(st.packs[j].name || j + 1) + '"></label>');
      }
      h.push('<button type="button" class="del" aria-label="Удалить позицию">✕</button></div>');
    });
    matrixEl.innerHTML = h.join("");
  }

  function redraw() { syncForm(); drawPacks(); drawMatrix(); render(); }

  form.addEventListener("input", function (e) {
    var t = e.target;
    var pk = t.closest(".pack"), mr = t.closest(".mrow");
    if (pk) {
      var p = st.packs[+pk.dataset.i];
      if (t.classList.contains("pname")) { p.name = t.value; drawMatrix(); }
      if (t.classList.contains("pprice")) p.price = t.value;
      if (t.classList.contains("pdays")) p.days = t.value;
    } else if (mr) {
      if (t.classList.contains("iname")) st.items[+mr.dataset.r].name = t.value;
    } else if (t.id && t.id.indexOf("f-") === 0 && FIELDS.indexOf(t.id.slice(2)) >= 0) {
      st[t.id.slice(2)] = t.value;
    }
    render(); save();
  });
  form.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "kind") { st = fresh(t.value, st); redraw(); save(); return; }
    if (t.name === "who") {
      st.who = t.value;
      if (!st.nds) st.nds = "";
    }
    if (t.name === "n") { st.n = +t.value; if (st.rec >= st.n) st.rec = st.n - 1; drawPacks(); drawMatrix(); }
    if (t.name === "rec") st.rec = +t.value;
    if (t.id === "f-offer") st.offer = t.checked;
    if (t.id === "f-nds") st.nds = t.value;
    if (t.type === "checkbox" && t.dataset.j != null) {
      st.items[+t.closest(".mrow").dataset.r].on[+t.dataset.j] = t.checked;
    }
    render(); save();
  });
  matrixEl.addEventListener("click", function (e) {
    var b = e.target.closest(".del");
    if (!b) return;
    st.items.splice(+b.closest(".mrow").dataset.r, 1);
    drawMatrix(); render(); save();
  });
  document.getElementById("add-item").addEventListener("click", function () {
    st.items.push({ name: "", on: [false, true, true] });
    drawMatrix(); render(); save();
    var last = matrixEl.querySelector(".mrow:last-child .iname");
    if (last) last.focus();
  });

  /* ---------- расчёты ---------- */
  function active() { return st.packs.slice(0, st.n); }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : "";
  }
  function validUntil() {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(st.date || ""), days = parseInt(st.valid, 10);
    if (!m || !(days > 0)) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3] + days);
    return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  }
  function setOf(j) {
    return st.items.filter(function (it) { return it.name.trim() && it.on[j]; })
      .map(function (it) { return it.name.trim(); });
  }
  function prices() {
    return active().map(function (p) { return +p.price || 0; });
  }
  function ndsText() {
    var v = st.nds || (st.who === "selfemp" ? "free" : "");
    if (v === "free") return st.who === "selfemp"
      ? "НДС не облагается: исполнитель применяет налог на профессиональный доход."
      : "НДС не облагается.";
    if (v === "incl") return "Цены указаны с учётом НДС.";
    return "";
  }
  function whoText() {
    return { selfemp: "самозанятый", ip: "индивидуальный предприниматель", ooo: "" }[st.who] || "";
  }

  /* ---------- проверка КП ---------- */
  function checks() {
    var out = [], ps = prices(), n = st.n;
    function add(ok, text) { out.push({ ok: !!ok, text: text }); }
    add(st.client.trim(), "Кому адресовано предложение: имя заказчика делает КП личным, а не рассылкой.");
    add(st.task.trim().length >= 40, "Задача клиента своими словами: без неё КП читается как прайс, и сравнивают только цену.");
    add(st.where.trim() && st.dur.trim(), "Хронометраж и где будет показ: без них непонятно, за что эта цена.");
    var noPrice = active().filter(function (p, j) { return !ps[j]; }).map(function (p, j) { return p.name || "вариант " + (j + 1); });
    add(!noPrice.length, noPrice.length ? "У варианта «" + noPrice[0] + "» нет цены." : "У каждого варианта есть цена.");
    var clash = "";
    for (var a = 0; a < n && !clash; a++) {
      for (var b = a + 1; b < n && !clash; b++) {
        var sa = setOf(a), sb = setOf(b), na = st.packs[a].name, nb = st.packs[b].name;
        if (sa.join("|") === sb.join("|")) clash = "«" + na + "» и «" + nb + "» отличаются ценой, но не составом: клиент увидит наценку, а не выбор.";
        else if (ps[a] && ps[b] && ((ps[a] > ps[b] && sa.length < sb.length) || (ps[b] > ps[a] && sb.length < sa.length))) {
          var hi = ps[a] > ps[b] ? na : nb, lo = ps[a] > ps[b] ? nb : na;
          clash = "«" + hi + "» дороже «" + lo + "», а входит в него меньше — проверьте галочки.";
        }
      }
    }
    if (n > 1) add(!clash, clash || "Варианты отличаются составом, а не только ценой.");
    add(lines(st.out).length, "Что не входит в стоимость: молчание о границах читается как «всё включено».");
    add(String(st.rounds).trim() !== "", "Число раундов правок: без него правки не кончаются.");
    add(parseInt(st.valid, 10) > 0, "Срок действия: цены на съёмку меняются, а КП остаётся у клиента.");
    add(lines(st.links).length, "Хотя бы одна похожая работа: ссылка убеждает сильнее абзаца о себе.");
    add(st.contact.trim(), "Контакт для ответа: телефон, почта или телеграм.");
    return out;
  }

  function drawDoctor() {
    var c = checks(), ok = c.filter(function (x) { return x.ok; }).length;
    var el = document.getElementById("doctor");
    el.classList.toggle("warn", ok < c.length);
    el.querySelector(".bar i").style.width = Math.round(100 * ok / c.length) + "%";
    el.querySelector(".mtext").innerHTML = "<b>Готово " + ok + " из " + c.length + ".</b> " +
      (ok === c.length ? "КП отвечает на вопросы, которые клиент задал бы сам." : "Чего не хватает:");
    el.querySelector("ul").innerHTML = c.filter(function (x) { return !x.ok; })
      .map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("");
    /* короткий счёт над листом: проверка живёт внизу формы, до неё надо доскроллить */
    var chip = document.getElementById("kp-score");
    chip.textContent = "Проверка: " + ok + " из " + c.length;
    chip.classList.toggle("warn", ok < c.length);
  }

  /* ---------- документ ---------- */
  function table() {
    var ps = prices(), n = st.n, recOn = n > 1;
    var named = st.items.filter(function (it) { return it.name.trim(); });
    var w = n === 1 ? "70,30" : n === 2 ? "52,24,24" : "46,18,18,18";
    var h = ['<table class="items" data-cols="' + w + '"><tr><th>Что входит</th>'];
    active().forEach(function (p, j) {
      h.push("<th>" + bl(p.name) + (recOn && st.rec === j ? " ★" : "") + "</th>");
    });
    h.push("</tr>");
    named.forEach(function (it) {
      h.push("<tr><td>" + esc(it.name) + "</td>");
      for (var j = 0; j < n; j++) h.push("<td>" + (it.on[j] ? "✓" : "—") + "</td>");
      h.push("</tr>");
    });
    if (active().some(function (p) { return +p.days > 0; })) {
      h.push("<tr><td>Срок изготовления</td>");
      active().forEach(function (p) {
        var d = +p.days;
        h.push("<td>" + (d > 0 ? d + " раб. " + plural(d, "день", "дня", "дней") : "—") + "</td>");
      });
      h.push("</tr>");
    }
    h.push("<tr><th>Стоимость</th>");
    ps.forEach(function (v) { h.push("<th>" + (v ? money(v) : BL + " ₽") + "</th>"); });
    h.push("</tr></table>");
    return h.join("");
  }

  function renderKP() {
    var k = KINDS[st.kind], n = st.n, ps = prices();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h2>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ" + (st.num ? " № " + esc(st.num) : "") + "</h2>");
    h.push('<p style="text-align:center">' + esc(k.title) + " для " + bl(st.client) + "</p>");
    var vu = validUntil();
    h.push('<table class="doc-meta"><tr><td>Дата: ' + (fmtDate(st.date) || BL) + '</td><td style="text-align:right">' +
      (vu ? "Действует до " + vu : "Срок действия: " + BL) + "</td></tr></table>");
    var who = whoText();
    h.push("<p>Кому: " + bl(st.client) + (st.person ? ", " + esc(st.person) : "") + ".<br>От кого: " + bl(st.exec) +
      (who ? ", " + who : "") + (st.contact ? ". Связь: " + esc(st.contact) : "") + ".</p>");

    h.push("<h3>Задача</h3><p>" + (st.task.trim() ? esc(st.task.trim()) : BL) + "</p>");
    var bits = [];
    if (st.dur.trim()) bits.push("хронометраж — " + esc(st.dur.trim()));
    if (st.where.trim()) bits.push("где будет показ — " + esc(st.where.trim()));
    if (st.deadline.trim()) bits.push("готовность — " + esc(st.deadline.trim()));
    h.push("<p>" + esc(k.title) + (bits.length ? ": " + bits.join("; ") : "") + ".</p>");

    h.push("<h3>" + (n > 1 ? "Варианты и стоимость" : "Состав и стоимость") + "</h3>");
    h.push(table());
    if (n > 1) {
      var rp = st.packs[st.rec];
      h.push("<p>★ Советую вариант «" + bl(rp.name) + "»" + (st.why.trim() ? ": " + esc(st.why.trim()) : "") + ".</p>");
    }

    var stg = lines(st.stages);
    if (stg.length) h.push("<h3>Как проходит работа</h3><p>" +
      stg.map(function (s, i) { return (i + 1) + ". " + esc(s); }).join("<br>") + "</p>");
    var out = lines(st.out);
    if (out.length) h.push("<h3>Не входит в стоимость</h3><p>" +
      out.map(function (s) { return "— " + esc(s); }).join("<br>") + "</p>");

    h.push("<h3>Условия</h3>");
    var pre = Math.min(100, Math.max(0, parseInt(st.pre, 10) || 0));
    var cond = [];
    if (pre > 0 && pre < 100) {
      var base = n > 1 ? ps[st.rec] : ps[0];
      cond.push("Предоплата " + pre + "% при подтверждении" +
        (base ? (n > 1 ? " (для варианта «" + esc(st.packs[st.rec].name) + "» — " : " (") + money(Math.round(base * pre / 100)) + ")" : "") +
        ", остаток — после сдачи работы.");
    } else if (pre === 100) cond.push("Оплата 100% при подтверждении.");
    else cond.push("Оплата после сдачи работы.");
    var r = parseInt(st.rounds, 10);
    if (String(st.rounds).trim() !== "" && r >= 0) cond.push(r === 0
      ? "Правки после сдачи оплачиваются отдельно."
      : "В стоимость входит " + r + " " + plural(r, "раунд", "раунда", "раундов") +
        " правок в пределах согласованного сценария; следующие считаются отдельно.");
    var nt = ndsText();
    if (nt) cond.push(nt);
    h.push("<p>" + cond.join(" ") + "</p>");
    h.push("<p>" + (vu ? "Предложение действует до " + vu + "." : "Срок действия предложения: " + BL + ".") +
      (st.offer ? " Предложение не является офертой (ст. 435 ГК РФ): условия сделки закрепляются договором." : "") + "</p>");

    var ln = lines(st.links);
    if (ln.length) h.push("<h3>Похожие работы</h3><p>" + ln.map(function (s) { return "— " + esc(s); }).join("<br>") + "</p>");

    h.push("<h3>Следующий шаг</h3><p>Чтобы закрепить дату, ответьте на это письмо или напишите" +
      (st.contact ? ": " + esc(st.contact) : " " + BL) +
      ". После подтверждения пришлю договор и счёт на предоплату.</p>");
    h.push('<table class="req"><tr><td><b>Исполнитель</b>' + bl(st.exec) + '<div class="sig">Подпись: ' + BL +
      "</div></td><td></td></tr></table>");
    h.push('<p class="doc-note">Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    return h.join("");
  }

  function letterText() {
    var k = KINDS[st.kind], ps = prices().filter(Boolean), n = st.n;
    var L = [];
    L.push("Здравствуйте" + (st.person.trim() ? ", " + st.person.trim() : "") + "!");
    L.push("");
    var head = "Собрал предложение по " + k.gen + (st.client.trim() ? " для " + st.client.trim() : "");
    if (n > 1 && ps.length) {
      var mn = Math.min.apply(null, ps), mx = Math.max.apply(null, ps);
      head += ": " + n + " " + plural(n, "вариант", "варианта", "вариантов") +
        (mn === mx ? " по " + money(mn) : " от " + money(mn) + " до " + money(mx)) + ".";
    } else if (ps.length) head += ": " + money(ps[0]) + ".";
    else head += ".";
    L.push(head);
    if (n > 1) {
      var rp = st.packs[st.rec];
      L.push("Советую «" + (rp.name || "вариант " + (st.rec + 1)) + "»" + (st.why.trim() ? ": " + st.why.trim() : "") + ".");
    }
    L.push("В файле — состав каждого варианта, этапы работы и что не входит в стоимость.");
    var vu = validUntil();
    L.push((vu ? "Предложение действует до " + vu + ". " : "") + "Если удобно, созвонимся на 15 минут и уточним детали.");
    L.push("");
    L.push(st.exec.trim() || "Имя");
    if (st.contact.trim()) L.push(st.contact.trim());
    return L.join("\n");
  }

  function renderLetter() {
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    letterText().split("\n\n").forEach(function (block) {
      h.push("<p>" + block.split("\n").map(esc).join("<br>") + "</p>");
    });
    h.push('<p class="doc-note">Письмо к КП. Вставьте в почту или мессенджер и приложите файл.</p>');
    return h.join("");
  }

  function render() {
    paper.innerHTML = mode === "kp" ? renderKP() : renderLetter();
    drawDoctor();
  }

  /* ---------- вкладки и выгрузка ---------- */
  var tabK = document.getElementById("tab-kp"), tabL = document.getElementById("tab-letter");
  function setMode(m) {
    mode = m;
    tabK.classList.toggle("on", m === "kp"); tabL.classList.toggle("on", m === "letter");
    tabK.setAttribute("aria-selected", m === "kp"); tabL.setAttribute("aria-selected", m === "letter");
    render();
  }
  tabK.addEventListener("click", function () { setMode("kp"); });
  tabL.addEventListener("click", function () { setMode("letter"); });

  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  }
  document.getElementById("btn-copy").addEventListener("click", function () {
    copyText(mode === "kp" ? paper.innerText : letterText(), this);
  });
  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, (mode === "kp" ? "kp" : "pismo-k-kp") + "-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  /* ---------- черновик ---------- */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* приватный режим */ }
    }, 400);
  }
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (!raw) return false;
    var d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !KINDS[d.kind] || !d.items || !d.packs || d.packs.length !== 3) return false;
    st = fresh(d.kind);
    Object.keys(st).forEach(function (f) { if (d[f] != null) st[f] = d[f]; });
    st.n = Math.min(3, Math.max(1, +st.n || 3));
    st.rec = Math.min(st.n - 1, Math.max(0, +st.rec || 0));
    document.getElementById("draft-note").hidden = false;
    return true;
  }
  document.getElementById("btn-reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* нечего чистить */ }
    st = fresh(st.kind, st);
    document.getElementById("draft-note").hidden = true;
    redraw();
  });

  if (!load()) st = fresh("reklama");
  redraw();

  window.PobubnimKP = {
    state: function () { return st; },
    checks: checks,
    letterText: letterText,
    validUntil: validUntil
  };
})();
