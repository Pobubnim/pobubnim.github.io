/* ПОБУБНИМ — вызывной лист (instrumenty/vyzyvnoj-list.html).
   День смены на одном листе: время, локации, контакты группы и СВЕТ —
   восход, закат и золотой час считаются по дате и координатам (sun.js,
   формулы NOAA; канон — docs/EDU_BASE.md §8з). Всё локально в браузере. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var locsEl = document.getElementById("locs");
  var crewEl = document.getElementById("crew");
  if (!form || !paper || !locsEl || !crewEl) return;

  var KEY = "pobubnim-callsheet-v1";
  var SUN = window.PobubnimSun;

  var ROLES = ["Режиссёр", "Оператор-постановщик", "Второй оператор", "Ассистент камеры",
    "Звукорежиссёр", "Гафер", "Осветитель", "Гримёр", "Стилист", "Продюсер",
    "Администратор", "Водитель", "Дрон-оператор", "Фотограф", "Ассистент"];

  var locs = [{ name: "", addr: "", time: "" }];
  var crew = [{ role: "Оператор-постановщик", who: "", phone: "", at: "" }];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function num(id, def) {
    var v = parseFloat(val(id));
    return isNaN(v) ? def : v;
  }
  /* «08:30» -> минуты от полуночи; пусто -> null */
  function mins(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function hm(total) {
    var h = Math.floor(total / 60), m = Math.round(total % 60);
    return (h ? h + " ч " : "") + (m || !h ? m + " мин" : "").trim();
  }

  /* ---------- город и солнце ---------- */
  var cityMap = {};
  SUN.CITIES.forEach(function (c) { cityMap[c[0].toLowerCase()] = c; });
  document.getElementById("dl-city").innerHTML = SUN.CITIES.map(function (c) {
    return "<option>" + esc(c[0]) + "</option>";
  }).join("");

  function applyCity() {
    var c = cityMap[val("f-city").trim().toLowerCase()];
    if (!c) return;
    document.getElementById("f-lat").value = c[1];
    document.getElementById("f-lng").value = c[2];
    document.getElementById("f-tz").value = c[3];
  }

  function sunOfDay() {
    var d = val("f-date");            /* YYYY-MM-DD из input type=date */
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return null;
    var lat = num("f-lat", NaN), lng = num("f-lng", NaN), tz = num("f-tz", 3);
    if (isNaN(lat) || isNaN(lng)) return null;
    return SUN.times(+m[1], +m[2], +m[3], lat, lng, tz);
  }

  /* ---------- строки ---------- */
  function rowBtns(cls) {
    return '<span class="rowbtns">' +
      '<button type="button" class="up" aria-label="Выше">↑</button>' +
      '<button type="button" class="down" aria-label="Ниже">↓</button>' +
      '<button type="button" class="del-row" aria-label="Удалить">✕</button></span>';
  }

  function drawLocs() {
    locsEl.innerHTML = locs.map(function (l, i) {
      return '<div class="row-i" data-i="' + i + '">' +
        '<span class="rn">' + (i + 1) + "</span>" +
        '<input class="l-name" type="text" value="' + esc(l.name) + '" placeholder="Локация: усадьба, студия, офис" aria-label="Локация">' +
        '<input class="l-addr" type="text" value="' + esc(l.addr) + '" placeholder="Адрес" aria-label="Адрес">' +
        '<input class="l-time" type="time" value="' + esc(l.time) + '" aria-label="Во сколько тут снимаем">' +
        rowBtns() + "</div>";
    }).join("");
  }

  function drawCrew() {
    crewEl.innerHTML = crew.map(function (c, i) {
      return '<div class="row-i" data-i="' + i + '">' +
        '<span class="rn">' + (i + 1) + "</span>" +
        '<input class="c-role" type="text" value="' + esc(c.role) + '" placeholder="Роль" list="dl-role" aria-label="Роль" autocomplete="off">' +
        '<input class="c-who" type="text" value="' + esc(c.who) + '" placeholder="Имя" aria-label="Имя">' +
        '<input class="c-phone" type="tel" value="' + esc(c.phone) + '" placeholder="Телефон" aria-label="Телефон">' +
        '<input class="c-at" type="time" value="' + esc(c.at) + '" aria-label="Во сколько прибыть">' +
        rowBtns() + "</div>";
    }).join("");
  }

  document.getElementById("dl-role").innerHTML = ROLES.map(function (r) {
    return "<option>" + esc(r) + "</option>";
  }).join("");
  document.getElementById("chips").innerHTML = ROLES.map(function (r, i) {
    return '<button type="button" class="chip" data-i="' + i + '">' + esc(r) + "</button>";
  }).join("");

  function readRows() {
    [].forEach.call(locsEl.querySelectorAll(".row-i"), function (el) {
      var l = locs[+el.dataset.i];
      l.name = el.querySelector(".l-name").value;
      l.addr = el.querySelector(".l-addr").value;
      l.time = el.querySelector(".l-time").value;
    });
    [].forEach.call(crewEl.querySelectorAll(".row-i"), function (el) {
      var c = crew[+el.dataset.i];
      c.role = el.querySelector(".c-role").value;
      c.who = el.querySelector(".c-who").value;
      c.phone = el.querySelector(".c-phone").value;
      c.at = el.querySelector(".c-at").value;
    });
  }

  function redraw() { drawLocs(); drawCrew(); render(); save(); }

  function listHandler(el, arr, blank, draw) {
    el.addEventListener("input", function () { readRows(); render(); save(); });
    el.addEventListener("change", function () { readRows(); render(); save(); });
    el.addEventListener("click", function (e) {
      var row = e.target.closest(".row-i");
      if (!row) return;
      var i = +row.dataset.i;
      if (e.target.closest(".up") || e.target.closest(".down")) {
        readRows();
        var j = i + (e.target.closest(".up") ? -1 : 1);
        if (j < 0 || j >= arr.length) return;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      } else if (e.target.closest(".del-row")) {
        readRows();
        arr.splice(i, 1);
        if (!arr.length) arr.push(blank());
      } else {
        return;
      }
      redraw();
    });
  }
  listHandler(locsEl, locs, function () { return { name: "", addr: "", time: "" }; }, drawLocs);
  listHandler(crewEl, crew, function () { return { role: "", who: "", phone: "", at: "" }; }, drawCrew);

  document.getElementById("add-loc").addEventListener("click", function () {
    readRows();
    locs.push({ name: "", addr: "", time: "" });
    redraw();
  });
  document.getElementById("add-crew").addEventListener("click", function () {
    readRows();
    crew.push({ role: "", who: "", phone: "", at: "" });
    redraw();
  });
  document.getElementById("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    readRows();
    if (crew.length === 1 && !crew[0].who && !crew[0].role) crew.length = 0;
    crew.push({ role: ROLES[+b.dataset.i], who: "", phone: "", at: "" });
    redraw();
  });

  /* ---------- лист ---------- */
  function line(label, text) {
    return '<div class="line"><b>' + esc(label) + "</b><span>" + text + "</span></div>";
  }

  function sunBlock(s) {
    if (!s) return "<p>Свет: укажите дату и город — посчитаю восход, закат и золотой час.</p>";
    var h = [];
    if (s.sunrise === null || s.sunset === null) {
      h.push(line("Свет", "в этот день солнце не восходит и не заходит (полярный день или ночь)"));
      return h.join("");
    }
    var day = s.sunset - s.sunrise;
    h.push(line("Восход и закат", SUN.hhmm(s.sunrise) + " и " + SUN.hhmm(s.sunset) +
      ", светового дня " + hm(day)));
    h.push(line("Золотой час", "утром " + SUN.hhmm(s.goldenMorning[0]) + "–" + SUN.hhmm(s.goldenMorning[1]) +
      ", вечером " + SUN.hhmm(s.goldenEvening[0]) + "–" + SUN.hhmm(s.goldenEvening[1])));
    h.push(line("Синий час", "утром " + SUN.hhmm(s.blueMorning[0]) + "–" + SUN.hhmm(s.blueMorning[1]) +
      ", вечером " + SUN.hhmm(s.blueEvening[0]) + "–" + SUN.hhmm(s.blueEvening[1])));
    return h.join("");
  }

  /* предупреждения по свету — то, ради чего вызывной лист вообще считают */
  function lightNotes(s) {
    if (!s || s.sunset === null) return "";
    var start = mins(val("f-start")), end = mins(val("f-end")), out = [];
    if (end !== null && end > s.sunset) {
      out.push("Съёмка заканчивается через " + hm(end - s.sunset) +
        " после заката — последний блок снимаем со своим светом.");
    }
    if (start !== null && start < s.sunrise) {
      out.push("Съёмка начинается за " + hm(s.sunrise - start) +
        " до восхода — на площадке ещё темно.");
    }
    var ge = s.goldenEvening;
    if (start !== null && end !== null && ge[0] !== null && ge[0] >= start && ge[1] <= end) {
      out.push("Вечерний золотой час (" + SUN.hhmm(ge[0]) + "–" + SUN.hhmm(ge[1]) +
        ") попадает в смену — ставьте на него ключевые кадры.");
    }
    return out.length ? "<p>" + out.map(esc).join(" ") + "</p>" : "";
  }

  function schedule() {
    var rows = [
      ["Сбор группы", val("f-call")],
      ["Выезд", val("f-go")],
      ["Начало съёмки", val("f-start")],
      ["Обед", val("f-lunch")],
      ["Планируемый конец", val("f-end")]
    ].filter(function (r) { return r[1]; });
    if (!rows.length) return "<p>Время смены пока не заполнено.</p>";
    return rows.map(function (r) { return line(r[0], esc(r[1])); }).join("");
  }

  function locsTable() {
    var rows = locs.filter(function (l) { return l.name || l.addr; });
    if (!rows.length) return "";
    var h = ['<table class="items text" data-cols="8,32,45,15">' +
      "<tr><th>№</th><th>Локация</th><th>Адрес</th><th>Время</th></tr>"];
    rows.forEach(function (l, i) {
      h.push("<tr><td>" + (i + 1) + "</td><td>" + bl(l.name) + "</td><td>" +
        bl(l.addr) + "</td><td>" + (l.time ? esc(l.time) : "—") + "</td></tr>");
    });
    return "<h4>Локации</h4>" + h.join("") + "</table>";
  }

  function crewTable() {
    var rows = crew.filter(function (c) { return c.role || c.who || c.phone; });
    if (!rows.length) return "";
    var h = ['<table class="items text" data-cols="8,30,30,20,12">' +
      "<tr><th>№</th><th>Роль</th><th>Кто</th><th>Телефон</th><th>К</th></tr>"];
    rows.forEach(function (c, i) {
      h.push("<tr><td>" + (i + 1) + "</td><td>" + bl(c.role) + "</td><td>" + bl(c.who) +
        "</td><td>" + (c.phone ? esc(c.phone) : "—") + "</td><td>" +
        (c.at ? esc(c.at) : "—") + "</td></tr>");
    });
    return "<h4>Группа</h4>" + h.join("") + "</table>";
  }

  function render() {
    var s = sunOfDay();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>ВЫЗЫВНОЙ ЛИСТ" + (val("f-day") ? " · СМЕНА " + esc(val("f-day")) : "") +
      (val("f-proj") ? " · " + esc(val("f-proj")) : ""));
    h.push("</h3>");
    h.push('<table class="doc-meta"><tr><td>' + (val("f-city") ? esc(val("f-city")) : "Город: " + BL) +
      '</td><td style="text-align:right">' + (val("f-date") ? dateRu(val("f-date")) : "Дата: " + BL) +
      "</td></tr></table>");
    if (val("f-client")) h.push("<p>Заказчик: " + esc(val("f-client")) + ".</p>");
    h.push("<h4>Расписание</h4>");
    h.push(schedule());
    h.push("<h4>Свет</h4>");
    h.push(sunBlock(s));
    h.push(lightNotes(s));
    h.push(locsTable());
    h.push(crewTable());
    if (val("f-notes")) h.push("<h4>Важное</h4><p>" + esc(val("f-notes")).replace(/\n/g, "<br>") + "</p>");
    h.push('<p class="doc-note">Восход, закат и золотой час посчитаны по формулам NOAA для указанных координат — точность около минуты. Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
    drawSunBar(s);
  }

  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
    "августа", "сентября", "октября", "ноября", "декабря"];
  function dateRu(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? +m[3] + " " + MONTHS[+m[2] - 1] + " " + m[1] + " г." : esc(iso);
  }

  /* полоса светового дня в панели: где смена, где золотой час */
  function drawSunBar(s) {
    var box = document.getElementById("sunbar");
    if (!s || s.sunrise === null) {
      box.querySelector(".stext").textContent = s
        ? "В этот день на этой широте солнце не восходит и не заходит."
        : "Укажите дату и город — покажу световой день и золотой час.";
      box.querySelector(".track").innerHTML = "";
      return;
    }
    var seg = function (from, to, cls) {
      var a = Math.max(0, Math.min(1440, from)), b = Math.max(0, Math.min(1440, to));
      return '<i class="' + cls + '" style="left:' + (a / 1440 * 100) + "%;width:" +
        ((b - a) / 1440 * 100) + '%"></i>';
    };
    var html = seg(s.sunrise, s.sunset, "day") +
      seg(s.goldenMorning[0], s.goldenMorning[1], "gold") +
      seg(s.goldenEvening[0], s.goldenEvening[1], "gold");
    var call = mins(val("f-call")), end = mins(val("f-end"));
    if (call !== null && end !== null && end > call) html += seg(call, end, "shift");
    box.querySelector(".track").innerHTML = html;
    box.querySelector(".stext").innerHTML = "Световой день <b>" + SUN.hhmm(s.sunrise) + "–" +
      SUN.hhmm(s.sunset) + "</b> (" + hm(s.sunset - s.sunrise) + ") · золотой час вечером <b>" +
      SUN.hhmm(s.goldenEvening[0]) + "–" + SUN.hhmm(s.goldenEvening[1]) + "</b>" +
      (call !== null && end !== null && end > call ? " · смена " + val("f-call") + "–" + val("f-end") : "");
  }

  /* ---------- черновик ---------- */
  var timer;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        var d = { locs: locs, crew: crew };
        ["proj", "date", "day", "city", "lat", "lng", "tz", "client",
         "call", "go", "start", "lunch", "end", "notes"].forEach(function (k) {
          d[k] = val("f-" + k);
        });
        localStorage.setItem(KEY, JSON.stringify(d));
      } catch (e) { /* приватный режим */ }
    }, 400);
  }
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    if (!raw) return;
    var d;
    try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d) return;
    ["proj", "date", "day", "city", "lat", "lng", "tz", "client",
     "call", "go", "start", "lunch", "end", "notes"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      if (el && d[k]) el.value = d[k];
    });
    if (d.locs && d.locs.length) locs = d.locs;
    if (d.crew && d.crew.length) crew = d.crew;
    document.getElementById("draft-note").hidden = false;
  }

  document.getElementById("btn-clear").addEventListener("click", function () {
    clearTimeout(timer);                       /* иначе отложенный save вернёт черновик */
    form.reset();
    locs = [{ name: "", addr: "", time: "" }];
    crew = [{ role: "Оператор-постановщик", who: "", phone: "", at: "" }];
    document.getElementById("draft-note").hidden = true;
    applyCity();
    drawLocs();
    drawCrew();
    render();
    try { localStorage.removeItem(KEY); } catch (e) { /* нечего чистить */ }
  });

  form.addEventListener("input", function (e) {
    if (e.target.id === "f-city") applyCity();
    render();
    save();
  });
  form.addEventListener("change", function (e) {
    if (e.target.id === "f-city") applyCity();
    render();
    save();
  });

  /* ---------- выгрузка ---------- */
  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this, txt = paper.innerText;
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done);
    else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  });
  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, "vyzyvnoj-list-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  load();
  if (!val("f-lat")) applyCity();
  redraw();

  window.PobubnimCallsheet = { sun: sunOfDay, state: function () { return { locs: locs, crew: crew }; } };
})();
