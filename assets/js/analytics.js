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

/* ---------- откуда человек пришёл (для заявки) ----------
   Заявка редко уходит со страницы входа: пришёл по рекламе на услугу, посмотрел
   работы, написал с третьей страницы. Поэтому источник снимается при заходе с
   метками или с чужого сайта и живёт в localStorage: pb_src_first — самый первый,
   pb_src_last — последний. lead.js кладёт его в заявку (window.pbSource).
   Переходы внутри сайта источник не перетирают. */
(function () {
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"];
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } }
  try {
    var q = new URLSearchParams(location.search), src = {};
    KEYS.forEach(function (k) { var v = q.get(k); if (v) src[k] = v.slice(0, 80); });
    var ref = document.referrer || "";
    var host = ref.replace(/^https?:\/\//, "").split("/")[0];
    var own = /(^|\.)pobubnim\.(ru|github\.io)$/.test(host);
    if (ref && !own) src.ref = host;
    if (Object.keys(src).length) {
      src.land = location.pathname;
      src.date = new Date().toISOString().slice(0, 10);
      var s = JSON.stringify(src);
      if (!localStorage.getItem("pb_src_first")) localStorage.setItem("pb_src_first", s);
      localStorage.setItem("pb_src_last", s);
    }
  } catch (_) { /* приватный режим без localStorage: заявка уйдёт без источника */ }

  /* ClientID Метрики — по нему заявку потом можно вернуть в Метрику офлайн-конверсией */
  var cid = "";
  if (typeof ym === "function") ym(YM_ID, "getClientID", function (id) { cid = String(id || ""); });

  window.pbSource = function () {
    return { first: read("pb_src_first"), last: read("pb_src_last"), cid: cid };
  };
})();

/* ---------- цели ---------- */
(function () {
  function goal(name, params) {
    if (typeof ym === "function") ym(YM_ID, "reachGoal", name, params || {});
  }
  window.pbGoal = goal;

  /* ---- интерактивы: какая доска и какой контрол ----
     дерево параметров визита: lesson → доска → контрол; в Метрике читается
     отчётом «Параметры визитов» и сводкой daily_stats.py (paramsLevel1..3) */
  var BOARD = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
  function lesson(goalName, control) {
    if (typeof ym === "function") {
      var tree = { lesson: {} };
      tree.lesson[BOARD] = {};
      tree.lesson[BOARD][control] = 1;
      ym(YM_ID, "params", tree);
    }
    goal(goalName, { board: BOARD, control: control });
  }
  /* драги и ползунки шлём по разу за страницу НА КАЖДЫЙ контрол (не шквалом) */
  var seen = {};
  function lessonOnce(goalName, control) {
    if (seen[control]) return;
    seen[control] = true;
    lesson(goalName, control);
  }
  /* имя кнопки доски по data-атрибутам виз-движков */
  function btnControl(b) {
    var d = b.dataset || {};
    if (d.view) return "прибор:" + d.view;
    if (d.pview) return "прибор:" + d.pview;
    if (d.frame) return "кадр:" + d.frame;
    if (d.scene) return "задание:" + d.scene;
    if (d.method) return "метод:" + d.method;
    if (d.bmode) return "стадия:" + d.bmode;
    if (d.curve) return "кривая:" + d.curve;
    if (d.resample !== undefined) return "кнопка:пересыпать";
    if (d.resetAll !== undefined || d.wreset !== undefined) return "кнопка:сброс";
    return "кнопка:" + (b.textContent || "").trim().slice(0, 24);
  }
  /* имя ползунка по его атрибутам */
  function rangeControl(r) {
    var d = r.dataset || {};
    var nm = d.param || d.wells || (d.stops !== undefined ? "stops" : "") ||
             (d.exp !== undefined ? "exposure" : "") || d.labFilter || r.id ||
             (r.getAttribute("aria-label") || "range").slice(0, 24);
    return "ползунок:" + nm;
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a, button");
    if (!a) return;
    var href = (a.getAttribute("href") || "").toLowerCase();

    /* контакты */
    if (href.indexOf("t.me/sbphotoshoter") > -1) goal("tg_click");
    else if (href.indexOf("vk.ru/sbphotoshoter") > -1 || href.indexOf("vk.com/sbphotoshoter") > -1) goal("vk_click");
    else if (href.indexOf("t.me/pobubnimzavideo") > -1) goal("channel_click");
    else if (href.indexOf("tel:") === 0) goal("phone_click", { page: location.pathname });

    /* заявка */
    if (a.hasAttribute && a.hasAttribute("data-lead")) goal("lead_open");
    if (a.id === "lf-send") goal("lead_try");

    /* инструменты: выгрузка документов и расчётов */
    if (a.id === "btn-doc") goal("tool_word", { tool: location.pathname });
    if (a.id === "btn-print") goal("tool_pdf", { tool: location.pathname });
    if (a.id === "btn-copy") goal("tool_copy", { tool: location.pathname });

    /* уроки: кнопки досок — каждый клик, с именем доски и контрола */
    if (a.classList && (a.classList.contains("vbtn") || a.classList.contains("fbtn")))
      lesson("lesson_board", btnControl(a));
  }, true);

  /* колёса и мастер-рейки досок — драг, а не клик: ловим pointerdown */
  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest && (e.target.closest("[data-disc]") || e.target.closest("[data-rail]"));
    if (!t) return;
    var w = t.closest("[data-wheel]");
    var kind = t.hasAttribute("data-disc") ? "колесо:" : "рейка:";
    lessonOnce("lesson_board", kind + (w ? w.dataset.wheel : "?"));
  }, true);

  /* ползунки уроков и инструментов — раз за страницу на КАЖДЫЙ ползунок */
  document.addEventListener("input", function (e) {
    if (e.target.type === "range") lessonOnce("lesson_slider", rangeControl(e.target));
  }, true);
})();
