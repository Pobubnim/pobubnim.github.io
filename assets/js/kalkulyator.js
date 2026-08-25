/* ПОБУБНИМ — калькулятор стоимости съёмки (instrumenty/kalkulyator-stoimosti-semki.html).
   ЦЕНЫ = прайс сайта, менять синхронно с index.html#services и services/*.html.
   Позиции «по смете» цифру не меняют — помечают итог и уходят в текст заявки. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;

  /* прайс: сверен со страницами услуг 25.08.2026 */
  var PRICES = {
    reklama_full: { nm: "Рекламный ролик под ключ", sum: 60000, note: "сценарий, съёмка, монтаж, цвет, звук" },
    reklama_day: { nm: "Съёмочный день (реклама)", sum: 30000, note: "съёмка без монтажа" },
    svadba: { nm: "Свадебный фильм, полный день", sum: 60000, note: "утро, церемония, банкет — фильм 2–4 минуты" },
    imidzh: { nm: "Имиджевый фильм о компании", sum: 60000, note: "многодневные съёмки — по смете" },
    klip: { nm: "Музыкальный клип", sum: 60000, note: "сложная постановка и графика — по смете" },
    event_day: { nm: "Съёмочный день на мероприятии", sum: 30000, note: "репортажная съёмка" },
    event_film: { nm: "Отчётный ролик с монтажом", sum: 20000, note: "" },
    color_min: 2500, color_min_total: 15000
  };
  var EXTRAS = [
    ["x-cam2", "Вторая камера"],
    ["x-days", "Несколько съёмочных дней"],
    ["x-gfx", "Графика / титры"],
    ["x-drone", "Съёмка с дрона"]
  ];

  function money(n) { return n.toLocaleString("ru-RU") + " ₽"; }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  function collect() {
    var type = radio("type");
    var lines = [];
    if (type === "reklama") {
      lines.push(radio("rekmode") === "day" ? PRICES.reklama_day : PRICES.reklama_full);
    } else if (type === "event") {
      lines.push(PRICES.event_day);
      if (document.getElementById("ev-film").checked) lines.push(PRICES.event_film);
    } else if (type === "color") {
      var mins = Math.max(1, +document.getElementById("col-min").value || 1);
      var sum = Math.max(mins * PRICES.color_min, PRICES.color_min_total);
      lines.push({ nm: "Цветокоррекция, " + mins + " мин хронометража", sum: sum, note: "2 500 ₽/мин, минимум 15 000 ₽ за ролик" });
    } else {
      lines.push(PRICES[type]);
    }
    var extras = EXTRAS.filter(function (x) { return document.getElementById(x[0]).checked; }).map(function (x) { return x[1]; });
    return { lines: lines, extras: extras, total: lines.reduce(function (a, l) { return a + l.sum; }, 0) };
  }

  function render() {
    var type = radio("type");
    document.getElementById("sec-reklama").hidden = type !== "reklama";
    document.getElementById("sec-event").hidden = type !== "event";
    document.getElementById("sec-color").hidden = type !== "color";

    var d = collect();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>ОРИЕНТИР СМЕТЫ</h3>");
    h.push('<p style="text-align:center;font-size:12px;color:#6b675e">видеограф Савелий Бубнов · pobubnim.github.io</p>');
    d.lines.forEach(function (l) {
      h.push('<div class="line"><span>' + l.nm + (l.note ? '<br><em style="font-size:11.5px">' + l.note + "</em>" : "") + "</span><span><b>от " + money(l.sum) + "</b></span></div>");
    });
    d.extras.forEach(function (nm) {
      h.push('<div class="line"><span>' + nm + '</span><span><em>обсудить по смете</em></span></div>');
    });
    h.push('<div class="total"><span>Итого</span><span>от ' + money(d.total) + (d.extras.length ? " +" : "") + "</span></div>");
    if (d.extras.length) h.push('<p style="font-size:11.5px;color:#6b675e;margin-top:8px">«+» — выбраны позиции, которые считаются по смете после разговора о задаче.</p>');
    h.push('<p class="doc-note">Ориентир по прайсу, не публичная оферта. Точная смета — после обсуждения задачи.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);

  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this, d = collect();
    var txt = "Смета (ориентир) — pobubnim.github.io\n" +
      d.lines.map(function (l) { return "· " + l.nm + " — от " + money(l.sum); }).join("\n") +
      (d.extras.length ? "\nОбсудить по смете: " + d.extras.join(", ") : "") +
      "\nИтого: от " + money(d.total) + (d.extras.length ? " + позиции по смете" : "");
    function done() {
      var old = btn.textContent;
      btn.textContent = "Скопировано ✓";
      btn.classList.add("copy-done");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  });

  render();
})();
