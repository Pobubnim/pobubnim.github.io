/* ПОБУБНИМ — поведение сцен главной (ДС v2 «Режиссёрский сценарий», 24.09.2026).
   Главная — фильм из семи сцен [data-scene]. Таймлайн под шапкой и док
   телефона ведёт assets/js/nav.js — они теперь на всех страницах. Этот файл:
   — развилка «какое видео нужно»: выбор ставит работы жанра первыми (data-g
     карточек пишет tools/build_films.py), меняет реплику и тему заявки;
   — бриф в три касания собирает текст: в телеграм уходит ссылкой ?text=,
     в форму lead.js — темой и описанием;
   Без JS страница цела: сцены идут подряд, кнопки открывают форму или чат. */

(function () {
  var scenes = [].slice.call(document.querySelectorAll("[data-scene]"));
  if (!scenes.length) return;
  var TG = "https://t.me/sbphotoshoter";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var goal = function (n, p) { if (window.pbGoal) window.pbGoal(n, p); };

  /* ---------- бриф в три касания ---------- */
  var state = { what: "", when: "", budget: "" };
  var msg = document.querySelector("[data-msg]");
  var tg = document.querySelector("[data-brief-tg]");
  var send = document.querySelector("[data-brief-send]");

  function text() {
    return "Здравствуйте! Пишу с сайта pobubnim.ru.\n" +
      "Задача: " + (state.what || "…") + "\n" +
      "Сроки: " + (state.when || "…") + "\n" +
      "Бюджет: " + (state.budget || "…");
  }
  function render() {
    if (msg) msg.textContent = text();
    /* ссылка с ?text= — lead.js её не переписывает (там свой текст по странице) */
    if (tg) tg.href = TG + "?text=" + encodeURIComponent(text());
    /* тема формы: lead.js берёт её из data-lead в момент нажатия */
    if (send) send.setAttribute("data-lead", state.what);
  }
  function press(group, value) {
    [].forEach.call(document.querySelectorAll('[data-group="' + group + '"] .chip'), function (c) {
      c.setAttribute("aria-pressed", String(c.textContent === value));
    });
    state[group] = value;
    render();
  }
  [].forEach.call(document.querySelectorAll("[data-group]"), function (g) {
    g.addEventListener("click", function (e) {
      var c = e.target.closest(".chip");
      if (c) press(g.dataset.group, c.textContent);
    });
  });
  /* описание дописывается после того, как lead.js открыл окно (его слушатель — на document) */
  if (send) send.addEventListener("click", function () {
    goal("brief_send", { what: state.what, when: state.when, budget: state.budget });
    setTimeout(function () {
      var d = document.getElementById("lf-desc");
      if (!d || d.value) return;
      var parts = [];
      if (state.when) parts.push("Сроки: " + state.when);
      if (state.budget) parts.push("Бюджет: " + state.budget);
      d.value = parts.join("\n");
    }, 0);
  });
  render();

  /* ---------- развилка «какое видео нужно» ---------- */
  var sayWorks = document.querySelector("[data-say-works]");
  var films = document.querySelector(".scene-films .films");
  var order = films ? [].slice.call(films.querySelectorAll(".film[data-src]")) : [];

  function reorder(g) {
    if (!films) return 0;
    var hit = g ? order.filter(function (f) { return (" " + (f.dataset.g || "") + " ").indexOf(" " + g + " ") > -1; }) : [];
    var rest = order.filter(function (f) { return hit.indexOf(f) < 0; });
    var more = films.querySelector(".film-more");
    hit.concat(rest).forEach(function (f) {
      if (hit.indexOf(f) > -1) f.setAttribute("data-match", ""); else f.removeAttribute("data-match");
      films.insertBefore(f, more);
    });
    return hit.length;
  }

  [].forEach.call(document.querySelectorAll("[data-pick]"), function (card) {
    var btn = card.querySelector(".pick-hit");
    if (!btn) return;
    btn.addEventListener("click", function () {
      [].forEach.call(document.querySelectorAll("[data-pick]"), function (o) {
        o.classList.toggle("on", o === card);
        var b = o.querySelector(".pick-hit");
        if (b) b.setAttribute("aria-pressed", String(o === card));
      });
      var topic = card.dataset.pick, n = reorder(card.dataset.g);
      press("what", topic);
      goal("home_pick", { topic: topic });
      if (sayWorks) {
        sayWorks.innerHTML = "<b>Савелий</b>" + (n
          ? "Вы выбрали «" + topic + "» — работы этого жанра стоят первыми. Тему я уже подставил в заявку внизу."
          : "«" + topic + "» — это про код, а не про кадр: кейсы в карточке выше. Тему я уже подставил в заявку внизу.");
      }
      var to = document.getElementById(n ? "films" : "hod");
      if (to) to.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  });
})();
