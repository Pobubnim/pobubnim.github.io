/* ПОБУБНИМ — вызывной лист v2 (instrumenty/vyzyvnoj-list.html).
   День смены на одном листе: свободное расписание, локации со ссылкой на карту,
   группа и те, кто в кадре, блоки по выбору и СВЕТ — восход, закат и золотой час
   считаются по дате и координатам (sun.js, формулы NOAA; канон — docs/EDU_BASE.md §8з).
   Рассылка, календарь и таблица живут в callsheet-out.js. Всё локально в браузере.

   Черновик лежит под прежним ключом: у людей остались листы первой версии,
   формат различаем по полю v и переводим при чтении (migrate). */

(function () {
  function $(id) { return document.getElementById(id); }
  var form = $("cfg"), paper = $("paper");
  if (!form || !paper) return;

  var KEY = "pobubnim-callsheet-v1";
  var PEOPLE = "pobubnim-people-v1";
  var SHOTS = "pobubnim-shotlist-v1";
  var SUN = window.PobubnimSun;
  var toast = window.PobubnimToast || function () {};

  var FIELDS = ["proj", "date", "day", "city", "lat", "lng", "tz", "client", "wx",
    "hosp", "hospaddr", "hosptel", "notes"];

  /* роль -> цех: по цехам группа собирается на листе, когда людей много */
  var ROLES = [["Режиссёр", "Режиссура"], ["Второй режиссёр", "Режиссура"],
    ["Оператор-постановщик", "Камера"], ["Второй оператор", "Камера"],
    ["Ассистент камеры", "Камера"], ["Фокус-пуллер", "Камера"], ["Дрон-оператор", "Камера"],
    ["Гафер", "Свет"], ["Осветитель", "Свет"], ["Звукорежиссёр", "Звук"],
    ["Гримёр", "Грим и костюм"], ["Стилист", "Грим и костюм"],
    ["Художник-постановщик", "Арт"], ["Продюсер", "Продакшн"], ["Администратор", "Продакшн"],
    ["Водитель", "Продакшн"], ["Фотограф", "Фото"], ["Ассистент", "Продакшн"]];
  var DEPTS = ["Режиссура", "Продакшн", "Камера", "Свет", "Звук", "Арт", "Грим и костюм", "Фото", "Группа"];
  var DEPT_RE = [[/режисс|хлопушк|скрипт/, "Режиссура"], [/оператор|камер|фокус|дрон|стедикам|dit\b/, "Камера"],
    [/свет|гаф+ер/, "Свет"], [/звук|бум/, "Звук"], [/грим|визаж|стилист|костюм|парикмах/, "Грим и костюм"],
    [/худож|реквизит|декор/, "Арт"], [/продюс|админ|координ|локейшн|водител|директор|ассистент/, "Продакшн"],
    [/фото/, "Фото"]];
  function dept(role) {
    var r = (role || "").trim().toLowerCase(), i;
    for (i = 0; i < ROLES.length; i++) if (ROLES[i][0].toLowerCase() === r) return ROLES[i][1];
    for (i = 0; i < DEPT_RE.length; i++) if (DEPT_RE[i][0].test(r)) return DEPT_RE[i][1];
    return "Группа";
  }

  /* заготовки смены: [минут от сбора, что]. Это каркас, а не норматив — время правится */
  var PRESETS = [
    ["Полный день", [[0, "Сбор группы"], [30, "Выезд"], [120, "Начало съёмки"], [360, "Обед"], [720, "Конец смены"]]],
    ["Короткая съёмка", [[0, "Сбор группы"], [30, "Начало съёмки"], [210, "Конец съёмки"], [240, "Конец смены"]]],
    ["Интервью", [[0, "Сбор группы"], [15, "Ставим свет и звук"], [75, "Герой на площадке"], [90, "Начало съёмки: интервью"],
      [180, "Перебивки и детали"], [240, "Конец смены"]]],
    ["Реклама или клип", [[0, "Сбор группы"], [30, "Подготовка площадки, свет"], [60, "Грим и костюм"],
      [120, "Начало съёмки: блок 1"], [360, "Обед"], [420, "Блок 2"], [690, "Стоп, сбор техники"], [720, "Конец смены"]]],
    ["Мероприятие", [[0, "Сбор группы"], [15, "Расстановка камер и звука"], [60, "Проверка картинки и звука"],
      [90, "Начало съёмки: гости и открытие"], [300, "Конец программы"], [330, "Конец смены"]]],
    ["Фотосессия", [[0, "Сбор группы"], [15, "Грим и причёска"], [60, "Свет и пробные кадры"],
      [90, "Начало съёмки: образ 1"], [180, "Образ 2"], [270, "Конец смены"]]]
  ];
  var SCHED_WORDS = ["Сбор группы", "Выезд", "Подготовка площадки, свет", "Грим и костюм", "Репетиция",
    "Начало съёмки", "Обед", "Переезд на вторую локацию", "Стоп, сбор техники", "Конец смены"];

  /* блоки по выбору: три со своей разметкой в странице, остальные — заголовок и текст */
  var BLOCKS = [["cast", "В кадре"], ["scenes", "Что снимаем"], ["safety", "Безопасность"],
    ["transport", "Транспорт", "Кто кого везёт, откуда и во сколько. Номера машин для пропуска."],
    ["food", "Питание", "Обед на площадке в 13:00 на восемь человек, один без мяса. Вода и кофе с утра."],
    ["gear", "Техника и реквизит", "Камера и свет едут с оператором. Реквизит привозит заказчик к 09:00."],
    ["comms", "Связь", "Рации: канал 1 — площадка, канал 2 — свет. Общий чат смены в телеграме."],
    ["planb", "План Б", "Если дождь — натуру переносим под навес и начинаем с интерьера."],
    ["tomorrow", "Завтра", "Смена 2: сбор в 08:00 на той же локации, снимаем интерьер и финал."]];

  /* колонки строк: [ключ, тип, подпись, подсказка в поле, datalist] */
  var ED = {
    sched: [["t", "time", "Время"], ["what", "text", "Что происходит", "Что происходит", "dl-sched"]],
    locs: [["name", "text", "Локация", "Локация: студия, цех, парк"], ["time", "time", "Снимаем с"],
      ["addr", "text", "Адрес", "Адрес — по нему на листе появится ссылка на карту"],
      ["how", "text", "Как попасть", "Въезд, парковка, вход, кого спросить"]],
    crew: [["role", "text", "Роль", "Роль", "dl-role"], ["at", "time", "Вызов"],
      ["who", "text", "Имя", "Имя", "dl-people"], ["phone", "tel", "Телефон", "Телефон"]],
    cast: [["who", "text", "Кто", "Имя", "dl-people"], ["at", "time", "Вызов"], ["ready", "time", "В кадре"],
      ["part", "text", "Кто это в кадре", "Роль, герой, модель"], ["phone", "tel", "Телефон", "Телефон"]],
    scenes: [["what", "text", "Сцена или блок", "Сцена, блок или образ"],
      ["where", "text", "Где и когда", "Где и когда: цех, день"], ["note", "text", "Объём", "Объём: 7 кадров, 45 мин"]]
  };
  var LISTS = ["sched", "locs", "crew", "cast", "scenes"];

  function blank(kind) {
    return { sched: { t: "", what: "" }, locs: { name: "", addr: "", time: "", how: "" },
      crew: { role: "", who: "", phone: "", at: "", st: "" },
      cast: { who: "", part: "", phone: "", at: "", ready: "", st: "" },
      scenes: { what: "", where: "", note: "" } }[kind];
  }
  function row(kind, o) { var r = blank(kind), k; for (k in o) r[k] = o[k]; return r; }
  function fresh() {
    return { v: 2,
      sched: [row("sched", { what: "Сбор группы" }), row("sched", { what: "Начало съёмки" }), row("sched", { what: "Конец смены" })],
      locs: [blank("locs")], crew: [row("crew", { role: "Оператор-постановщик" })],
      cast: [blank("cast")], scenes: [blank("scenes")],
      on: {}, txt: {}, contact: "", noPhones: false, rev: 0, snap: null, sentAt: "" };
  }
  var S = fresh();

  /* ---------- мелочи ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function val(id) { return ($(id) || {}).value || ""; }
  function num(id) { return parseFloat(val(id).replace(",", ".")); }
  /* «08:30» -> минуты от полуночи; пусто -> null */
  function mins(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function fromMins(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return p2(Math.floor(m / 60)) + ":" + p2(m % 60); }
  function hm(total) {
    var h = Math.floor(total / 60), m = Math.round(total % 60);
    return ((h ? h + " ч " : "") + (m || !h ? m + " мин" : "")).trim();
  }
  function pl(n, f) {
    var u = n % 100;
    if (u > 10 && u < 20) return f[2];
    u %= 10;
    return u === 1 ? f[0] : (u > 1 && u < 5 ? f[1] : f[2]);
  }
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
    "августа", "сентября", "октября", "ноября", "декабря"];
  var DAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  function dateParts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function dateRu(iso, weekday) {
    var p = dateParts(iso);
    if (!p) return esc(iso);
    return (weekday ? DAYS[new Date(p.y, p.m - 1, p.d).getDay()] + ", " : "") +
      p.d + " " + MONTHS[p.m - 1] + " " + p.y + " г.";
  }
  function isoOf(dt) { return dt.getFullYear() + "-" + p2(dt.getMonth() + 1) + "-" + p2(dt.getDate()); }

  /* «89161234567» -> «+7 916 123-45-67»; чужой формат не трогаем */
  function fmtPhone(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
    else if (!(d.length === 10 && d[0] === "9")) return String(v).trim();
    return "+7 " + d.slice(0, 3) + " " + d.slice(3, 6) + "-" + d.slice(6, 8) + "-" + d.slice(8);
  }
  /* номер для wa.me и tel: — только цифры, восьмёрка становится семёркой */
  function digits(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
    if (d.length === 10 && d[0] === "9") d = "7" + d;
    return d.length >= 11 ? d : "";
  }
  function mapUrl(addr) {
    var city = val("f-city").trim();
    var q = city && addr.toLowerCase().indexOf(city.toLowerCase()) < 0 ? city + ", " + addr : addr;
    return "https://yandex.ru/maps/?text=" + encodeURIComponent(q);
  }

  /* ---------- город и солнце ---------- */
  var cityMap = {};
  SUN.CITIES.forEach(function (c) { cityMap[c[0].toLowerCase()] = c; });
  function options(arr) { return arr.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join(""); }
  $("dl-city").innerHTML = options(SUN.CITIES.map(function (c) { return c[0]; }));
  $("dl-role").innerHTML = options(ROLES.map(function (r) { return r[0]; }));
  $("dl-sched").innerHTML = options(SCHED_WORDS);

  function applyCity() {
    var c = cityMap[val("f-city").trim().toLowerCase()];
    if (!c) return;
    $("f-lat").value = c[1];
    $("f-lng").value = c[2];
    $("f-tz").value = c[3];
  }
  function sunOfDay() {
    var p = dateParts(val("f-date"));
    if (!p) return null;
    var lat = num("f-lat"), lng = num("f-lng"), tz = num("f-tz");
    if (isNaN(lat) || isNaN(lng)) return null;
    return SUN.times(p.y, p.m, p.d, lat, lng, isNaN(tz) ? 3 : tz);
  }

  /* ---------- расписание: порядок строк = порядок дня ---------- */
  function kindOf(what) {
    var w = (what || "").toLowerCase();
    if (/^(общий )?сбор|вызов групп/.test(w)) return "call";
    if (/начало съ|мотор|начало зап/.test(w)) return "start";
    if (/обед/.test(w)) return "lunch";
    if (/конец смен|конец съ|окончание|^стоп/.test(w)) return "end";
    return "";
  }
  /* строки со временем в минутах от полуночи дня съёмки. Время пошло назад с вечера
     на утро — смена перешла через полночь; назад среди дня — строки стоят не по порядку */
  function timeline() {
    var out = [], prev = null, add = 0, messy = false;
    S.sched.forEach(function (r, i) {
      var m = mins(r.t);
      if (m === null) return;
      if (prev !== null && m + add < prev) {
        if (m < 720 && prev % 1440 >= 720) add += 1440; else messy = true;
      }
      prev = Math.max(prev === null ? 0 : prev, m + add);
      out.push({ i: i, t: r.t, m: m + add, what: r.what, k: kindOf(r.what) });
    });
    out.messy = messy;
    return out;
  }
  function keyTimes() {
    var tl = timeline();
    function find(k, last) {
      var hit = null;
      for (var i = 0; i < tl.length; i++) if (tl[i].k === k && (last || !hit)) hit = tl[i];
      return hit;
    }
    /* «стоп» и «конец смены» могут стоять оба — концом считается последняя такая строка */
    var k = { tl: tl, call: find("call") || tl[0] || null, start: find("start"), lunch: find("lunch"),
      end: find("end", true) || (tl.length > 1 ? tl[tl.length - 1] : null) };
    if (k.end && k.call && k.end.m <= k.call.m) k.end = null;
    return k;
  }

  /* ---------- строки ---------- */
  var ROWBTNS = '<span class="rowbtns">' +
    '<button type="button" class="up" aria-label="Выше">↑</button>' +
    '<button type="button" class="down" aria-label="Ниже">↓</button>' +
    '<button type="button" class="del-row" aria-label="Удалить строку">✕</button></span>';

  function drawRows(key) {
    $(key).innerHTML = S[key].map(function (r, i) {
      return '<div class="row-i" data-i="' + i + '"><span class="rn">' + (i + 1) + "</span>" +
        ED[key].map(function (c) {
          var inp = 'data-k="' + c[0] + '" type="' + c[1] + '" value="' + esc(r[c[0]] || "") +
            '" aria-label="' + c[2] + '"' + (c[3] ? ' placeholder="' + c[3] + '"' : "") +
            (c[4] ? ' list="' + c[4] + '" autocomplete="off"' : "") + (c[1] === "tel" ? ' inputmode="tel"' : "");
          return c[1] === "time"
            ? '<label class="tm x-' + c[0] + '"><span>' + c[2] + "</span><input " + inp + "></label>"
            : '<input class="x-' + c[0] + '" ' + inp + ">";
        }).join("") + ROWBTNS + "</div>";
    }).join("");
  }
  function drawAll() { LISTS.forEach(drawRows); }
  function focusRow(key, i, sel) {
    var el = $(key).querySelector('.row-i[data-i="' + i + '"] ' + (sel || "input"));
    if (el) el.focus();
  }
  function addRow(key, r, sel) {
    S[key].push(r || blank(key));
    drawRows(key);
    changed();
    focusRow(key, S[key].length - 1, sel);
  }

  var book = [];                      /* память людей: имя -> телефон и роль, только в этом браузере */
  function loadBook() {
    try { book = JSON.parse(localStorage.getItem(PEOPLE)) || []; } catch (e) { book = []; }
    $("dl-people").innerHTML = options(book.map(function (p) { return p.who; }));
  }
  function remember() {
    var by = {}, fresh = false;
    book.forEach(function (p) { by[p.who.toLowerCase()] = p; });
    S.crew.concat(S.cast).forEach(function (p) {
      var who = (p.who || "").trim();
      if (!who || !p.phone || /^\+7 900 000-00-/.test(p.phone)) return;   /* пример не запоминаем */
      var old = by[who.toLowerCase()];
      if (old && old.phone === p.phone && (old.role === p.role || !p.role)) return;
      by[who.toLowerCase()] = { who: who, phone: p.phone, role: p.role || (old ? old.role : "") };
      fresh = true;
    });
    if (!fresh) return;
    book = Object.keys(by).map(function (k) { return by[k]; }).slice(-200);
    try { localStorage.setItem(PEOPLE, JSON.stringify(book)); } catch (e) { /* приватный режим */ }
    $("dl-people").innerHTML = options(book.map(function (p) { return p.who; }));
  }

  function bindRows(key) {
    var el = $(key);
    el.addEventListener("input", function (e) {
      var r = e.target.closest(".row-i"), k = e.target.getAttribute("data-k");
      if (!r || !k) return;
      S[key][+r.dataset.i][k] = e.target.value;
      changed();
    });
    el.addEventListener("change", function (e) {
      var r = e.target.closest(".row-i"), k = e.target.getAttribute("data-k");
      if (!r || !k) return;
      var item = S[key][+r.dataset.i];
      if (k === "phone") { item.phone = e.target.value = fmtPhone(e.target.value); changed(); }
      if (k === "who") {                 /* знакомое имя — телефон и роль подставляются сами */
        var who = e.target.value.trim().toLowerCase(), hit = null;
        book.forEach(function (p) { if (p.who.toLowerCase() === who) hit = p; });
        if (!hit) return;
        /* пишем прямо в поля строки: перерисовка списка сбила бы фокус на полпути по Tab */
        var ph = r.querySelector('[data-k="phone"]'), ro = r.querySelector('[data-k="role"]');
        if (!item.phone) item.phone = ph.value = hit.phone;
        if (ro && !item.role && hit.role) item.role = ro.value = hit.role;
        changed();
      }
    });
    el.addEventListener("click", function (e) {
      var r = e.target.closest(".row-i");
      if (!r) return;
      var i = +r.dataset.i, arr = S[key], up = e.target.closest(".up"), down = e.target.closest(".down");
      if (up || down) {
        var j = i + (up ? -1 : 1);
        if (j < 0 || j >= arr.length) return;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        drawRows(key);
        changed();
        focusRow(key, j, up ? ".up" : ".down");
      } else if (e.target.closest(".del-row")) {
        var gone = arr.splice(i, 1)[0], filled = Object.keys(gone).some(function (k) { return k !== "st" && gone[k]; });
        if (!arr.length) arr.push(blank(key));
        drawRows(key);
        changed();
        if (filled) toast("Строка удалена", function () {
          if (arr.length === 1 && !Object.keys(arr[0]).some(function (k) { return arr[0][k]; })) arr.length = 0;
          arr.splice(Math.min(i, arr.length), 0, gone);
          drawRows(key);
          changed();
        });
      }
    });
    /* Enter ведёт по списку вниз, на последней строке заводит новую */
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
      var r = e.target.closest(".row-i");
      if (!r) return;
      e.preventDefault();
      var i = +r.dataset.i;
      if (i === S[key].length - 1) addRow(key);
      else focusRow(key, i + 1, '[data-k="' + e.target.getAttribute("data-k") + '"]');
    });
  }

  /* ---------- группа: чипы ролей, вставка списком ---------- */
  /* чипами — только частые роли, остальные подсказывает само поле роли */
  var CHIP_ROLES = ["Режиссёр", "Продюсер", "Оператор-постановщик", "Второй оператор", "Ассистент камеры",
    "Гафер", "Звукорежиссёр", "Гримёр", "Фотограф", "Ассистент"];
  $("chips").innerHTML = ROLES.map(function (r, i) {
    return CHIP_ROLES.indexOf(r[0]) < 0 ? "" : '<button type="button" class="chip" data-i="' + i + '">' + esc(r[0]) + "</button>";
  }).join("");
  $("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var c = S.crew;
    if (c.length === 1 && !c[0].who && !c[0].phone && (!c[0].role || c[0].role === "Оператор-постановщик") &&
        ROLES[+b.dataset.i][0] !== c[0].role) c.length = 0;
    addRow("crew", row("crew", { role: ROLES[+b.dataset.i][0] }), '[data-k="who"]');
  });

  /* «Гафер — Иван Петров — 8 916 123-45-67 — к 08:30»: порядок кусков любой */
  function parsePeople(text) {
    return text.split(/\n+/).map(function (line) {
      line = line.trim().replace(/^\d+[.)]\s*/, "").replace(/^[-•*]\s*/, "");
      if (!line) return null;
      var r = blank("crew"), m;
      if ((m = /\+?[78][\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/.exec(line))) {
        r.phone = fmtPhone(m[0]);
        line = line.replace(m[0], " ");
      }
      if ((m = /(^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/.exec(line))) {
        r.at = p2(+m[2]) + ":" + m[3];
        line = line.replace(m[0], m[1] + " ");
      }
      var parts = line.split(/\s*[—–\t;,|]\s*|\s+-\s+|:\s+/).map(function (x) {
        return x.replace(/^\s*(к|в|на)\s*$/i, "").trim();
      }).filter(Boolean);
      var ri = -1;
      parts.forEach(function (p, i) { if (ri < 0 && dept(p) !== "Группа") ri = i; });
      if (ri >= 0) r.role = parts.splice(ri, 1)[0];
      r.who = parts.shift() || "";
      if (!r.role && parts.length) r.role = parts.shift();
      if (r.role) r.role = r.role.charAt(0).toUpperCase() + r.role.slice(1);
      return r.who || r.role || r.phone ? r : null;
    }).filter(Boolean);
  }
  $("paste-go").addEventListener("click", function () {
    var rows = parsePeople(val("paste-text"));
    if (!rows.length) { toast("В тексте не нашлось ни одной строки с именем"); return; }
    var c = S.crew, before = snapshot();
    if (c.length === 1 && !c[0].who && !c[0].phone) c.length = 0;
    rows.forEach(function (r) { c.push(r); });
    $("paste-text").value = "";
    $("paste").open = false;
    drawRows("crew");
    changed();
    toast("В группу " + pl(rows.length, ["добавлен", "добавлено", "добавлено"]) + " " + rows.length + " " +
      pl(rows.length, ["человек", "человека", "человек"]), function () { restore(before); });
  });

  /* ---------- блоки по выбору ---------- */
  $("blocks").insertAdjacentHTML("beforeend", BLOCKS.filter(function (b) { return b[2]; }).map(function (b) {
    return '<section class="blk" id="blk-' + b[0] + '" hidden><label class="blk-h" for="t-' + b[0] + '">' + b[1] +
      '</label><textarea id="t-' + b[0] + '" data-txt="' + b[0] + '" placeholder="' + esc(b[2]) + '"></textarea></section>';
  }).join(""));
  $("block-chips").innerHTML = BLOCKS.map(function (b) {
    return '<button type="button" class="chip tog" data-b="' + b[0] + '" aria-pressed="false">' + b[1] + "</button>";
  }).join("");
  function drawBlocks() {
    BLOCKS.forEach(function (b) {
      var on = !!S.on[b[0]];
      $("blk-" + b[0]).hidden = !on;
      $("block-chips").querySelector('[data-b="' + b[0] + '"]').setAttribute("aria-pressed", on);
      if (b[2]) $("t-" + b[0]).value = S.txt[b[0]] || "";
    });
    var has = shotDraft().length > 0;
    $("btn-shots").hidden = !has;
    $("shots-none").hidden = has;
  }
  $("block-chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var id = b.dataset.b;
    S.on[id] = !S.on[id];
    drawBlocks();
    changed();
    if (S.on[id]) {
      var first = $("blk-" + id).querySelector("input, textarea");
      if (first) first.focus();
    }
  });
  $("blocks").addEventListener("input", function (e) {
    var id = e.target.getAttribute("data-txt");
    if (id) { S.txt[id] = e.target.value; changed(); }
  });

  /* сцены из шот-листа: его черновик лежит в том же браузере */
  function shotDraft() {
    var d;
    try { d = JSON.parse(localStorage.getItem(SHOTS)); } catch (e) { return []; }
    if (!d || !d.scenes) return [];
    return d.scenes.map(function (sc, i) {
      var shots = (sc.shots || []).filter(function (s) { return s.what; });
      if (!sc.name && !shots.length) return null;
      var min = 0;
      shots.forEach(function (s) { min += +s.min || +d.defmin || 0; });
      return row("scenes", { what: sc.name || "Сцена " + (i + 1),
        where: [sc.loc, sc.time].filter(Boolean).join(", "),
        note: shots.length + " " + pl(shots.length, ["кадр", "кадра", "кадров"]) + (min ? " · " + hm(min) : "") });
    }).filter(Boolean);
  }
  $("btn-shots").addEventListener("click", function () {
    var rows = shotDraft(), before = snapshot();
    if (!rows.length) return;
    S.scenes = rows;
    drawRows("scenes");
    changed();
    toast("Из шот-листа: " + rows.length + " " + pl(rows.length, ["сцена", "сцены", "сцен"]), function () { restore(before); });
  });

  /* ---------- лист ---------- */
  function line(label, html) { return '<div class="line"><b>' + esc(label) + "</b><span>" + html + "</span></div>"; }
  function table(cols, head, rows, cls) {
    return '<table class="items text' + (cls ? " " + cls : "") + '" data-cols="' + cols + '"><tr>' +
      head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>" +
      rows.map(function (r) {
        return typeof r === "string" ? r : "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
      }).join("") + "</table>";
  }
  function tel(phone) {
    if (!phone) return "—";
    var d = digits(phone);
    return d ? '<a href="tel:+' + d + '">' + esc(phone) + "</a>" : esc(phone);
  }
  function people(key) {
    return S[key].filter(function (p) { return p.who || p.phone || p.role || p.part; });
  }
  /* кто на связи в день съёмки: выбранный в списке либо первый, у кого есть телефон */
  function contact() {
    var crew = people("crew"), hit = null;
    crew.forEach(function (p) { if (!hit && S.contact && p.who === S.contact) hit = p; });
    crew.forEach(function (p) { if (!hit && p.who && p.phone) hit = p; });
    return hit;
  }

  function sunLines(s) {
    if (!s) return "<p>Укажите дату и город — посчитаю восход, закат и золотой час.</p>";
    if (s.sunrise === null || s.sunset === null) {
      return line("Свет", "в этот день солнце не восходит и не заходит (полярный день или ночь)");
    }
    var h = [line("Восход и закат", SUN.hhmm(s.sunrise) + " и " + SUN.hhmm(s.sunset) +
      ", светового дня " + hm(s.sunset - s.sunrise))];
    function pair(a, b) { return a !== null && b !== null ? SUN.hhmm(a) + "–" + SUN.hhmm(b) : "нет"; }
    h.push(line("Золотой час", "утром " + pair(s.goldenMorning[0], s.goldenMorning[1]) +
      ", вечером " + pair(s.goldenEvening[0], s.goldenEvening[1])));
    h.push(line("Синий час", "утром " + pair(s.blueMorning[0], s.blueMorning[1]) +
      ", вечером " + pair(s.blueEvening[0], s.blueEvening[1])));
    return h.join("");
  }
  /* предупреждения по свету — то, ради чего вызывной лист вообще считают */
  function lightNotes(s, k) {
    if (!s || s.sunset === null || s.sunrise === null) return [];
    var start = k.start || k.call, end = k.end, out = [];
    if (end && end.m <= 1440 && end.m > s.sunset) {
      out.push("Съёмка заканчивается через " + hm(end.m - s.sunset) +
        " после заката — последний блок снимаем со своим светом.");
    }
    if (start && start.m < s.sunrise) {
      out.push("Съёмка начинается за " + hm(s.sunrise - start.m) + " до восхода — на площадке ещё темно.");
    }
    var ge = s.goldenEvening;
    if (start && end && ge[0] !== null && ge[1] !== null && ge[0] >= start.m && ge[1] <= end.m) {
      out.push("Вечерний золотой час (" + SUN.hhmm(ge[0]) + "–" + SUN.hhmm(ge[1]) +
        ") попадает в смену — ставьте на него ключевые кадры.");
    }
    return out;
  }

  function render() {
    var s = sunOfDay(), k = keyTimes(), tl = k.tl, h = [];
    var hasSun = s && s.sunset !== null && s.sunrise !== null;
    h.push('<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>');
    h.push("<h2>ВЫЗЫВНОЙ ЛИСТ" + (val("f-day") ? " · СМЕНА " + esc(val("f-day")) : "") +
      (S.rev > 1 ? " · ВЕРСИЯ " + S.rev : "") + "</h2>");
    h.push('<p class="cs-proj" style="text-align:center">' + (val("f-proj") ? esc(val("f-proj")) : "Проект: " + BL) + "</p>");
    h.push('<table class="doc-meta"><tr><td>' + (val("f-city") ? esc(val("f-city")) : "Город: " + BL) +
      '</td><td style="text-align:right">' + (val("f-date") ? dateRu(val("f-date"), true) : "Дата: " + BL) +
      "</td></tr></table>");
    h.push(table("25,25,25,25", ["Общий сбор", "Начало съёмки", "Конец смены", hasSun ? "Закат" : "Смена"],
      [[k.call ? esc(k.call.t) : BL, k.start ? esc(k.start.t) : "—", k.end ? esc(k.end.t) : BL,
        hasSun ? SUN.hhmm(s.sunset) : (k.call && k.end ? hm(k.end.m - k.call.m) : "—")]], "cs-facts"));

    var c = contact(), top = [];
    if (val("f-client")) top.push("Заказчик: " + esc(val("f-client")) + ".");
    if (c) top.push("На связи в день съёмки: " + esc(c.who) + (c.role ? " (" + esc(c.role.toLowerCase()) + ")" : "") + ", " + tel(c.phone) + ".");
    if (top.length) h.push("<p>" + top.join(" ") + "</p>");
    if (val("f-notes")) h.push("<h3>Важное</h3><p>" + esc(val("f-notes")).replace(/\n/g, "<br>") + "</p>");

    var locs = S.locs.filter(function (l) { return l.name || l.addr; });
    if (locs.length) {
      h.push("<h3>Локации</h3>" + table("6,26,52,16", ["№", "Локация", "Адрес и как попасть", "Снимаем с"],
        locs.map(function (l, i) {
          return [i + 1, bl(l.name), (l.addr ? esc(l.addr) + ' · <a href="' + esc(mapUrl(l.addr)) +
            '" target="_blank" rel="noopener">карта</a>' : BL) + (l.how ? "<br>" + esc(l.how) : ""),
            l.time ? esc(l.time) : "—"];
        })));
    }

    h.push("<h3>Расписание</h3>");
    if (!tl.length) h.push("<p>Поставьте время хотя бы у сбора — расписание появится здесь.</p>");
    else {
      h.push(table("16,62,22", ["Время", "Что происходит", "Сколько"], tl.map(function (r, i) {
        return [esc(r.t), bl(r.what), i < tl.length - 1 ? hm(tl[i + 1].m - r.m) : "—"];
      })));
      if (k.call && k.end) h.push(line("Смена целиком", hm(k.end.m - k.call.m) + ", от сбора до конца"));
    }

    var crew = people("crew"), ph = !S.noPhones;
    if (crew.length) {
      var head = ph ? ["Роль", "Кто", "Телефон", "Вызов"] : ["Роль", "Кто", "Вызов"];
      var cells = function (p) {
        var r = [bl(p.role), bl(p.who), p.at ? esc(p.at) : (k.call ? esc(k.call.t) : "—")];
        if (ph) r.splice(2, 0, tel(p.phone));
        return r;
      };
      var rows = [];
      if (crew.length >= 7) {            /* большая группа читается по цехам */
        DEPTS.forEach(function (d) {
          var mine = crew.filter(function (p) { return dept(p.role) === d; });
          if (!mine.length) return;
          rows.push('<tr class="grp"><th colspan="' + head.length + '">' + d + "</th></tr>");
          mine.forEach(function (p) { rows.push(cells(p)); });
        });
      } else rows = crew.map(cells);
      h.push("<h3>Группа</h3>" + table(ph ? "27,30,27,16" : "38,44,18", head, rows));
    }

    var cast = S.on.cast ? people("cast") : [];
    if (cast.length) {
      var ch = ph ? ["Кто", "В кадре как", "Телефон", "Вызов", "В кадре"] : ["Кто", "В кадре как", "Вызов", "В кадре"];
      h.push("<h3>В кадре</h3>" + table(ph ? "24,24,24,14,14" : "34,34,16,16", ch, cast.map(function (p) {
        var r = [bl(p.who), p.part ? esc(p.part) : "—", p.at ? esc(p.at) : "—", p.ready ? esc(p.ready) : "—"];
        if (ph) r.splice(2, 0, tel(p.phone));
        return r;
      })));
    }

    var scenes = S.on.scenes ? S.scenes.filter(function (x) { return x.what; }) : [];
    if (scenes.length) {
      h.push("<h3>Что снимаем</h3>" + table("6,44,28,22", ["№", "Сцена или блок", "Где и когда", "Объём"],
        scenes.map(function (x, i) { return [i + 1, esc(x.what), x.where ? esc(x.where) : "—", x.note ? esc(x.note) : "—"]; })));
    }

    h.push("<h3>Свет</h3>" + sunLines(s));
    var notes = lightNotes(s, k);
    if (notes.length) h.push("<p>" + notes.map(esc).join(" ") + "</p>");
    if (val("f-wx")) h.push(line("Погода", esc(val("f-wx"))));

    if (S.on.safety) {
      h.push("<h3>Безопасность</h3>" + line("Экстренные службы", '<a href="tel:112">112</a>, с любого телефона'));
      if (val("f-hosp") || val("f-hospaddr") || val("f-hosptel")) {
        h.push(line("Ближайшая помощь", [val("f-hosp") ? esc(val("f-hosp")) : "",
          val("f-hospaddr") ? esc(val("f-hospaddr")) + ' · <a href="' + esc(mapUrl(val("f-hospaddr"))) +
            '" target="_blank" rel="noopener">карта</a>' : "",
          val("f-hosptel") ? tel(val("f-hosptel")) : ""].filter(Boolean).join(", ")));
      }
    }
    BLOCKS.forEach(function (b) {
      if (b[2] && S.on[b[0]] && S.txt[b[0]]) {
        h.push("<h3>" + b[1] + "</h3><p>" + esc(S.txt[b[0]]).replace(/\n/g, "<br>") + "</p>");
      }
    });

    h.push('<p class="doc-note">' + (hasSun ? "Восход, закат и золотой час посчитаны по формулам NOAA для указанных координат — точность около минуты. " : "") +
      "Собрано в конструкторе pobubnim.ru.</p>");
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");

    drawSunBar(s, k);
    drawReady(s, k);
    drawSide(s, k);
  }

  /* полоса светового дня в панели: световой день, золотой и синий час, смена и её точки */
  function drawSunBar(s, k) {
    var box = $("sunbar"), track = box.querySelector(".track");
    var pos = function (m) { return Math.max(0, Math.min(1440, m)) / 14.4; };
    var seg = function (a, b, cls) {
      if (a === null || b === null || b <= a) return "";
      return '<i class="' + cls + '" style="left:' + pos(a) + "%;width:" + (pos(b) - pos(a)) + '%"></i>';
    };
    var html = "", top = "", text;
    var shift = k.call && k.end ? " · смена " + k.call.t + "–" + k.end.t + " (" + hm(k.end.m - k.call.m) + ")" : "";
    if (s && s.sunrise !== null && s.sunset !== null) {
      html = seg(s.sunrise, s.sunset, "day") + seg(s.blueMorning[0], s.blueMorning[1], "blue") +
        seg(s.goldenMorning[0], s.goldenMorning[1], "gold") + seg(s.goldenEvening[0], s.goldenEvening[1], "gold") +
        seg(s.blueEvening[0], s.blueEvening[1], "blue");
      top = '<span style="left:' + pos(s.sunrise) + '%">↑ ' + SUN.hhmm(s.sunrise) + "</span>" +
        '<span style="left:' + pos(s.sunset) + '%">↓ ' + SUN.hhmm(s.sunset) + "</span>";
      text = "Световой день <b>" + SUN.hhmm(s.sunrise) + "–" + SUN.hhmm(s.sunset) + "</b> (" + hm(s.sunset - s.sunrise) + ")" +
        (s.goldenEvening[0] !== null && s.goldenEvening[1] !== null ? " · золотой час вечером <b>" +
          SUN.hhmm(s.goldenEvening[0]) + "–" + SUN.hhmm(s.goldenEvening[1]) + "</b>" : "") + shift;
    } else {
      text = (s ? "В этот день на этой широте солнце не восходит и не заходит."
        : "Укажите дату и город — покажу световой день и золотой час.") + shift;
    }
    if (k.call && k.end) html += seg(k.call.m, k.end.m, "shift");
    k.tl.forEach(function (r) { if (r.m <= 1440) html += '<i class="tick" style="left:' + pos(r.m) + '%"></i>'; });
    track.innerHTML = html;
    track.setAttribute("aria-label", text.replace(/<[^>]+>/g, ""));
    box.querySelector(".sb-top").innerHTML = top;
    box.querySelector(".stext").innerHTML = text;
  }

  /* ---------- готовность листа: чего не хватает и что настораживает ---------- */
  function checks(s, k) {
    var crew = people("crew"), named = crew.filter(function (p) { return p.who; });
    var nophone = named.filter(function (p) { return !p.phone; }).length;
    var locs = S.locs.filter(function (l) { return l.addr; });
    return [
      [!!val("f-proj"), "название проекта", "#f-proj"],
      [!!val("f-date"), "дата съёмки", "#f-date"],
      [!!k.call, "время сбора", '#sched [data-k="t"]'],
      [!!k.end, "конец смены", "#sched .row-i:last-child [data-k=\"t\"]"],
      [locs.length > 0, "адрес локации", '#locs [data-k="addr"]'],
      [named.length > 0, "люди в группе", '#crew [data-k="who"]'],
      [named.length > 0 && !nophone, nophone ? "телефон у " + nophone + " " + pl(nophone, ["человека", "человек", "человек"]) : "телефоны группы",
        "#crew .row-i" + (nophone ? ":nth-child(" + (S.crew.indexOf(named.filter(function (p) { return !p.phone; })[0]) + 1) + ")" : "") + ' [data-k="phone"]'],
      [!!s, "город для расчёта света", "#f-city"]
    ];
  }
  function warnings(s, k) {
    var w = [];
    if (k.tl.messy) w.push(["Расписание идёт не по порядку времени.", "sort"]);
    if (k.call && k.end && k.end.m - k.call.m > 720) {
      w.push(["Смена длится " + hm(k.end.m - k.call.m) + " — о переработке лучше договориться заранее."]);
    }
    if (k.call && k.lunch && k.lunch.m - k.call.m > 360) {
      w.push(["Обед через " + hm(k.lunch.m - k.call.m) + " после сбора. В голливудских профсоюзных правилах его ставят не позже шестого часа смены."]);
    }
    var d = dateParts(val("f-date"));
    if (d && k.call && S.rev === 0 && people("crew").length > 1) {
      var callAt = new Date(d.y, d.m - 1, d.d, 0, k.call.m), left = (callAt - new Date()) / 36e5;
      if (left > 0 && left < 12) w.push(["До сбора меньше двенадцати часов, а лист ещё не отмечен как разосланный."]);
    }
    return w;
  }
  function drawReady(s, k) {
    var ch = checks(s, k), ok = ch.filter(function (c) { return c[0]; }).length;
    var miss = ch.filter(function (c) { return !c[0]; });
    $("ready-n").textContent = miss.length ? "Готово " + ok + " из " + ch.length : "Лист готов — можно рассылать";
    $("ready").classList.toggle("done", !miss.length);
    $("ready-fill").style.transform = "scaleX(" + ok / ch.length + ")";
    $("ready-miss").innerHTML = miss.length ? '<span class="lbl">Не хватает:</span>' + miss.map(function (c) {
      return '<button type="button" class="miss" data-sel="' + esc(c[2]) + '">' + esc(c[1]) + "</button>";
    }).join("") : "";
    $("ready-warn").innerHTML = warnings(s, k).map(function (w) {
      return '<p class="hint warn">' + esc(w[0]) + (w[1] === "sort" ? ' <button type="button" class="lnk" id="btn-sort">Расставить по времени</button>' : "") + "</p>";
    }).join("");
    var mb = $("mbar-n");
    if (mb) mb.textContent = miss.length ? ok + " из " + ch.length : "Готов";
  }
  $("ready").addEventListener("click", function (e) {
    var b = e.target.closest(".miss");
    if (b) {
      var el = document.querySelector(b.dataset.sel);
      if (!el) return;
      var det = el.closest("details");
      if (det) det.open = true;
      el.scrollIntoView({ block: "center" });
      el.focus();
      return;
    }
    if (e.target.id === "btn-sort") {
      var withT = S.sched.filter(function (r) { return mins(r.t) !== null; });
      var rest = S.sched.filter(function (r) { return mins(r.t) === null; });
      withT.sort(function (a, b) { return mins(a.t) - mins(b.t); });
      S.sched = withT.concat(rest);
      drawRows("sched");
      changed();
    }
  });

  /* всё, что вокруг листа и формы, но зависит от состояния */
  function drawSide(s, k) {
    var lat = num("f-lat"), lng = num("f-lng"), tz = num("f-tz");
    var has = !isNaN(lat) && !isNaN(lng);
    $("geo-sum").textContent = has ? "Координаты " + lat + ", " + lng + " · UTC" + (tz >= 0 ? "+" : "") + (isNaN(tz) ? 3 : tz) + " — изменить"
      : "Города нет в списке? Впишите координаты";
    var wx = $("wx-link");
    wx.hidden = !has;
    if (has) wx.href = "https://yandex.ru/pogoda/?lat=" + lat + "&lon=" + lng;
    /* сдвиг: с какой строки двигать */
    var sel = $("shift-from"), cur = sel.value;
    sel.innerHTML = '<option value="0">всю смену</option>' + k.tl.slice(1).map(function (r) {
      return '<option value="' + r.i + '">с ' + esc(r.t) + " " + esc(r.what || "") + "</option>";
    }).join("");
    sel.value = [].some.call(sel.options, function (o) { return o.value === cur; }) ? cur : "0";
    $("shift").hidden = !k.tl.length;
    /* кто на связи */
    var named = people("crew").filter(function (p) { return p.who; });
    var cs = $("f-contact");
    cs.innerHTML = '<option value="">первый в списке с телефоном</option>' + named.map(function (p) {
      return '<option value="' + esc(p.who) + '">' + esc(p.who) + (p.role ? " — " + esc(p.role) : "") + "</option>";
    }).join("");
    cs.value = named.some(function (p) { return p.who === S.contact; }) ? S.contact : "";
    $("contact-box").hidden = named.length < 2;
    $("starter").hidden = !isEmpty();
    $("f-nophones").checked = !!S.noPhones;
  }
  function isEmpty() {
    return !val("f-proj") && !val("f-date") && !timeline().length &&
      !S.locs.some(function (l) { return l.name || l.addr; }) && !people("crew").some(function (p) { return p.who; });
  }

  /* ---------- сдвиг смены: всё время в листе уезжает разом ---------- */
  function shiftAll(delta, from) {
    var edge = from ? mins(S.sched[from].t) : -1;
    function move(obj, key) {
      var m = mins(obj[key]);
      if (m !== null && m >= edge) obj[key] = fromMins(m + delta);
    }
    S.sched.forEach(function (r, i) { if (i >= from && mins(r.t) !== null) r.t = fromMins(mins(r.t) + delta); });
    S.locs.forEach(function (l) { move(l, "time"); });
    S.crew.forEach(function (p) { move(p, "at"); });
    S.cast.forEach(function (p) { move(p, "at"); move(p, "ready"); });
    drawAll();
    changed();
  }
  $("shift").addEventListener("click", function (e) {
    var b = e.target.closest("[data-d]");
    if (b) shiftAll(+b.dataset.d, +$("shift-from").value || 0);
  });

  /* ---------- заготовки и пример ---------- */
  $("presets").innerHTML = PRESETS.map(function (p, i) {
    return '<button type="button" class="chip" data-i="' + i + '">' + p[0] + "</button>";
  }).join("");
  $("presets").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var p = PRESETS[+b.dataset.i], k = keyTimes(), base = k.call ? k.call.m : 480, before = snapshot();
    S.sched = p[1].map(function (r) { return row("sched", { t: fromMins(base + r[0]), what: r[1] }); });
    drawRows("sched");
    changed();
    toast("Заготовка «" + p[0] + "» от " + fromMins(base) + " — время правится", function () { restore(before); });
  });

  function example() {
    var d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));      /* ближайшая суббота */
    var e = fresh();
    e.proj = "Рекламный ролик кофейни «Зерно»"; e.date = isoOf(d); e.day = "1 из 2"; e.city = "Москва";
    e.client = "ООО «Зерно»"; e.wx = "+9…+14, без осадков, ветер 3 м/с";
    e.notes = "Форма одежды тёмная, обувь удобная. Кофейня работает до 08:30 — заходим со служебного входа.";
    e.sched = [["07:00", "Сбор группы"], ["07:30", "Подготовка площадки, свет"], ["08:30", "Грим и костюм"],
      ["09:00", "Начало съёмки: бариста и детали"], ["13:00", "Обед"], ["14:00", "Гости и общий план зала"],
      ["17:00", "Вечерний свет с улицы"], ["18:30", "Стоп, сбор техники"], ["19:00", "Конец смены"]]
      .map(function (r) { return row("sched", { t: r[0], what: r[1] }); });
    e.locs = [row("locs", { name: "Кофейня «Зерно»", addr: "ул. Покровка, 21", time: "09:00",
      how: "Служебный вход со двора, парковка на Покровке платная" })];
    e.crew = [["Режиссёр", "Анна Белова", "+7 900 000-00-01", ""], ["Продюсер", "Мария Соколова", "+7 900 000-00-02", ""],
      ["Оператор-постановщик", "Савелий Бубнов", "+7 900 000-00-03", ""], ["Гафер", "Игорь Лапин", "+7 900 000-00-04", "07:00"],
      ["Звукорежиссёр", "Олег Жуков", "+7 900 000-00-05", "08:30"], ["Гримёр", "Дарья Ким", "+7 900 000-00-06", "08:15"]]
      .map(function (r) { return row("crew", { role: r[0], who: r[1], phone: r[2], at: r[3] }); });
    e.contact = "Мария Соколова";
    e.on = { cast: true, safety: true, food: true };
    e.cast = [row("cast", { who: "Тимур Асланов", part: "бариста", phone: "+7 900 000-00-07", at: "08:30", ready: "09:00" })];
    e.txt = { food: "Обед в 13:00 в зале кофейни на семь человек. Вода и кофе с утра." };
    e.hosp = "Травмпункт ГКБ № 1"; e.hospaddr = "Ленинский проспект, 8";
    return e;
  }

  /* ---------- состояние: снимок, возврат, черновик ---------- */
  var STATE_KEYS = ["sched", "locs", "crew", "cast", "scenes", "on", "txt", "contact", "noPhones", "rev", "snap", "sentAt"];
  function snapshot() {
    var d = { v: 2 };
    FIELDS.forEach(function (k) { d[k] = val("f-" + k); });
    STATE_KEYS.forEach(function (k) { d[k] = S[k]; });
    return JSON.parse(JSON.stringify(d));
  }
  /* лист первой версии: пять фиксированных времён становятся строками расписания */
  function migrate(d) {
    if (d.v === 2) return d;
    d.sched = [["call", "Сбор группы"], ["go", "Выезд"], ["start", "Начало съёмки"], ["lunch", "Обед"], ["end", "Конец смены"]]
      .filter(function (r) { return d[r[0]]; })
      .map(function (r) { return { t: d[r[0]], what: r[1] }; });
    if (!d.sched.length) delete d.sched;
    d.v = 2;
    return d;
  }
  function restore(d) {
    var f = fresh();
    FIELDS.forEach(function (k) { if ($("f-" + k)) $("f-" + k).value = d[k] || ""; });
    STATE_KEYS.forEach(function (k) { S[k] = d[k] === undefined || d[k] === null && k !== "snap" ? f[k] : d[k]; });
    LISTS.forEach(function (k) {
      if (!S[k] || !S[k].length) S[k] = f[k];
      S[k] = S[k].map(function (r) { return row(k, r); });
    });
    if (!val("f-lat")) applyCity();
    drawAll();
    drawBlocks();
    changed();
  }
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* приватный режим */ }
      remember();
    }, 400);
  }
  var listeners = [];
  function changed() {
    render();
    save();
    listeners.forEach(function (fn) { fn(); });
  }

  $("btn-clear").addEventListener("click", function () {
    var before = snapshot(), was = !isEmpty();
    restore({ v: 2, city: "Москва" });
    $("draft-note").hidden = true;
    clearTimeout(timer);                       /* иначе отложенный save вернёт черновик */
    try { localStorage.removeItem(KEY); } catch (e) { /* нечего чистить */ }
    if (was) toast("Лист очищен", function () { restore(before); });
  });
  $("btn-example").addEventListener("click", function () {
    var before = snapshot(), was = !isEmpty();
    restore(example());
    toast("Это пример — замените данные своими", was ? function () { restore(before); } : function () { restore({ v: 2, city: "Москва" }); });
  });
  /* та же группа и те же локации на следующий день */
  $("btn-next").addEventListener("click", function () {
    var before = snapshot(), d = snapshot(), p = dateParts(d.date);
    if (p) d.date = isoOf(new Date(p.y, p.m - 1, p.d + 1));
    d.day = d.day.replace(/^\s*(\d+)/, function (m, n) { return +n + 1; });
    d.rev = 0; d.snap = null; d.sentAt = "";
    d.crew.concat(d.cast).forEach(function (x) { x.st = ""; });
    restore(d);
    toast("Следующая смена: группа и локации те же, дата сдвинута на день", function () { restore(before); });
  });

  form.addEventListener("input", function (e) {
    if (e.target.closest(".rows, #blocks textarea")) return;       /* строки и блоки пишут в состояние сами */
    if (e.target.id === "f-city") applyCity();
    if (e.target.id === "f-lat") {                                  /* «55.75, 37.61» из карт — в оба поля */
      var m = /^\s*(-?\d+[.,]\d+)[,;\s]+(-?\d+[.,]\d+)\s*$/.exec(e.target.value);
      if (m) { $("f-lat").value = m[1].replace(",", "."); $("f-lng").value = m[2].replace(",", "."); }
    }
    if (e.target.id === "f-contact") S.contact = e.target.value;
    if (e.target.id === "paste-text" || e.target.id === "shift-from") return;
    changed();
  });
  form.addEventListener("change", function (e) {
    if (e.target.id === "f-hosptel") { e.target.value = fmtPhone(e.target.value); changed(); }
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  $("f-nophones").addEventListener("change", function () { S.noPhones = this.checked; changed(); });
  $("add-sched").addEventListener("click", function () { addRow("sched"); });
  $("add-loc").addEventListener("click", function () { addRow("locs"); });
  $("add-crew").addEventListener("click", function () { addRow("crew"); });
  $("add-cast").addEventListener("click", function () { addRow("cast"); });
  $("add-scene").addEventListener("click", function () { addRow("scenes"); });
  $("btn-geo").addEventListener("click", function () {
    if (!navigator.geolocation) { toast("Браузер не умеет определять место — впишите координаты"); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      $("f-lat").value = pos.coords.latitude.toFixed(4);
      $("f-lng").value = pos.coords.longitude.toFixed(4);
      $("f-tz").value = -new Date().getTimezoneOffset() / 60;
      changed();
    }, function () { toast("Браузер не дал геолокацию — впишите координаты вручную"); });
  });
  $("btn-forget").addEventListener("click", function () {
    try { localStorage.removeItem(PEOPLE); } catch (e) { /* нечего чистить */ }
    loadBook();
    toast("Сохранённые имена и телефоны стёрты из браузера");
  });
  $("btn-doc").addEventListener("click", function () { PobubnimDocx.download(paper, "vyzyvnoj-list-pobubnim.docx"); });
  $("btn-print").addEventListener("click", function () { window.print(); });

  /* ---------- старт ---------- */
  LISTS.forEach(bindRows);
  loadBook();
  var raw = null, saved = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* приватный режим */ }
  try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
  if (saved) {
    restore(migrate(saved));
    $("draft-note").hidden = false;
  } else {
    restore({ v: 2, city: val("f-city") || "Москва" });
    clearTimeout(timer);                       /* пустой лист в хранилище не кладём */
  }

  window.PobubnimCallsheet = {
    sun: sunOfDay, key: keyTimes, state: function () { return S; }, snapshot: snapshot, restore: restore,
    people: people, contact: contact, parsePeople: parsePeople, checks: function () { return checks(sunOfDay(), keyTimes()); },
    lightNotes: function () { return lightNotes(sunOfDay(), keyTimes()); },
    val: val, hm: hm, pl: pl, p2: p2, esc: esc, digits: digits, mapUrl: mapUrl, dateRu: dateRu, dateParts: dateParts,
    blocks: BLOCKS, changed: changed, toast: toast, onChange: function (fn) { listeners.push(fn); }
  };
})();
