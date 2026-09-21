/* ПОБУБНИМ — разделы хабов: чипы категорий над сеткой карточек.
   Работает на articles/index.html, uroki/index.html и instrumenty/index.html.

   ЗАЧЕМ (слово владельца 21.09.2026): «открывая блок статей и обучения, ты
   должен открыть то, что интересно, а не листать список». Чипы прячут лишние
   разделы и оставляют один.

   Без JS страница показывает ВСЁ — разделы скрываются только отсюда, поэтому
   поисковик и человек без скриптов видят полный список. Выбранная категория
   пишется в адрес (#zvuk), чтобы ссылку можно было дать сразу на неё. */

(function () {
  var nav = document.querySelector(".hub-nav");
  if (!nav) return;

  var chips = [].slice.call(nav.querySelectorAll("[data-cat]"));
  var secs = [].slice.call(document.querySelectorAll("[data-sec]"));
  if (!chips.length || !secs.length) return;

  /* счётчик материалов в каждой категории — видно ещё до нажатия */
  chips.forEach(function (chip) {
    var cat = chip.dataset.cat;
    var n = cat === "all"
      ? document.querySelectorAll("[data-sec] .hub-card, [data-sec] .tool-card").length
      : document.querySelectorAll('[data-sec="' + cat + '"] .hub-card, [data-sec="' + cat + '"] .tool-card').length;
    if (n) {
      var b = document.createElement("b");
      b.textContent = n;
      chip.appendChild(b);
    }
  });

  function show(cat, push) {
    var known = cat === "all" || secs.some(function (s) { return s.dataset.sec === cat; });
    if (!known) cat = "all";
    secs.forEach(function (s) {
      s.hidden = cat !== "all" && s.dataset.sec !== cat;
    });
    chips.forEach(function (c) {
      var on = c.dataset.cat === cat;
      c.classList.toggle("on", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (push) {
      history.replaceState(null, "", cat === "all"
        ? location.pathname + location.search
        : "#" + cat);
    }
  }

  nav.addEventListener("click", function (e) {
    var chip = e.target.closest("[data-cat]");
    if (!chip) return;
    show(chip.dataset.cat, true);
  });

  show((location.hash || "").replace("#", "") || "all", false);
})();
