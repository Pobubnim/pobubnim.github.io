/* ПОБУБНИМ — ND-фильтры и экспозиция (instrumenty/kalkulyator-nd-filtra.html).
   Две задачи: видео — сколько стопов ND нужно, чтобы держать шаттер 180°;
   фото — во что превращается выдержка под фильтром. Числа и таблица EV —
   docs/EDU_BASE.md §8к. Всё считается в браузере. */

(function () {
  /* освещённость сцены в EV при ISO 100 (правило Sunny 16 и таблицы EV) */
  var SCENES = [
    ["Снег или светлый песок на солнце", 16],
    ["Яркое солнце, резкие тени", 15],
    ["Лёгкая дымка, мягкие тени", 14],
    ["Светлая облачность, теней нет", 13],
    ["Плотная пасмурность", 12],
    ["Открытая тень или закат", 11],
    ["Через час после заката", 9],
    ["Яркий интерьер, окна и свет", 8],
    ["Обычная комната вечером", 6],
    ["Улица ночью, витрины", 4]
  ];

  /* маркировка фильтра -> стопы */
  var FILTERS = [
    ["ND2", 1], ["ND4", 2], ["ND8", 3], ["ND16", 4], ["ND32", 5], ["ND64", 6],
    ["ND128", 7], ["ND256", 8], ["ND500", 9], ["ND1000", 10], ["ND2000", 11]
  ];

  function stopsToFactor(stops) { return Math.pow(2, stops); }
  function factorToStops(f) { return Math.log(f) / Math.LN2; }
  /* оптическая плотность: 1 стоп = 0.3 D */
  function density(stops) { return stops * 0.30103; }

  /* выдержка по углу шаттера: 180° при 25 к/с = 1/50 */
  function shutterFromAngle(fps, angle) {
    if (!fps || !angle) return null;
    return angle / (360 * fps);
  }

  /* сколько стопов ND нужно, чтобы при диафрагме N, чувствительности ISO и
     сцене evScene (для ISO 100) держать выдержку t секунд */
  function ndStops(evScene, iso, N, t) {
    var evIso = evScene + factorToStops(iso / 100);   /* EV сцены для этой ISO */
    var evSet = factorToStops(N * N / t);             /* EV, который дают настройки */
    return evIso - evSet;                             /* > 0 — пересвет, нужен ND */
  }

  /* ближайшие фильтры: точный и «что есть в сумке» */
  function pickFilters(stops) {
    if (stops <= 0) return [];
    var out = [];
    FILTERS.forEach(function (f) {
      out.push({ name: f[0], stops: f[1], diff: f[1] - stops });
    });
    out.sort(function (a, b) { return Math.abs(a.diff) - Math.abs(b.diff); });
    return out.slice(0, 3);
  }

  /* человеческая выдержка: 1/50, 1/125, 2 с, 30 с */
  function shutterText(t) {
    if (!t || !isFinite(t)) return "—";
    if (t >= 60) {
      var m = Math.floor(t / 60), s = Math.round(t % 60);
      return m + " мин" + (s ? " " + s + " с" : "");
    }
    if (t >= 1) {
      var v = t >= 10 ? Math.round(t) : Math.round(t * 10) / 10;
      return v.toLocaleString("ru-RU") + " с";   /* на русской странице — запятая */
    }
    return "1/" + Math.round(1 / t);
  }

  window.PobubnimNd = {
    SCENES: SCENES, FILTERS: FILTERS, ndStops: ndStops, pickFilters: pickFilters,
    shutterFromAngle: shutterFromAngle, shutterText: shutterText,
    stopsToFactor: stopsToFactor, factorToStops: factorToStops, density: density
  };
})();
