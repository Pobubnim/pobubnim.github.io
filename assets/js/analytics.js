/* ПОБУБНИМ — аналитика. Яндекс.Метрика 111935483 (аккаунт Shlagerez2535).
   Один файл на все страницы: счётчик + цели. Цели ловятся делегированием
   событий на document, поэтому разметку страниц править не нужно.
   Что включено: визиты, источники переходов, время на сайте, вебвизор
   (запись сессий), карта скроллинга, аналитика форм. */

var YM_ID = 111935483;

/* адрес тега ОБЯЗАН содержать ?id=<счётчик> — без него tag.js грузится,
   но не разбирает очередь вызовов, и счётчик молча не стартует */
(function (m, e, t, r, i, k, a) {
  m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
  m[i].l = 1 * new Date();
  for (var j = 0; j < document.scripts.length; j++) {
    if (document.scripts[j].src === r) return;
  }
  k = e.createElement(t); a = e.getElementsByTagName(t)[0];
  k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=" + YM_ID, "ym");

ym(YM_ID, "init", {
  ssr: true,
  webvisor: true,          /* запись сессий: видно, как ходят по сайту */
  clickmap: true,          /* карта кликов */
  trackLinks: true,        /* внешние переходы */
  accurateTrackBounce: true, /* отказ считается только при < 15 сек */
  trackHash: true          /* якорные разделы главной как отдельные просмотры */
});

/* ---------- цели ---------- */
(function () {
  function goal(name, params) {
    if (typeof ym === "function") ym(YM_ID, "reachGoal", name, params || {});
  }
  window.pbGoal = goal;

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a, button");
    if (!a) return;
    var href = (a.getAttribute("href") || "").toLowerCase();

    /* контакты */
    if (href.indexOf("t.me/sbphotoshoter") > -1) goal("tg_click");
    else if (href.indexOf("vk.ru/sbphotoshoter") > -1 || href.indexOf("vk.com/sbphotoshoter") > -1) goal("vk_click");
    else if (href.indexOf("t.me/pobubnimzavideo") > -1) goal("channel_click");

    /* заявка */
    if (a.hasAttribute && a.hasAttribute("data-lead")) goal("lead_open");
    if (a.id === "lf-send") goal("lead_try");

    /* инструменты: выгрузка документов и расчётов */
    if (a.id === "btn-doc") goal("tool_word", { tool: location.pathname });
    if (a.id === "btn-print") goal("tool_pdf", { tool: location.pathname });
    if (a.id === "btn-copy") goal("tool_copy", { tool: location.pathname });

    /* уроки: работа с интерактивной доской */
    if (a.classList && (a.classList.contains("vbtn") || a.classList.contains("fbtn"))) goal("lesson_board");
  }, true);

  /* заявка ушла успешно — статус меняется скриптом формы */
  var st = document.getElementById("lf-status");
  if (st && window.MutationObserver) {
    new MutationObserver(function () {
      if (/отправл|принят|спасибо/i.test(st.textContent)) goal("lead_send");
    }).observe(st, { childList: true, subtree: true, characterData: true });
  }

  /* ползунки уроков и инструментов — считаем один раз за страницу */
  var slid = false;
  document.addEventListener("input", function (e) {
    if (slid) return;
    if (e.target.type === "range") { slid = true; goal("lesson_slider"); }
  }, true);
})();
