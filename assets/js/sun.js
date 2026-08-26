/* ПОБУБНИМ — солнце на съёмочной смене (алгоритм NOAA Solar Calculator).
   Восход, закат, солнечный полдень, золотой и синий час для даты и точки.
   Формулы и границы — docs/EDU_BASE.md §8з; точность порядка минуты, чего
   для планирования смены достаточно. Ничего не грузит и никуда не ходит. */

(function () {
  var RAD = Math.PI / 180;

  /* города съёмок: широта, долгота, часовой пояс (в России летнего времени нет) */
  var CITIES = [
    ["Москва", 55.7558, 37.6173, 3],
    ["Наро-Фоминск", 55.3853, 36.7325, 3],
    ["Обнинск", 55.0968, 36.6104, 3],
    ["Калуга", 54.5293, 36.2754, 3],
    ["Тула", 54.1961, 37.6182, 3],
    ["Санкт-Петербург", 59.9311, 30.3609, 3],
    ["Нижний Новгород", 56.3269, 44.0059, 3],
    ["Казань", 55.7963, 49.1088, 3],
    ["Ростов-на-Дону", 47.2225, 39.7189, 3],
    ["Краснодар", 45.0355, 38.9753, 3],
    ["Сочи", 43.5855, 39.7231, 3],
    ["Калининград", 54.7104, 20.4522, 2],
    ["Самара", 53.1959, 50.1002, 4],
    ["Екатеринбург", 56.8389, 60.6057, 5],
    ["Новосибирск", 55.0084, 82.9357, 7],
    ["Красноярск", 56.0153, 92.8932, 7],
    ["Иркутск", 52.2870, 104.3050, 8],
    ["Владивосток", 43.1155, 131.8855, 10],
    ["Мурманск", 68.9585, 33.0827, 3]
  ];

  function julianDay(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  /* солнечные величины на полдень по Гринвичу указанной даты */
  function solar(y, m, d) {
    var T = (julianDay(y, m, d) + 0.5 - 2451545) / 36525;
    var L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    var M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    var e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    var C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
            Math.sin(3 * M * RAD) * 0.000289;
    var trueLong = L0 + C;
    var omega = 125.04 - 1934.136 * T;
    var appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
    var eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    var eps = eps0 + 0.00256 * Math.cos(omega * RAD);
    var decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) / RAD;
    var yy = Math.tan(eps / 2 * RAD) * Math.tan(eps / 2 * RAD);
    var eqTime = 4 * (yy * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) +
      4 * e * yy * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * yy * yy * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD)) / RAD;
    return { decl: decl, eqTime: eqTime };
  }

  /* минуты местного времени, когда Солнце стоит на высоте alt (утром или вечером);
     null — в этот день такой высоты не бывает (полярный день или ночь) */
  function timeAt(alt, morning, lat, lng, tz, s) {
    var zen = (90 - alt) * RAD;
    var cosH = (Math.cos(zen) - Math.sin(lat * RAD) * Math.sin(s.decl * RAD)) /
               (Math.cos(lat * RAD) * Math.cos(s.decl * RAD));
    if (cosH > 1 || cosH < -1) return null;
    var H = Math.acos(cosH) / RAD;
    var noon = 720 - 4 * lng - s.eqTime + tz * 60;
    return noon + (morning ? -4 * H : 4 * H);
  }

  /* date: {y, m, d} по местному календарю; lat/lng в градусах, tz в часах */
  function times(y, m, d, lat, lng, tz) {
    var s = solar(y, m, d);
    var noon = 720 - 4 * lng - s.eqTime + tz * 60;
    var at = function (alt, morning) { return timeAt(alt, morning, lat, lng, tz, s); };
    return {
      /* −0.833° — верхний край диска с учётом рефракции (стандарт NOAA) */
      sunrise: at(-0.833, true),
      sunset: at(-0.833, false),
      noon: noon,
      /* золотой час: высота от −4° до +6°; синий: от −6° до −4° (PhotoPills) */
      goldenMorning: [at(-4, true), at(6, true)],
      goldenEvening: [at(6, false), at(-4, false)],
      blueMorning: [at(-6, true), at(-4, true)],
      blueEvening: [at(-4, false), at(-6, false)],
      /* гражданские сумерки */
      civilDawn: at(-6, true),
      civilDusk: at(-6, false),
      decl: s.decl,
      eqTime: s.eqTime
    };
  }

  function hhmm(mins) {
    if (mins === null || mins === undefined || isNaN(mins)) return null;
    var m = Math.round(mins);
    while (m < 0) m += 1440;
    m = m % 1440;
    var h = Math.floor(m / 60);
    return (h < 10 ? "0" : "") + h + ":" + (m % 60 < 10 ? "0" : "") + (m % 60);
  }

  window.PobubnimSun = { CITIES: CITIES, times: times, hhmm: hhmm };
})();
