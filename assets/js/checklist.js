/* ПОБУБНИМ — чек-лист съёмочного дня (instrumenty/chek-list-semki.html).
   Набор по типу съёмки, свои пункты, порядок стрелками, галочки живут в
   браузере до самой съёмки. Прикидка по батареям и картам — по ВАШИМ числам,
   отраслевых нормативов тут нет. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var listEl = document.getElementById("groups");
  if (!form || !paper || !listEl) return;

  var KEY = "pobubnim-checklist-v1";

  /* базовый набор: [группа, пункт] — общий для любой съёмки */
  var BASE = [
    ["Камера", ["Камера", "Запасная камера", "Батареи камеры", "Зарядка для батарей",
      "Карты памяти", "Кардридер", "Ремень или наплечник"]],
    ["Оптика", ["Зум-объектив", "Светосильный фикс", "Широкий объектив", "ND-фильтры",
      "Поляризационный фильтр", "Бленда", "Салфетки и карандаш для оптики"]],
    ["Свет", ["Ключевой свет", "Заполняющий свет", "Софтбокс или диффузия", "Отражатель",
      "Стойки", "Струбцины", "Цветные гели"]],
    ["Звук", ["Петличка", "Микрофон-пушка", "Рекордер", "Наушники", "Ветрозащита",
      "Батарейки AA", "Кабели XLR и мини-джек"]],
    ["Питание и носители", ["Павербанк", "Удлинитель", "Тройник", "Запасные карты",
      "Ноутбук или диск для бэкапа"]],
    ["Стабилизация", ["Штатив", "Монопод", "Гимбал", "Зарядка гимбала", "Слайдер"]],
    ["Мелочи", ["Гаффер-скотч", "Стяжки", "Мультитул", "Фонарь", "Дождевик на камеру",
      "Вода и перекус", "Аптечка"]],
    ["Документы", ["Договор", "Модельные релизы", "Пропуск или разрешение на съёмку",
      "Шот-лист", "Вызывной лист"]]
  ];

  /* добавки под тип съёмки */
  var EXTRA = {
    svadba: [["Звук", "Вторая петличка (на жениха)"], ["Свет", "Свет на банкет"],
      ["Мелочи", "Зонт"], ["Мелочи", "Запасные батарейки для петличек"],
      ["Камера", "Третья батарея на вечер"]],
    interv: [["Свет", "Контровой свет на фон"], ["Мелочи", "Стул без спинки"],
      ["Мелочи", "Вода герою"], ["Звук", "Вторая петличка"], ["Оптика", "Портретный фикс 85 мм"]],
    reklama: [["Свет", "Жёсткий источник с сотами"], ["Мелочи", "Реквизит по раскадровке"],
      ["Мелочи", "Распылитель воды"], ["Стабилизация", "Штатив с центральной колонной"],
      ["Оптика", "Макро-объектив"]],
    klip: [["Звук", "Колонка для плейбека"], ["Свет", "Дым-машина"],
      ["Питание и носители", "Удлинитель 20 м"], ["Стабилизация", "Гимбал и запасные батареи"]],
    meropr: [["Документы", "Аккредитация или пропуск"], ["Оптика", "Длинный зум 70–200"],
      ["Звук", "Кабель от пульта"], ["Мелочи", "Скотч для кабелей на полу"],
      ["Питание и носители", "Дополнительные карты"]],
    vlog: [["Звук", "Микрофон на камеру"], ["Стабилизация", "Компактный гимбал"],
      ["Камера", "Экшн-камера"], ["Мелочи", "Салфетки для линзы"]]
  };

  var groups = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function num(id, def) {
    var v = parseFloat(val(id).replace(",", "."));
    return isNaN(v) ? def : v;
  }
  function kind() {
    var el = form.querySelector('input[name="kind"]:checked');
    return el ? el.value : "svadba";
  }

  function build(kindKey) {
    var g = BASE.map(function (b) {
      return { name: b[0], items: b[1].map(function (t) { return { text: t, done: false }; }) };
    });
    (EXTRA[kindKey] || []).forEach(function (pair) {
      var target = g.filter(function (x) { return x.name === pair[0]; })[0];
      if (!target) {
        target = { name: pair[0], items: [] };
        g.push(target);
      }
      target.items.push({ text: pair[1], done: false });
    });
    return g;
  }

  /* ---------- отрисовка ---------- */
  function draw() {
    listEl.innerHTML = groups.map(function (g, gi) {
      var items = g.items.map(function (it, i) {
        return '<div class="item" data-gi="' + gi + '" data-i="' + i + '">' +
          '<label class="tick"><input type="checkbox"' + (it.done ? " checked" : "") +
          ' aria-label="Отметить: ' + esc(it.text) + '"><span></span></label>' +
          '<input class="txt' + (it.done ? " done" : "") + '" type="text" value="' + esc(it.text) +
          '" aria-label="Пункт списка">' +
          '<span class="rowbtns">' +
            '<button type="button" class="up" aria-label="Выше">↑</button>' +
            '<button type="button" class="down" aria-label="Ниже">↓</button>' +
            '<button type="button" class="del-row" aria-label="Удалить пункт">✕</button>' +
          "</span></div>";
      }).join("");
      return '<div class="group" data-gi="' + gi + '">' +
        '<div class="group-head">' +
          '<input class="g-name" type="text" value="' + esc(g.name) + '" aria-label="Название раздела">' +
          '<span class="rowbtns">' +
            '<button type="button" class="up-g" aria-label="Раздел выше">↑</button>' +
            '<button type="button" class="down-g" aria-label="Раздел ниже">↓</button>' +
            '<button type="button" class="del-g" aria-label="Удалить раздел">✕</button>' +
          "</span></div>" + items +
        '<div class="group-bar"><button type="button" class="mini add-item">+ Пункт</button></div></div>';
    }).join("");
  }

  function read() {
    [].forEach.call(listEl.querySelectorAll(".group"), function (el) {
      var g = groups[+el.dataset.gi];
      g.name = el.querySelector(".g-name").value;
      [].forEach.call(el.querySelectorAll(".item"), function (row) {
        var it = g.items[+row.dataset.i];
        it.text = row.querySelector(".txt").value;
        it.done = row.querySelector('input[type="checkbox"]').checked;
      });
    });
  }

  function redraw() { draw(); render(); save(); }

  listEl.addEventListener("input", function () { read(); render(); save(); });
  listEl.addEventListener("change", function (e) {
    read();
    if (e.target.type === "checkbox") {
      var row = e.target.closest(".item");
      if (row) row.querySelector(".txt").classList.toggle("done", e.target.checked);
    }
    render();
    save();
  });
  listEl.addEventListener("click", function (e) {
    var t = e.target, row = t.closest(".item"), grp = t.closest(".group");
    if (t.closest(".add-item")) {
      read();
      groups[+grp.dataset.gi].items.push({ text: "", done: false });
    } else if (t.closest(".up") || t.closest(".down")) {
      read();
      var g = groups[+row.dataset.gi], i = +row.dataset.i, j = i + (t.closest(".up") ? -1 : 1);
      if (j < 0 || j >= g.items.length) return;
      var tmp = g.items[i]; g.items[i] = g.items[j]; g.items[j] = tmp;
    } else if (t.closest(".del-row")) {
      read();
      var g2 = groups[+row.dataset.gi];
      g2.items.splice(+row.dataset.i, 1);
    } else if (t.closest(".up-g") || t.closest(".down-g")) {
      read();
      var gi = +grp.dataset.gi, gj = gi + (t.closest(".up-g") ? -1 : 1);
      if (gj < 0 || gj >= groups.length) return;
      var tg = groups[gi]; groups[gi] = groups[gj]; groups[gj] = tg;
    } else if (t.closest(".del-g")) {
      read();
      groups.splice(+grp.dataset.gi, 1);
      if (!groups.length) groups.push({ name: "Свой раздел", items: [{ text: "", done: false }] });
    } else {
      return;
    }
    redraw();
  });

  document.getElementById("add-group").addEventListener("click", function () {
    read();
    groups.push({ name: "Свой раздел", items: [{ text: "", done: false }] });
    redraw();
  });
  document.getElementById("btn-uncheck").addEventListener("click", function () {
    read();
    groups.forEach(function (g) { g.items.forEach(function (it) { it.done = false; }); });
    redraw();
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    groups = build(kind());
    redraw();
  });

  /* ---------- счёт и прикидка ---------- */
  function stats() {
    var all = 0, done = 0;
    groups.forEach(function (g) {
      g.items.forEach(function (it) {
        if (!it.text) return;
        all++;
        if (it.done) done++;
      });
    });
    var shift = Math.max(0, num("f-shift", 8));
    var perBat = Math.max(0.1, num("f-bat", 1.5));
    return { all: all, done: done, left: all - done, shift: shift, perBat: perBat,
      batteries: Math.ceil(shift / perBat) };
  }

  function drawMeter() {
    var st = stats();
    var box = document.getElementById("meter");
    box.querySelector(".bar i").style.width = (st.all ? st.done / st.all * 100 : 0) + "%";
    box.classList.toggle("full", st.all > 0 && st.left === 0);
    box.querySelector(".mtext").innerHTML = st.all
      ? "Собрано <b>" + st.done + " из " + st.all + "</b>" +
        (st.left ? " · осталось " + st.left : " · всё на месте")
      : "Список пуст — выберите тип съёмки или добавьте свои пункты";
  }

  /* ---------- лист ---------- */
  function render() {
    var st = stats();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>ЧЕК-ЛИСТ СЪЁМОЧНОГО ДНЯ" + (val("f-proj") ? " · " + esc(val("f-proj")) : "") + "</h3>");
    if (val("f-date") || val("f-loc")) {
      h.push('<table class="doc-meta"><tr><td>' + (val("f-loc") ? esc(val("f-loc")) : "") +
        '</td><td style="text-align:right">' + (val("f-date") ? esc(val("f-date")) : "") + "</td></tr></table>");
    }
    groups.forEach(function (g) {
      var items = g.items.filter(function (it) { return it.text; });
      if (!items.length) return;
      h.push("<h4>" + esc(g.name) + "</h4>");
      h.push('<div class="ticks">' + items.map(function (it) {
        return '<div class="tick-row">' + (it.done ? "☑" : "☐") + " " + esc(it.text) + "</div>";
      }).join("") + "</div>");
    });
    if (st.all) {
      h.push("<p><b>Собрано " + st.done + " из " + st.all + "</b>" +
        (st.left ? ", осталось " + st.left + "." : " — всё на месте.") +
        " Смена " + st.shift + " ч: батарей примерно " + st.batteries +
        " (по " + st.perBat + " ч на одну — ваша цифра). Сколько нужно карт памяти — посчитает калькулятор карты памяти.</p>");
    }
    h.push('<p class="doc-note">Отраслевого норматива «сколько батарей на смену» не существует: расход зависит от камеры, мороза и режима. Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
    drawMeter();
  }

  /* ---------- черновик ---------- */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          kind: kind(), proj: val("f-proj"), date: val("f-date"), loc: val("f-loc"),
          shift: val("f-shift"), bat: val("f-bat"), groups: groups
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
    if (!d || !d.groups || !d.groups.length) return false;
    ["proj", "date", "loc", "shift", "bat"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      if (el && d[k]) el.value = d[k];
    });
    var r = form.querySelector('input[name="kind"][value="' + d.kind + '"]');
    if (r) r.checked = true;
    groups = d.groups;
    document.getElementById("draft-note").hidden = false;
    return true;
  }

  form.addEventListener("change", function (e) {
    if (e.target.name === "kind") groups = build(kind());
    redraw();
  });
  form.addEventListener("input", function () { render(); save(); });

  /* ---------- выгрузка ---------- */
  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this, txt = paper.innerText;
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done);
    else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  });
  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, "chek-list-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  if (!load()) groups = build(kind());
  draw();
  render();

  window.PobubnimChecklist = { stats: stats, state: function () { return groups; } };
})();
