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

  /* номенклатура — EDU_BASE §8ж */
  var SIZES = ["дальний (ELS)", "общий (WS)", "средний общий (MLS)", "средний (MS)",
    "грудной (MCU)", "крупный (CU)", "деталь (ECU)"];
  var ANGLES = ["с уровня глаз", "сверху", "снизу", "через плечо", "от первого лица", "«голландский»"];
  var MOVES = ["статика", "панорама", "наклон", "проезд", "слайдер", "стедикам",
    "с рук", "кран", "зум", "дрон"];

  /* пресеты кадров по типу съёмки: [что в кадре, крупность, движение, примечание] */
  var PRESETS = {
    svadba: [
      ["Детали: кольца, платье, туфли", "деталь (ECU)", "слайдер", ""],
      ["Сборы невесты у окна", "средний (MS)", "с рук", "мягкий свет из окна"],
      ["Проход к церемонии", "общий (WS)", "стедикам", ""],
      ["Клятвы: крупный жениха и невесты", "крупный (CU)", "статика", "звук: петличка на женихе"],
      ["Реакции гостей", "грудной (MCU)", "с рук", ""],
      ["Первый танец", "общий (WS)", "стедикам", ""],
      ["Тосты, речь родителей", "средний (MS)", "статика", "звук: рекордер у микрофона"]
    ],
    interv: [
      ["Герой отвечает, основной ракурс", "грудной (MCU)", "статика", "звук: петличка + пушка"],
      ["Второй ракурс, чуть сбоку", "средний (MS)", "статика", "вторая камера"],
      ["Руки героя, жест", "деталь (ECU)", "статика", ""],
      ["Перебивка: рабочий процесс", "средний (MS)", "с рук", ""],
      ["Общий помещения", "общий (WS)", "панорама", ""]
    ],
    reklama: [
      ["Продукт на столе", "деталь (ECU)", "слайдер", "контровой свет"],
      ["Руки берут продукт", "крупный (CU)", "статика", ""],
      ["Герой пользуется продуктом", "средний (MS)", "проезд", ""],
      ["Общий пространства", "общий (WS)", "статика", ""],
      ["Финал: логотип, упаковка", "деталь (ECU)", "статика", ""]
    ],
    klip: [
      ["Проход артиста по улице", "общий (WS)", "стедикам", ""],
      ["Липсинк, крупный", "крупный (CU)", "с рук", "плейбек с колонки"],
      ["Деталь: гитара, микрофон", "деталь (ECU)", "статика", ""],
      ["Танцевальный общий", "дальний (ELS)", "кран", ""],
      ["Проезд мимо героя", "средний (MS)", "проезд", ""]
    ],
    meropr: [
      ["Общий зала до начала", "общий (WS)", "панорама", ""],
      ["Спикер на сцене", "средний (MS)", "статика", "звук: пульт или рекордер"],
      ["Реакции зала", "грудной (MCU)", "с рук", ""],
      ["Детали оформления", "деталь (ECU)", "слайдер", ""],
      ["Нетворкинг в холле", "средний (MS)", "с рук", ""]
    ]
  };

  function blankShot(p) {
    return { what: p ? p[0] : "", size: p ? p[1] : "средний (MS)", angle: "с уровня глаз",
      move: p ? p[2] : "статика", lens: "", min: "", note: p ? p[3] : "" };
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
  function opts(list, cur) {
    return list.map(function (o) {
      return '<option' + (o === cur ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
  }

  function drawScenes() {
    scenesEl.innerHTML = scenes.map(function (sc, si) {
      var shots = sc.shots.map(function (sh, i) {
        return '<div class="shot" data-si="' + si + '" data-i="' + i + '">' +
          '<div class="shot-top">' +
            '<span class="sn">' + (si + 1) + "." + (i + 1) + "</span>" +
            '<input class="what" type="text" value="' + esc(sh.what) + '" placeholder="Что в кадре: действие, кто и где" aria-label="Что в кадре">' +
            '<input class="min" type="number" min="0" step="5" value="' + esc(sh.min) + '" placeholder="мин" aria-label="Минут на кадр">' +
            '<button type="button" class="del" aria-label="Удалить кадр">✕</button>' +
          "</div>" +
          '<div class="shot-grid">' +
            '<select class="size" aria-label="Крупность">' + opts(SIZES, sh.size) + "</select>" +
            '<select class="angle" aria-label="Ракурс">' + opts(ANGLES, sh.angle) + "</select>" +
            '<select class="move" aria-label="Движение камеры">' + opts(MOVES, sh.move) + "</select>" +
            '<input class="lens" type="text" value="' + esc(sh.lens) + '" placeholder="оптика, мм" aria-label="Оптика">' +
            '<input class="note" type="text" value="' + esc(sh.note) + '" placeholder="звук, свет, реквизит" aria-label="Примечание">' +
          "</div></div>";
      }).join("");
      return '<div class="scene" data-si="' + si + '">' +
        '<div class="scene-head">' +
          '<span class="scn">Сцена ' + (si + 1) + "</span>" +
          '<input class="sc-name" type="text" value="' + esc(sc.name) + '" placeholder="Название: сборы, церемония…" aria-label="Название сцены">' +
          '<input class="sc-loc" type="text" value="' + esc(sc.loc) + '" placeholder="Локация" aria-label="Локация сцены">' +
          '<select class="sc-time" aria-label="Время суток">' + opts(["утро", "день", "вечер", "ночь"], sc.time) + "</select>" +
          '<button type="button" class="del-scene" aria-label="Удалить сцену">✕</button>' +
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
  scenesEl.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest(".add-shot")) {
      readScenes();
      scenes[+t.closest(".scene").dataset.si].shots.push(blankShot());
    } else if (t.closest(".del")) {
      readScenes();
      var sh = t.closest(".shot"), sc = scenes[+sh.dataset.si];
      sc.shots.splice(+sh.dataset.i, 1);
      if (!sc.shots.length) sc.shots.push(blankShot());
    } else if (t.closest(".del-scene")) {
      readScenes();
      scenes.splice(+t.closest(".scene").dataset.si, 1);
      if (!scenes.length) scenes.push(blankScene());
    } else {
      return;
    }
    drawScenes();
    render();
    save();
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
      h.push("<tr><td>" + (si + 1) + "." + (i + 1) + "</td><td>" + esc(sh.what) +
        (sh.note ? "<br><i>" + esc(sh.note) + "</i>" : "") + "</td><td>" + esc(sh.size) +
        "</td><td>" + esc(sh.angle) + " · " + esc(sh.move) + "</td><td>" +
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
