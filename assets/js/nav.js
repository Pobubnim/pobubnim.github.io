/* ПОБУБНИМ — навигация на всех страницах (ДС v2 «Режиссёрский сценарий», 24.09.2026):
   — бургер-меню телефона: те же четыре раздела, что в шапке;
   — таймлайн сцен под шапкой: «Сцена 03 из 07 · … → Дальше: …». На главной сцены
     размечены [data-scene], на остальных страницах сцена — это первый экран и
     каждый h2 основного текста (номер совпадает с меткой «—— 03» над заголовком);
   — док телефона: заявка, звонок и телеграм под большим пальцем.
   Строку разделов и подвал строит tools/build_nav.py — статикой, чтобы их видел
   поисковый робот. Без JS страница цела: меню в подвале, кнопки открывают форму. */

(function () {
  var navIn = document.querySelector(".nav-in");
  if (!navIn) return;
  var path = location.pathname || "/";
  var TEL = "tel:+79829054454", TG = "https://t.me/sbphotoshoter";
  var SVC = [
    ["/ceny.html", "Цены на все услуги"],
    ["/video-dlya-biznesa.html", "Видео для бизнеса"],
    ["/services/reklamnyj-rolik.html", "Рекламный ролик"],
    ["/services/imidzhevyj-film.html", "Имиджевый фильм"],
    ["/services/svadebnoe-kino.html", "Свадебное кино"],
    ["/services/muzykalnyj-klip.html", "Музыкальный клип"],
    ["/services/cvetokorrekciya.html", "Цветокоррекция"],
    ["/services/semka-meropriyatij.html", "Съёмка мероприятий"],
    ["/services/sozdanie-sajtov.html", "Создание сайтов"],
    ["/services/boty-avtomatizaciya.html", "Боты и автоматизация"]
  ];
  var KNOW = [
    ["/articles/", "Статьи и разборы цен"],
    ["/uroki/", "Уроки DaVinci Resolve"],
    ["/instrumenty/", "Инструменты"],
    ["/zakazy-sami.html", "Заказы сами", "hot"]
  ];
  var ICON_TEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var ICON_TG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.4-1.5ZM9 14.2l9.3-5.9c.4-.3.9-.1.5.3l-7.8 7.1-.3 3.3L9 14.2Z"/></svg>';

  /* кнопка шапки — главное действие страницы; её тема идёт в меню и в док.
     Своя тема страницы (свадьба, клип) берётся из первой кнопки заявки с темой */
  var head = document.querySelector(".nav .btn-lamp");
  var leads = document.querySelector("main [data-lead]:not([data-lead=''])") || document.querySelector("[data-lead]:not([data-lead=''])");
  var topic = leads ? leads.getAttribute("data-lead").replace(/"/g, "") : "";
  var leadBtn = head && head.hasAttribute("data-lead");
  function cta(cls, text) {
    return leadBtn
      ? '<button class="' + cls + '" type="button" data-lead="' + topic + '">' + text + "</button>"
      : '<a class="' + cls + '" href="' + head.getAttribute("href") + '" target="_blank" rel="noopener">' + head.textContent + "</a>";
  }
  function links(list) {
    return list.map(function (s) {
      return '<a' + (s[2] ? ' class="' + s[2] + '"' : "") + ' href="' + s[0] + '"' +
        (s[0] === path ? ' aria-current="page"' : "") + ">" + s[1] + "</a>";
    }).join("");
  }

  /* --- бургер + полноэкранное меню (телефон и планшет) --- */
  var burger = document.createElement("button");
  burger.className = "burger";
  burger.setAttribute("aria-label", "Меню");
  burger.setAttribute("aria-expanded", "false");
  burger.innerHTML = "<i></i><i></i><i></i>";
  navIn.appendChild(burger);

  var menu = document.createElement("nav");
  menu.className = "menu";
  menu.setAttribute("aria-label", "Меню");
  menu.innerHTML =
    '<div class="menu-in">' +
    '<div class="menu-col"><span class="label">Разделы</span>' +
    links([["/raboty.html", "Работы"], ["/education.html", "Обучение"]]) + "</div>" +
    '<div class="menu-col"><span class="label">Услуги и цены</span>' + links(SVC) + "</div>" +
    '<div class="menu-col"><span class="label">Знания</span>' + links(KNOW) + "</div>" +
    '<div class="menu-cta">' +
    (head ? cta("btn btn-lamp", "Обсудить проект") : "") +
    '<a class="btn btn-ghost" href="' + TEL + '">Позвонить: +7 982 905-44-54</a>' +
    '<a class="btn btn-ghost" href="' + TG + '" target="_blank" rel="noopener">Написать в телеграм</a>' +
    '<a class="btn btn-ghost" href="https://vk.ru/sbphotoshoter" target="_blank" rel="noopener">Написать в ВК</a>' +
    "</div></div>";
  document.body.appendChild(menu);

  function toggle(open) {
    menu.classList.toggle("on", open);
    burger.classList.toggle("x", open);
    burger.setAttribute("aria-expanded", String(open));
    document.documentElement.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", function () { toggle(!menu.classList.contains("on")); });
  menu.addEventListener("click", function (e) { if (e.target.closest("a, button")) toggle(false); });
  addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("on")) { toggle(false); burger.focus(); } });

  /* Конструкторы документов живут своей раскладкой (панель настроек и лист):
     таймлайн и док там мешают работе, у них свой призыв внизу страницы */
  var tool = document.querySelector("main .cfg, main .paper, main #paper");

  /* --- таймлайн сцен --- */
  var scenes = [].slice.call(document.querySelectorAll("[data-scene]"));
  var auto = !scenes.length;
  if (auto && !tool) {
    var h1 = document.querySelector("main h1");
    scenes = [].slice.call(document.querySelectorAll("main h2")).filter(function (h) { return h.offsetParent !== null; });
    if (h1) scenes.unshift(h1);
  }
  var bar = document.getElementById("route");
  if (scenes.length >= 3 && !bar && !tool) {
    bar = document.createElement("div");
    bar.className = "route-bar";
    bar.id = "route";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<div class="route-in"><span class="route-here" data-here></span>' +
      '<a class="route-next" data-route-next href="#" tabindex="-1"></a></div><div class="route" data-route></div>';
    document.body.appendChild(bar);
  }
  if (bar && scenes.length >= 3) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    var name = function (el, low) {
      if (el.tagName === "H1") return low ? "начало" : "Начало";
      if (el.closest(".footer-cta")) return low ? "ваш ход" : "Ваш ход";
      var t = el.textContent.replace(/\s+/g, " ").trim();
      /* «Дальше: как проходит съёмка», но «Дальше: DaVinci…» — аббревиатуры не трогаем */
      return low && t.length > 1 && t[1] === t[1].toLowerCase() ? t[0].toLowerCase() + t.slice(1) : t;
    };
    var track = bar.querySelector("[data-route]"), here = bar.querySelector("[data-here]"), next = bar.querySelector("[data-route-next]");
    var cells = scenes.map(function () { return track.appendChild(document.createElement("b")); });
    var ticking = false;
    var paint = function () {
      ticking = false;
      var line = innerHeight * 0.4, cur = 0, tops = scenes.map(function (s) { return s.getBoundingClientRect().top; });
      tops.forEach(function (top, i) {
        if (top < line) cur = i;
        /* у сцены-заголовка нет своей высоты: сцена тянется до следующего заголовка */
        var end = i + 1 < tops.length ? tops[i + 1] : (auto ? top + scenes[i].parentNode.getBoundingClientRect().height : top + scenes[i].getBoundingClientRect().height);
        var h = auto ? Math.max(1, end - top) : scenes[i].getBoundingClientRect().height;
        cells[i].style.setProperty("--p", Math.min(1, Math.max(0, (line - top) / h)).toFixed(3));
        cells[i].classList.toggle("on", false);
      });
      cells[cur].classList.add("on");
      bar.classList.toggle("on", scrollY > innerHeight * 0.6);
      var s = scenes[cur], n = scenes[cur + 1];
      here.textContent = "Сцена " + pad(cur + 1) + " из " + pad(scenes.length) + " · " + (auto ? name(s) : s.dataset.scene);
      if (n) {
        if (!n.id) n.id = "scena-" + pad(cur + 2);
        next.textContent = "Дальше: " + (auto ? name(n, true) : s.dataset.next) + " →";
        next.href = "#" + n.id;
        next.hidden = false;
      } else next.hidden = true;
    };
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    addEventListener("resize", paint);
    paint();
  }

  /* --- док телефона: заявка всегда под пальцем, пока её нет на экране --- */
  var dock = document.getElementById("dock");
  if (!dock && head && leadBtn && !tool) {
    dock = document.createElement("div");
    dock.className = "dock";
    dock.id = "dock";
    dock.innerHTML = cta("btn btn-lamp", "Обсудить проект") +
      '<a class="btn btn-ghost" href="' + TEL + '" aria-label="Позвонить: +7 982 905-44-54">' + ICON_TEL + "</a>" +
      '<a class="btn btn-ghost" href="' + TG + '" target="_blank" rel="noopener" aria-label="Написать в телеграм">' + ICON_TG + "</a>";
    document.body.appendChild(dock);
  }
  if (dock && "IntersectionObserver" in window) {
    document.body.classList.add("has-dock");
    var seen = new Set();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      dock.classList.toggle("away", seen.size > 0);
    }, { threshold: 0.15 });
    /* прячется там, где заявка и так на экране: первый экран, бриф, финальная сцена, подвал */
    [].forEach.call(document.querySelectorAll("#zayavka, #top, .svc-hero, .art-hero, .geo-hero, .footer-cta, .footer"), function (el) { io.observe(el); });
  }
})();

/* ---------- прокручиваемые блоки: доступ с клавиатуры ---------- */
/* Лента кадров, лист документа, широкие таблицы листаются мышью и пальцем, но
   без tabindex до их содержимого не добраться ни с клавиатуры, ни экранным
   диктором (WCAG 2.1.1). Ставим уже после отрисовки: до неё размеры нулевые. */
addEventListener("load", function () {
  var scan = function () {
    var nodes = document.querySelectorAll("div, section, ul, ol, table, pre, figure");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.hasAttribute("tabindex") || el.closest("dialog")) continue;
      var st = getComputedStyle(el);
      var scrolls = /(auto|scroll)/.test(st.overflowX + " " + st.overflowY) &&
        (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2);
      if (scrolls) el.setAttribute("tabindex", "0");
    }
  };
  scan();
  /* содержимое листа документа собирается скриптом инструмента позже */
  var late = document.getElementById("paper");
  if (late) new MutationObserver(scan).observe(late, { childList: true, subtree: true });
});
