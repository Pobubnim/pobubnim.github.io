/* ПОБУБНИМ — смета и счёт на съёмку (instrumenty/smeta-i-schet.html).
   Калькулятор смен для исполнителей: позиции со своими ставками, из одного
   массива собираются оба документа. Всё локально в браузере. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var rowsEl = document.getElementById("rows");
  if (!form || !paper || !rowsEl) return;

  var tabS = document.getElementById("tab-smeta");
  var tabC = document.getElementById("tab-schet");
  var mode = "smeta";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function money(n) { return (+n).toLocaleString("ru-RU"); }
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  var UNITS = ["смена", "час", "мин", "шт", "км", "усл."];
  /* пресеты: название + единица; цену исполнитель ставит свою */
  var PRESETS = [
    ["Съёмочная смена (до 8 часов)", "смена"],
    ["Дополнительный час", "час"],
    ["Второй оператор, смена", "смена"],
    ["Монтаж, за минуту хронометража", "мин"],
    ["Цветокоррекция, за минуту", "мин"],
    ["Аренда техники, смена", "смена"],
    ["Дорога", "км"],
    ["+ Своя позиция", ""]
  ];

  var rows = [{ name: "Съёмочная смена (до 8 часов)", qty: 1, unit: "смена", price: "" }];

  /* ---------- форма позиций ---------- */
  document.getElementById("chips").innerHTML = PRESETS.map(function (p, i) {
    return '<button type="button" class="chip" data-i="' + i + '">' + esc(p[0]) + "</button>";
  }).join("");
  document.getElementById("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var p = PRESETS[+b.dataset.i];
    rows.push({ name: p[0] === "+ Своя позиция" ? "" : p[0], qty: 1, unit: p[1] || "усл.", price: "" });
    drawRows();
    render();
    var last = rowsEl.lastElementChild;
    if (last) last.querySelector(p[0] === "+ Своя позиция" ? ".name" : ".price").focus();
  });

  function drawRows() {
    rowsEl.innerHTML = rows.map(function (r, i) {
      return '<div class="rowi" data-i="' + i + '">' +
        '<input class="name" type="text" value="' + esc(r.name) + '" placeholder="Название позиции" aria-label="Наименование">' +
        '<input class="qty" type="number" min="0" step="0.5" value="' + r.qty + '" aria-label="Количество">' +
        '<select class="unit" aria-label="Единица">' + UNITS.map(function (u) {
          return '<option' + (u === r.unit ? " selected" : "") + ">" + u + "</option>";
        }).join("") + "</select>" +
        '<input class="price" type="number" min="0" step="500" value="' + esc(r.price) + '" placeholder="0" aria-label="Цена за единицу">' +
        '<button type="button" class="del" aria-label="Удалить позицию">✕</button></div>';
    }).join("");
  }
  rowsEl.addEventListener("input", function (e) {
    var w = e.target.closest(".rowi");
    if (!w) return;
    var r = rows[+w.dataset.i];
    r.name = w.querySelector(".name").value;
    r.qty = w.querySelector(".qty").value;
    r.unit = w.querySelector(".unit").value;
    r.price = w.querySelector(".price").value;
    render();
  });
  rowsEl.addEventListener("click", function (e) {
    if (!e.target.closest(".del")) return;
    rows.splice(+e.target.closest(".rowi").dataset.i, 1);
    if (!rows.length) rows.push({ name: "", qty: 1, unit: "усл.", price: "" });
    drawRows();
    render();
  });

  /* ---------- расчёт ---------- */
  function calc() {
    var items = rows.filter(function (r) { return r.name || +r.price; }).map(function (r) {
      return { name: r.name, qty: +r.qty || 0, unit: r.unit, price: +r.price || 0, sum: (+r.qty || 0) * (+r.price || 0) };
    });
    var sub = items.reduce(function (a, i) { return a + i.sum; }, 0);
    var disc = Math.min(90, Math.max(0, +val("f-disc") || 0));
    var discSum = Math.round(sub * disc / 100);
    return { items: items, sub: sub, disc: disc, discSum: discSum, total: sub - discSum };
  }

  function itemsTable(d) {
    var h = ['<table class="items"><tr><th>Наименование</th><th>Кол-во</th><th>Цена, ₽</th><th>Сумма, ₽</th></tr>'];
    d.items.forEach(function (i) {
      h.push("<tr><td>" + bl(i.name) + "</td><td>" + i.qty + " " + esc(i.unit) + "</td><td>" + money(i.price) + "</td><td>" + money(i.sum) + "</td></tr>");
    });
    h.push("</table>");
    if (d.disc) h.push('<div class="line"><span>Скидка ' + d.disc + "%</span><span>−" + money(d.discSum) + " ₽</span></div>");
    var totalF = PobubnimDocx.moneyFull(d.total);
    h.push('<div class="line grand"><b>' + (mode === "smeta" ? "Итого" : "Итого к оплате") + "</b><span><b>" + (totalF ? totalF : "0 рублей") + "</b></span></div>");
    return h.join("");
  }

  function whoIntro() {
    var nm = bl(val("f-exec")), inn = bl(val("f-inn"));
    switch (radio("who")) {
      case "ip": return "Индивидуальный предприниматель " + nm + ", ИНН " + inn;
      case "ooo": return nm + ", ИНН " + inn;
      default: return nm + ", самозанятый (налог на профессиональный доход), ИНН " + inn;
    }
  }
  function ndsLine() {
    return radio("who") === "ooo" ? "" : "<p>НДС не облагается" + (radio("who") === "selfemp" ? ": исполнитель применяет налог на профессиональный доход. После оплаты будет передан чек из приложения «Мой налог»" : "") + ".</p>";
  }

  /* ---------- документы ---------- */
  function renderSmeta(d) {
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>СМЕТА № " + bl(val("f-num")) + " на услуги съёмки</h3>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(val("f-city")) + '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');
    h.push("<p>Исполнитель: " + whoIntro() + ".<br>Заказчик: " + bl(val("f-client")) + ".</p>");
    h.push(itemsTable(d));
    h.push(ndsLine());
    h.push("<p>Смета действительна 14 (четырнадцать) календарных дней с даты составления. Позиции «по смете» и объёмы сверх указанных согласовываются дополнительно.</p>");
    h.push('<table class="req"><tr><td><b>Исполнитель</b>' + bl(val("f-exec")) + '<div class="sig">Подпись: ' + BL + "</div></td><td><b>Заказчик</b>" + bl(val("f-client")) + '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push('<p class="doc-note">Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    return h.join("");
  }

  function renderSchet(d) {
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>СЧЁТ НА ОПЛАТУ № " + bl(val("f-num")) + "</h3>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(val("f-city")) + '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');
    h.push("<h4>Получатель</h4>");
    h.push("<p>" + whoIntro() + "<br>Банк получателя: " + bl(val("f-bank")) + " · БИК " + bl(val("f-bik")) + "<br>Счёт получателя: " + bl(val("f-rs")) + "<br>Корр. счёт банка: " + bl(val("f-ks")) + "</p>");
    h.push("<h4>Плательщик</h4>");
    h.push("<p>" + bl(val("f-client")) + "</p>");
    h.push(itemsTable(d));
    h.push(ndsLine());
    h.push("<p>Назначение платежа: оплата услуг съёмки" + (val("f-dog") ? " по договору № " + esc(val("f-dog")) : "") + " по счёту № " + (val("f-num") ? esc(val("f-num")) : "___") + ". Счёт действителен для оплаты 5 (пяти) банковских дней.</p>");
    h.push('<table class="req"><tr><td><b>Исполнитель</b>' + bl(val("f-exec")) + '<div class="sig">Подпись: ' + BL + "</div></td><td></td></tr></table>");
    h.push('<p class="doc-note">Собрано конструктором pobubnim.ru.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    return h.join("");
  }

  function render() {
    var d = calc();
    document.getElementById("sec-bank").hidden = mode !== "schet";
    paper.innerHTML = mode === "smeta" ? renderSmeta(d) : renderSchet(d);
    /* подсказка исполнителю: сколько останется после НПД (в документы не идёт) */
    var note = document.getElementById("npd-note");
    if (radio("who") === "selfemp" && d.total > 0) {
      note.hidden = false;
      note.textContent = "Самозанятому на руки после налога НПД: заказчик-физлицо (4%) — " +
        money(Math.round(d.total * 0.96)) + " ₽ · заказчик-компания или ИП (6%) — " +
        money(Math.round(d.total * 0.94)) + " ₽. В документы эта строка не попадает.";
    } else {
      note.hidden = true;
    }
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);

  function setMode(m) {
    mode = m;
    tabS.classList.toggle("on", m === "smeta");
    tabC.classList.toggle("on", m === "schet");
    tabS.setAttribute("aria-selected", m === "smeta");
    tabC.setAttribute("aria-selected", m === "schet");
    render();
  }
  tabS.addEventListener("click", function () { setMode("smeta"); });
  tabC.addEventListener("click", function () { setMode("schet"); });

  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this, txt = paper.innerText;
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
  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, (mode === "smeta" ? "smeta" : "schet") + "-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  drawRows();
  render();
})();
