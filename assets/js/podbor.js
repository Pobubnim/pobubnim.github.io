/* ПОБУБНИМ — подбор формата под задачу (страница цен, «видео для бизнеса»).

   Три вопроса: задача, срок, ориентир бюджета → форматы с ценой «от» из единого
   прайса и готовый вход в разговор. Зачем: вместо «сколько стоит видео?» в личку
   приходит задача, срок и бюджет — владелец отвечает по делу с первого сообщения
   (живой случай 17.09: «Хочу на обучение» без направления).

   Данные: assets/data/prices.json, вшит в страницу блоком
   <script type="application/json" id="pb-prices"> сборкой tools/build_prices.py —
   цены живут в одном месте. Контейнер: <div data-podbor>…запасной текст…</div>. */

(function () {
  var box = document.querySelector("[data-podbor]");
  var raw = document.getElementById("pb-prices");
  if (!box || !raw) return;
  var P;
  try { P = JSON.parse(raw.textContent); } catch (_) { return; }
  var ITEM = {};
  P.groups.forEach(function (g) { g.items.forEach(function (it) { ITEM[it.id] = it; }); });

  var TG = "https://t.me/sbphotoshoter";
  /* задача → форматы; первый формат задаёт тему заявки */
  var TASKS = [
    ["prodat", "Продать товар или услугу", ["reklama", "vertikal", "den"]],
    ["kompaniya", "Рассказать о компании", ["imidzh", "reklama"]],
    ["sobytie", "Снять мероприятие", ["event", "foto"]],
    ["svadba", "Свадьба", ["svadba", "foto"]],
    ["klip", "Клип на трек", ["klip"]],
    ["soc", "Контент для соцсетей", ["vertikal", "ai", "den"]],
    ["gotovoe", "Смонтировать или покрасить готовое", ["montazh", "cvet"]],
    ["foto", "Фотосъёмка", ["foto"]],
    ["ai", "ИИ-ролик без съёмки", ["ai"]],
    ["digital", "Сайт, бот или приложение", ["sait", "bot", "app"]],
    ["uchit", "Научиться самому", ["edu-base", "edu-color", "edu-course"]]
  ];
  var WHEN = ["В ближайший месяц", "Через 1–3 месяца", "Дата уже назначена", "Пока присматриваюсь"];
  var BUDGET = [["до 30 тыс. ₽", 30000], ["30–60 тыс. ₽", 60000], ["60–150 тыс. ₽", 150000],
    ["больше 150 тыс. ₽", 0], ["пока не знаю", 0]];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rub(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽"; }
  function group(name, legend, opts) {
    return '<fieldset class="pb-q"><legend>' + legend + '</legend><div class="pb-opts">' +
      opts.map(function (o, i) {
        return '<label class="pb-opt"><input type="radio" name="' + name + '" value="' + i + '"><span>' + esc(o) + '</span></label>';
      }).join("") + '</div></fieldset>';
  }

  box.innerHTML =
    group("pb-task", "1. Какая задача?", TASKS.map(function (t) { return t[1]; })) +
    group("pb-when", "2. Когда нужно?", WHEN) +
    group("pb-budget", "3. Ориентир бюджета", BUDGET.map(function (b) { return b[0]; })) +
    '<div class="pb-res" aria-live="polite"></div>';
  var res = box.querySelector(".pb-res");
  var cur = null, picked = false;

  function val(n) {
    var e = box.querySelector('input[name="' + n + '"]:checked');
    return e ? +e.value : -1;
  }

  function render() {
    var t = val("pb-task");
    if (t < 0) return;
    var w = val("pb-when"), b = val("pb-budget");
    var task = TASKS[t], max = b >= 0 ? BUDGET[b][1] : 0;
    var items = task[2].map(function (id) { return ITEM[id]; }).filter(Boolean);
    cur = {
      task: task[1], items: items,
      when: w >= 0 ? WHEN[w] : "—", budget: b >= 0 ? BUDGET[b][0] : "—"
    };
    var names = items.map(function (it) { return it.name; }).join(", ");
    var cards = items.map(function (it) {
      var price = it.from ? "от " + rub(it.from) + (it.unit ? " · " + it.unit : "") : "цену считаю по задаче";
      var over = max && it.from && it.from > max
        ? '<p class="pb-over">Дороже ориентира: на брифе разберём, что убрать из состава.</p>' : "";
      return '<div class="pb-item"><div class="pb-item-head"><b>' + esc(it.name) + '</b><span>' + price + '</span></div>' +
        '<ul>' + it.includes.slice(0, 3).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul>' + over +
        (it.url ? '<a class="pb-more" href="' + it.url + '">Подробнее →</a>' : "") + '</div>';
    }).join("");
    var text = "Здравствуйте! Подбор формата на сайте pobubnim.ru.\nЗадача: " + task[1] +
      "\nФормат: " + names + "\nСроки: " + cur.when + "\nБюджет: " + cur.budget + "\nПодробнее о задаче: ";
    res.innerHTML =
      '<p class="pb-res-h">Под задачу «' + esc(task[1]) + '» подходит:</p>' +
      '<div class="pb-items">' + cards + '</div>' +
      '<div class="pb-cta"><a class="btn btn-lamp" target="_blank" rel="noopener" href="' + TG + "?text=" +
      encodeURIComponent(text) + '">Отправить подбор в телеграм</a>' +
      '<button type="button" class="btn btn-ghost" data-pb-lead>Оставить заявку</button></div>' +
      '<p class="pb-note">Цены «от» — стартовые. Точная смета — после брифа: она зависит от задачи, сроков и состава работ.</p>';
    if (!picked) {
      picked = true;
      if (window.pbGoal) window.pbGoal("podbor_pick", { task: task[0] });
    }
  }

  box.addEventListener("change", render);
  box.addEventListener("click", function (e) {
    if (!cur || !e.target.closest || !e.target.closest("[data-pb-lead]")) return;
    var desc = "Подбор на сайте. Задача: " + cur.task + ". Формат: " +
      cur.items.map(function (it) { return it.name; }).join(", ") + ". Сроки: " + cur.when + ". Бюджет: " + cur.budget + ".";
    if (window.pbLead) window.pbLead(cur.items[0] ? cur.items[0].lead : null, desc);
  });
})();
