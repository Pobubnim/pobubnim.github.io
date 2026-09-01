/* ПОБУБНИМ — единая навигация: бургер-меню (мобила) + дропдаун «Решения» (десктоп).
   Подключается на всех страницах; сам строит меню и понимает вложенность пути. */

(function () {
  var deep = /\/(services|cases|articles|uroki|instrumenty)\//.test(location.pathname);
  var root = deep ? "../" : "";
  var onHome = !deep && /(^\/$|index\.html$)/.test(location.pathname || "/");

  var SOLUTIONS = [
    ["reklamnyj-rolik", "Рекламный ролик"],
    ["imidzhevyj-film", "Имиджевый фильм"],
    ["svadebnoe-kino", "Свадебное кино"],
    ["muzykalnyj-klip", "Музыкальный клип"],
    ["cvetokorrekciya", "Цветокоррекция"],
    ["semka-meropriyatij", "Съёмка мероприятий"],
    ["sozdanie-sajtov", "Создание сайтов"],
    ["boty-avtomatizaciya", "Боты и автоматизация"],
  ];

  var navIn = document.querySelector(".nav-in");
  if (!navIn) return;

  /* Строку ссылок и дропдауны строит tools/build_nav.py — статикой, чтобы их
     видел поисковый робот. Здесь остаётся только бургер-меню. */

  /* --- бургер + полноэкранное меню (мобила) --- */
  var burger = document.createElement("button");
  burger.className = "burger";
  burger.setAttribute("aria-label", "Меню");
  burger.innerHTML = "<i></i><i></i><i></i>";
  navIn.appendChild(burger);

  function home(hash) { return onHome ? hash : "/" + hash; }

  var menu = document.createElement("nav");
  menu.className = "menu";
  menu.innerHTML =
    '<div class="menu-in">' +
    '<div class="menu-col"><span class="label">Разделы</span>' +
    '<a href="' + root + 'raboty.html">Работы</a>' +
    '<a href="' + home("#color") + '">Цвет</a>' +
    '<a href="' + home("#frames") + '">Кадры</a>' +
    '<a href="' + home("#digital") + '">Продукты</a>' +
    '<a href="' + home("#services") + '">Цены</a>' +
    '<a href="' + home("#about") + '">Обо мне</a>' +
    '<a href="' + root + 'articles/">Статьи</a>' +
    '<a href="' + root + 'uroki/">Уроки DaVinci</a>' +
    '<a href="' + root + 'instrumenty/">Инструменты</a>' +
    '<a class="hot" href="' + root + 'zakazy-sami.html">Заказы сами</a>' +
    '<a href="' + root + 'education.html">Обучение</a>' +
    "</div>" +
    '<div class="menu-col"><span class="label">Решения</span>' +
    SOLUTIONS.map(function (s) {
      return '<a href="' + root + "services/" + s[0] + '.html">' + s[1] + "</a>";
    }).join("") +
    "</div>" +
    '<div class="menu-cta">' +
    '<a class="btn btn-lamp" href="' + home("#zayavka") + '">Оставить заявку</a>' +
    '<a class="btn btn-ghost" href="https://vk.ru/sbphotoshoter" target="_blank" rel="noopener">Написать в ВК</a>' +
    '<a class="btn btn-ghost" href="https://t.me/pobubnimzavideo" target="_blank" rel="noopener">Канал ПОБУБНИМ</a>' +
    "</div></div>";
  document.body.appendChild(menu);

  function toggle(open) {
    menu.classList.toggle("on", open);
    burger.classList.toggle("x", open);
    document.documentElement.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", function () { toggle(!menu.classList.contains("on")); });
  menu.addEventListener("click", function (e) { if (e.target.tagName === "A") toggle(false); });
})();
