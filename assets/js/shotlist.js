/* ПОБУБНИМ — шот-лист (instrumenty/shot-list.html).
   План кадров: сцены → кадры (крупность, ракурс, движение, оптика, минуты).
   Считает, влезает ли план в смену по МИНУТАМ ПОЛЬЗОВАТЕЛЯ (нормативов нет —
   EDU_BASE §8ж). Черновик живёт в localStorage, наружу ничего не уходит. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var scenesEl = document.getElementById("scenes");
  if (!form || !paper || !scenesEl) return;

  var KEY = "pobubnim-shotlist-v1";

  /* номенклатура — EDU_BASE §8ж; списки открытые: рядом с каждым полем
     свой datalist, но написать можно что угодно своё */
  var SIZES = ["дальний (ELS)", "общий (WS)", "средний общий (MLS)", "средний (MS)",
    "грудной (MCU)", "крупный (CU)", "деталь (ECU)", "два в кадре", "через плечо (OTS)"];
  var ANGLES = ["с уровня глаз", "с уровня пояса", "сверху", "сверху вниз (топ-даун)",
    "снизу", "от земли", "через плечо", "через предмет", "от первого лица", "«голландский»"];
  var MOVES = ["статика", "панорама", "наклон", "проезд", "слайдер", "стедикам", "с рук",
    "кран", "зум", "пуш-ин", "отъезд", "проводка", "облёт", "дрон", "таймлапс", "гиперлапс"];
  var TIMES = ["утро", "день", "вечер", "ночь", "золотой час", "синий час", "рассвет", "закат"];

  /* пресеты кадров по типу съёмки: [что в кадре, крупность, движение, примечание] */
  var PRESETS = {
    svadba: [
      ["Детали: кольца, платье, туфли", "деталь (ECU)", "слайдер", ""],
      ["Приглашение и мелочи у окна", "деталь (ECU)", "статика", ""],
      ["Сборы невесты", "средний (MS)", "с рук", "мягкий свет из окна"],
      ["Руки: застёжка платья, серьги", "крупный (CU)", "статика", ""],
      ["Сборы жениха: галстук, часы", "средний (MS)", "с рук", ""],
      ["Первый взгляд", "крупный (CU)", "стедикам", "две камеры: он и она"],
      ["Проход к церемонии", "общий (WS)", "стедикам", ""],
      ["Клятвы: крупный жениха и невесты", "крупный (CU)", "статика", "звук: петличка на женихе"],
      ["Обмен кольцами", "деталь (ECU)", "статика", ""],
      ["Реакции гостей", "грудной (MCU)", "с рук", ""],
      ["Поздравления и объятия", "средний (MS)", "с рук", ""],
      ["Прогулка: проход пары", "общий (WS)", "стедикам", "золотой час"],
      ["Портрет пары", "грудной (MCU)", "статика", ""],
      ["Первый танец", "общий (WS)", "стедикам", ""],
      ["Тосты, речь родителей", "средний (MS)", "статика", "звук: рекордер у микрофона"],
      ["Торт и финал вечера", "средний (MS)", "с рук", ""]
    ],
    interv: [
      ["Герой отвечает, основной ракурс", "грудной (MCU)", "статика", "звук: петличка + пушка"],
      ["Второй ракурс, чуть сбоку", "средний (MS)", "статика", "вторая камера"],
      ["Крупный: глаза на ключевой фразе", "крупный (CU)", "статика", ""],
      ["Руки героя, жест", "деталь (ECU)", "статика", ""],
      ["Проход героя к месту", "общий (WS)", "с рук", ""],
      ["Герой за работой", "средний (MS)", "через плечо", ""],
      ["Перебивка: рабочий процесс", "средний (MS)", "с рук", ""],
      ["Перебивка: детали рабочего места", "деталь (ECU)", "слайдер", ""],
      ["Общий помещения", "общий (WS)", "панорама", ""],
      ["Финал: герой смотрит в кадр", "грудной (MCU)", "статика", ""]
    ],
    reklama: [
      ["Продукт на столе", "деталь (ECU)", "слайдер", "контровой свет"],
      ["Продукт на подставке, облёт", "деталь (ECU)", "облёт", ""],
      ["Руки берут продукт", "крупный (CU)", "статика", ""],
      ["Распаковка", "крупный (CU)", "статика", ""],
      ["Герой пользуется продуктом", "средний (MS)", "проезд", ""],
      ["Реакция героя", "крупный (CU)", "статика", ""],
      ["Общий пространства", "общий (WS)", "статика", ""],
      ["Проход по залу", "средний (MS)", "стедикам", ""],
      ["Деталь: фактура, материал", "деталь (ECU)", "пуш-ин", ""],
      ["Продукт в руках на фоне", "средний (MS)", "статика", ""],
      ["Финал: логотип, упаковка", "деталь (ECU)", "статика", ""],
      ["Кадр под титры", "общий (WS)", "статика", "оставить место под текст"]
    ],
    klip: [
      ["Проход артиста", "общий (WS)", "стедикам", ""],
      ["Липсинк, крупный", "крупный (CU)", "с рук", "плейбек с колонки"],
      ["Липсинк, общий", "общий (WS)", "проводка", ""],
      ["Деталь: гитара, микрофон", "деталь (ECU)", "статика", ""],
      ["Танцевальный общий", "дальний (ELS)", "кран", ""],
      ["Проезд мимо героя", "средний (MS)", "проезд", ""],
      ["Портрет на контровом свете", "грудной (MCU)", "статика", ""],
      ["Локация без героя, атмосфера", "общий (WS)", "панорама", ""],
      ["Пуш-ин на припеве", "крупный (CU)", "пуш-ин", ""],
      ["Финал: уход из кадра", "общий (WS)", "статика", ""]
    ],
    meropr: [
      ["Общий зала до начала", "общий (WS)", "панорама", ""],
      ["Регистрация гостей", "средний (MS)", "с рук", ""],
      ["Спикер на сцене", "средний (MS)", "статика", "звук: пульт или рекордер"],
      ["Крупный спикера", "крупный (CU)", "статика", "вторая камера"],
      ["Презентация на экране", "общий (WS)", "статика", ""],
      ["Реакции зала", "грудной (MCU)", "с рук", ""],
      ["Вопросы из зала", "средний (MS)", "с рук", "микрофон в кадре"],
      ["Детали оформления, брендинг", "деталь (ECU)", "слайдер", ""],
      ["Нетворкинг в холле", "средний (MS)", "с рук", ""],
      ["Кофе-брейк, атмосфера", "деталь (ECU)", "с рук", ""],
      ["Награждение, аплодисменты", "общий (WS)", "статика", ""],
      ["Синхроны участников", "грудной (MCU)", "статика", "звук: петличка"]
    ],
    predm: [
      ["Продукт целиком на фоне", "средний (MS)", "статика", "свет: софтбокс сверху"],
      ["Облёт вокруг продукта", "деталь (ECU)", "облёт", ""],
      ["Фактура крупно", "деталь (ECU)", "пуш-ин", ""],
      ["Открытие крышки, механика", "крупный (CU)", "статика", ""],
      ["Продукт в работе", "крупный (CU)", "слайдер", ""],
      ["Наливание, пар, брызги", "деталь (ECU)", "статика", "высокая частота кадров"],
      ["Композиция с реквизитом", "средний (MS)", "статика", ""],
      ["Тень и блик, атмосфера", "деталь (ECU)", "проезд", ""],
      ["Раскладка сверху", "общий (WS)", "сверху вниз (топ-даун)", ""],
      ["Финал: упаковка и логотип", "деталь (ECU)", "статика", ""]
    ],
    vlog: [
      ["Приветствие в камеру", "грудной (MCU)", "статика", "звук: петличка"],
      ["Проход по локации", "средний (MS)", "с рук", ""],
      ["Общий: где мы находимся", "общий (WS)", "панорама", ""],
      ["Процесс: руки, работа", "крупный (CU)", "с рук", ""],
      ["Детали места", "деталь (ECU)", "слайдер", ""],
      ["Разговор с героем", "средний (MS)", "с рук", "второй микрофон"],
      ["Бэкстейдж: команда на площадке", "общий (WS)", "с рук", ""],
      ["Таймлапс подготовки", "общий (WS)", "таймлапс", "штатив"],
      ["Реакция, эмоция", "крупный (CU)", "с рук", ""],
      ["Финал: уход, подводка к следующему", "средний (MS)", "с рук", ""]
    ]
  };

  function blankShot(p) {
    return { what: p ? p[0] : "", size: p ? p[1] : "", angle: "", move: p ? p[2] : "",
      lens: "", min: "", note: p ? p[3] : "" };
  }
  function blankScene() {
    return { name: "", loc: "", time: "день", shots: [blankShot()] };
  }

  var scenes = [blankScene()];

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
  function kind() {
    var el = form.querySelector('input[name="kind"]:checked');
    return el ? el.value : "svadba";
  }

  /* ---------- левая панель ---------- */
  function dl(list, id) {
    return '<datalist id="' + id + '">' + list.map(function (o) {
      return "<option>" + esc(o) + "</option>";
    }).join("") + "</datalist>";
  }
  /* списки-подсказки общие на страницу: значение выбирается или пишется своё */
  document.getElementById("datalists").innerHTML =
    dl(SIZES, "dl-size") + dl(ANGLES, "dl-angle") + dl(MOVES, "dl-move") + dl(TIMES, "dl-time");

  function field(cls, val, ph, list, aria) {
    return '<input class="' + cls + '" type="text" value="' + esc(val) + '" placeholder="' + ph +
      '" list="' + list + '" aria-label="' + aria + '" autocomplete="off">';
  }

  function drawScenes() {
    scenesEl.innerHTML = scenes.map(function (sc, si) {
      var shots = sc.shots.map(function (sh, i) {
        return '<div class="shot" data-si="' + si + '" data-i="' + i + '">' +
          '<div class="shot-top">' +
            '<span class="grip" title="Перетащить кадр" aria-hidden="true">\u283F</span>' +
            '<span class="sn">' + (si + 1) + "." + (i + 1) + "</span>" +
            '<input class="what" type="text" value="' + esc(sh.what) + '" placeholder="Что в кадре: действие, кто и где" aria-label="Что в кадре">' +
            '<input class="min" type="number" min="0" step="5" value="' + esc(sh.min) + '" placeholder="мин" aria-label="Минут на кадр">' +
            '<span class="rowbtns">' +
              '<button type="button" class="up" aria-label="Кадр выше">\u2191</button>' +
              '<button type="button" class="down" aria-label="Кадр ниже">\u2193</button>' +
              '<button type="button" class="copy-shot" aria-label="Дублировать кадр">\u29C9</button>' +
              '<button type="button" class="del" aria-label="Удалить кадр">\u2715</button>' +
            "</span>" +
          "</div>" +
          '<div class="shot-grid">' +
            field("size", sh.size, "крупность", "dl-size", "Крупность") +
            field("angle", sh.angle, "ракурс", "dl-angle", "Ракурс") +
            field("move", sh.move, "движение", "dl-move", "Движение камеры") +
            '<input class="lens" type="text" value="' + esc(sh.lens) + '" placeholder="оптика, мм" aria-label="Оптика">' +
            '<input class="note" type="text" value="' + esc(sh.note) + '" placeholder="звук, свет, реквизит" aria-label="Примечание">' +
          "</div></div>";
      }).join("");
      return '<div class="scene" data-si="' + si + '">' +
        '<div class="scene-head">' +
          '<span class="scn">Сцена ' + (si + 1) + "</span>" +
          '<input class="sc-name" type="text" value="' + esc(sc.name) + '" placeholder="Название: сборы, церемония…" aria-label="Название сцены">' +
          '<input class="sc-loc" type="text" value="' + esc(sc.loc) + '" placeholder="Локация" aria-label="Локация сцены">' +
          field("sc-time", sc.time, "время суток", "dl-time", "Время суток") +
          '<span class="rowbtns">' +
            '<button type="button" class="up-scene" aria-label="Сцену выше">\u2191</button>' +
            '<button type="button" class="down-scene" aria-label="Сцену ниже">\u2193</button>' +
            '<button type="button" class="del-scene" aria-label="Удалить сцену">\u2715</button>' +
          "</span>" +
        "</div>" + shots +
        '<div class="scene-bar"><button type="button" class="mini add-shot">+ Кадр</button></div></div>';
    }).join("");
  }

  function readScenes() {
    [].forEach.call(scenesEl.querySelectorAll(".scene"), function (el) {
      var sc = scenes[+el.dataset.si];
      sc.name = el.querySelector(".sc-name").value;
      sc.loc = el.querySelector(".sc-loc").value;
      sc.time = el.querySelector(".sc-time").value;
      [].forEach.call(el.querySelectorAll(".shot"), function (s) {
        var sh = sc.shots[+s.dataset.i];
        sh.what = s.querySelector(".what").value;
        sh.min = s.querySelector(".min").value;
        sh.size = s.querySelector(".size").value;
        sh.angle = s.querySelector(".angle").value;
        sh.move = s.querySelector(".move").value;
        sh.lens = s.querySelector(".lens").value;
        sh.note = s.querySelector(".note").value;
      });
    });
  }

  scenesEl.addEventListener("input", function () { readScenes(); render(); save(); });
  scenesEl.addEventListener("change", function () { readScenes(); render(); save(); });
  function moveShot(si, i, dir) {
    readScenes();
    var sc = scenes[si], j = i + dir;
    if (j < 0) {                                  /* выше первого — в конец прошлой сцены */
      if (si === 0) return;
      scenes[si - 1].shots.push(sc.shots.splice(i, 1)[0]);
    } else if (j >= sc.shots.length) {            /* ниже последнего — в начало следующей */
      if (si === scenes.length - 1) return;
      scenes[si + 1].shots.unshift(sc.shots.splice(i, 1)[0]);
    } else {
      var t = sc.shots[i]; sc.shots[i] = sc.shots[j]; sc.shots[j] = t;
    }
    if (!sc.shots.length) sc.shots.push(blankShot());
    redraw();
  }
  function moveScene(si, dir) {
    readScenes();
    var j = si + dir;
    if (j < 0 || j >= scenes.length) return;
    var t = scenes[si]; scenes[si] = scenes[j]; scenes[j] = t;
    redraw();
  }
  function redraw() { drawScenes(); render(); save(); }

  scenesEl.addEventListener("click", function (e) {
    var t = e.target, shot = t.closest(".shot"), scene = t.closest(".scene");
    if (t.closest(".add-shot")) {
      readScenes();
      scenes[+scene.dataset.si].shots.push(blankShot());
    } else if (t.closest(".up") || t.closest(".down")) {
      return moveShot(+shot.dataset.si, +shot.dataset.i, t.closest(".up") ? -1 : 1);
    } else if (t.closest(".copy-shot")) {
      readScenes();
      var sc = scenes[+shot.dataset.si], i = +shot.dataset.i;
      sc.shots.splice(i + 1, 0, JSON.parse(JSON.stringify(sc.shots[i])));
    } else if (t.closest(".del")) {
      readScenes();
      var sc2 = scenes[+shot.dataset.si];
      sc2.shots.splice(+shot.dataset.i, 1);
      if (!sc2.shots.length) sc2.shots.push(blankShot());
    } else if (t.closest(".up-scene") || t.closest(".down-scene")) {
      return moveScene(+scene.dataset.si, t.closest(".up-scene") ? -1 : 1);
    } else if (t.closest(".del-scene")) {
      readScenes();
      scenes.splice(+scene.dataset.si, 1);
      if (!scenes.length) scenes.push(blankScene());
    } else {
      return;
    }
    redraw();
  });

  /* перетаскивание кадров мышью: тянем за ручку, бросаем в любую сцену */
  var drag = null;
  scenesEl.addEventListener("mousedown", function (e) {
    var sh = e.target.closest(".shot");
    if (sh) sh.draggable = !!e.target.closest(".grip");
  });
  scenesEl.addEventListener("dragstart", function (e) {
    var sh = e.target.closest(".shot");
    if (!sh || !sh.draggable) return;
    drag = { si: +sh.dataset.si, i: +sh.dataset.i };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "shot");
    sh.classList.add("dragging");
  });
  scenesEl.addEventListener("dragover", function (e) {
    if (!drag) return;
    var over = e.target.closest(".shot");
    if (!over && !e.target.closest(".scene")) return;
    e.preventDefault();
    [].forEach.call(scenesEl.querySelectorAll(".drop-here"), function (el) { el.classList.remove("drop-here"); });
    if (over) over.classList.add("drop-here");
  });
  scenesEl.addEventListener("drop", function (e) {
    if (!drag) return;
    e.preventDefault();
    readScenes();
    var over = e.target.closest(".shot"), scene = e.target.closest(".scene");
    if (!scene) return;
    var moved = scenes[drag.si].shots.splice(drag.i, 1)[0];
    var list = scenes[+scene.dataset.si].shots;
    var pos = list.length;
    if (over) {
      pos = +over.dataset.i;
      if (over.dataset.si === String(drag.si) && +over.dataset.i > drag.i) pos--;
      var r = over.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) pos++;
    }
    list.splice(Math.max(0, Math.min(list.length, pos)), 0, moved);
    scenes.forEach(function (sc) { if (!sc.shots.length) sc.shots.push(blankShot()); });
    drag = null;
    redraw();
  });
  scenesEl.addEventListener("dragend", function () {
    drag = null;
    [].forEach.call(scenesEl.querySelectorAll(".dragging, .drop-here"), function (el) {
      el.classList.remove("dragging");
      el.classList.remove("drop-here");
    });
  });

  document.getElementById("add-scene").addEventListener("click", function () {
    readScenes();
    scenes.push(blankScene());
    drawScenes();
    render();
    save();
  });

  /* чипы-пресеты: набивают кадры типовой съёмки в последнюю сцену */
  var chipsEl = document.getElementById("chips");
  function drawChips() {
    chipsEl.innerHTML = (PRESETS[kind()] || []).map(function (p, i) {
      return '<button type="button" class="chip" data-i="' + i + '">' + esc(p[0]) + "</button>";
    }).join("") + '<button type="button" class="chip all" data-all="1">+ Все кадры этой съёмки</button>';
  }
  chipsEl.addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    readScenes();
    var sc = scenes[scenes.length - 1];
    var list = PRESETS[kind()] || [];
    /* пустой первый кадр не копим — заменяем им же */
    if (sc.shots.length === 1 && !sc.shots[0].what) sc.shots.length = 0;
    if (b.dataset.all) list.forEach(function (p) { sc.shots.push(blankShot(p)); });
    else sc.shots.push(blankShot(list[+b.dataset.i]));
    if (!sc.shots.length) sc.shots.push(blankShot());
    drawScenes();
    render();
    save();
  });

  /* ---------- расчёт смены ---------- */
  function calc() {
    var defMin = num("f-defmin", 15);
    var total = 0, n = 0;
    scenes.forEach(function (sc) {
      sc.shots.forEach(function (sh) {
        if (!sh.what) return;
        n++;
        var m = parseFloat(sh.min);
        total += isNaN(m) ? defMin : m;
      });
    });
    var extra = num("f-extra", 60);
    var shift = num("f-shift", 8) * 60;
    return { shots: n, mins: total, extra: extra, busy: total + extra, shift: shift,
      over: total + extra > shift };
  }

  function hm(mins) {
    var h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return (h ? h + " ч " : "") + (m || !h ? m + " мин" : "").trim();
  }

  function drawMeter() {
    var d = calc();
    var box = document.getElementById("meter");
    var pct = d.shift > 0 ? Math.min(100, Math.round(d.busy / d.shift * 100)) : 0;
    box.querySelector(".bar i").style.width = pct + "%";
    box.classList.toggle("over", d.over);
    box.querySelector(".mtext").innerHTML = d.shots
      ? "<b>" + d.shots + " " + plural(d.shots, ["кадр", "кадра", "кадров"]) + "</b> · " +
        hm(d.busy) + " из " + hm(d.shift) + " смены" +
        (d.over ? " · <b>не влезает</b> — режьте кадры или берите вторую смену" : "")
      : "Добавьте кадры — посчитаю, влезает ли план в смену";
  }
  function plural(n, f) {
    var u = n % 100;
    if (u > 10 && u < 20) return f[2];
    u = u % 10;
    return u === 1 ? f[0] : (u > 1 && u < 5 ? f[1] : f[2]);
  }

  /* ---------- лист ---------- */
  function shotsTable(sc, si) {
    var defMin = num("f-defmin", 15);
    var h = ['<table class="items text shots" data-cols="6,38,15,17,14,10">' +
      "<tr><th>№</th><th>Что в кадре</th><th>Крупность</th><th>Ракурс · движение</th><th>Оптика</th><th>Мин</th></tr>"];
    var rows = 0;
    sc.shots.forEach(function (sh, i) {
      if (!sh.what) return;
      rows++;
      var m = parseFloat(sh.min);
      var how = [sh.angle, sh.move].filter(Boolean).map(esc).join(" · ");
      h.push("<tr><td>" + (si + 1) + "." + (i + 1) + "</td><td>" + esc(sh.what) +
        (sh.note ? "<br><i>" + esc(sh.note) + "</i>" : "") + "</td><td>" +
        (sh.size ? esc(sh.size) : "—") + "</td><td>" + (how || "—") + "</td><td>" +
        (sh.lens ? esc(sh.lens) : "—") + "</td><td>" + (isNaN(m) ? defMin : m) + "</td></tr>");
    });
    h.push("</table>");
    return rows ? h.join("") : "";
  }

  function render() {
    var d = calc();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>ШОТ-ЛИСТ · " + bl(val("f-proj")) + "</h3>");
    h.push('<table class="doc-meta"><tr><td>' + (val("f-loc") ? "Локация: " + esc(val("f-loc")) : "Локация: " + BL) +
      '</td><td style="text-align:right">' + (val("f-date") ? "Дата: " + esc(val("f-date")) : "Дата: " + BL) + "</td></tr></table>");
    h.push("<p>Снимают: " + bl(val("f-crew")) + (val("f-cam") ? ". Камера и оптика: " + esc(val("f-cam")) : "") + ".</p>");
    var any = false;
    scenes.forEach(function (sc, si) {
      var tbl = shotsTable(sc, si);
      if (!tbl) return;
      any = true;
      h.push("<h4>Сцена " + (si + 1) + (sc.name ? " · " + esc(sc.name) : "") +
        (sc.loc ? " · " + esc(sc.loc) : "") + " · " + esc(sc.time) + "</h4>");
      h.push(tbl);
    });
    if (!any) h.push("<p>Кадров пока нет: добавьте их слева — в листе появятся таблицы по сценам.</p>");
    if (d.shots) {
      h.push("<p><b>Итого: " + d.shots + " " + plural(d.shots, ["кадр", "кадра", "кадров"]) +
        ", съёмки " + hm(d.mins) + "</b>" + (d.extra ? "; переезды, обед и запас — " + hm(d.extra) : "") +
        ". Плановая смена — " + hm(d.shift) + (d.over ? ". ВНИМАНИЕ: план не влезает в смену." : ".") + "</p>");
    }
    h.push('<p class="doc-note">Минуты на кадр — ваши: отраслевой нормы «сколько ставится кадр» не существует. Собрано конструктором pobubnim.github.io.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
    drawMeter();
  }

  /* ---------- черновик в браузере ---------- */
  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          proj: val("f-proj"), date: val("f-date"), loc: val("f-loc"),
          crew: val("f-crew"), cam: val("f-cam"), kind: kind(),
          shift: val("f-shift"), defmin: val("f-defmin"), extra: val("f-extra"),
          scenes: scenes
        }));
      } catch (e) { /* приватный режим — просто не сохраняем */ }
    }, 400);
  }
  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    if (!raw) return;
    var d;
    try { d = JSON.parse(raw); } catch (e) { return; }
    if (!d || !d.scenes || !d.scenes.length) return;
    ["proj", "date", "loc", "crew", "cam", "shift", "defmin", "extra"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      if (el && d[k]) el.value = d[k];
    });
    var r = form.querySelector('input[name="kind"][value="' + d.kind + '"]');
    if (r) r.checked = true;
    scenes = d.scenes;
    document.getElementById("draft-note").hidden = false;
  }

  document.getElementById("btn-clear").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* нечего чистить */ }
    scenes = [blankScene()];
    form.reset();
    document.getElementById("draft-note").hidden = true;
    drawChips();
    drawScenes();
    render();
  });

  form.addEventListener("input", function () { render(); save(); });
  form.addEventListener("change", function (e) {
    if (e.target.name === "kind") drawChips();
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
    PobubnimDocx.download(paper, "shot-list-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  load();
  drawChips();
  drawScenes();
  render();

  /* для приёмки: tools/test_shotlist.py дёргает эти функции живьём */
  window.PobubnimShotlist = { calc: calc, hm: hm, state: function () { return scenes; } };
})();
