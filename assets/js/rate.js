/* ПОБУБНИМ — ставка за съёмочную смену (instrumenty/stavka-frilansera.html).
   Считает не «сколько хочется», а сколько нужно брать, чтобы после налога,
   расходов, амортизации техники и простоя остался желаемый доход.
   Вся математика прозрачна и проверяется обратным счётом (tools/test_rate.py). */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;

  var TAX = { npd4: 0.04, npd6: 0.06, usn6: 0.06, none: 0 };
  var TAX_NAME = {
    npd4: "НПД 4% (заказчики — физлица)",
    npd6: "НПД 6% (заказчики — компании и ИП)",
    usn6: "УСН 6%",
    none: "без налога"
  };

  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function num(id, def) {
    var v = parseFloat(val(id).replace(",", "."));
    return isNaN(v) ? def : v;
  }
  function money(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function taxKey() {
    var el = form.querySelector('input[name="tax"]:checked');
    return el ? el.value : "npd6";
  }

  function calc() {
    var want = Math.max(0, num("f-want", 120000));        /* хочу на руки в месяц */
    var shifts = Math.max(0.5, num("f-shifts", 6));       /* смен в месяц */
    var hours = Math.max(1, num("f-hours", 20));          /* часов на смену со всем постом */
    var costs = Math.max(0, num("f-costs", 15000));       /* постоянные расходы в месяц */
    var gear = Math.max(0, num("f-gear", 900000));        /* стоимость комплекта */
    var years = Math.max(0.5, num("f-years", 5));         /* за сколько лет он «съедается» */
    var reserve = Math.min(90, Math.max(0, num("f-reserve", 10))); /* резерв, % от дохода */
    var tax = TAX[taxKey()];

    var amort = gear / (years * 12);                      /* амортизация в месяц */
    var reserveSum = want * reserve / 100;
    var needNet = want + reserveSum + costs + amort;      /* нужно после налога */
    var gross = needNet / (1 - tax);                      /* нужно до налога */
    var perShift = gross / shifts;
    var perHour = perShift / hours;

    return { want: want, shifts: shifts, hours: hours, costs: costs, gear: gear,
      years: years, reserve: reserve, reserveSum: reserveSum, tax: tax,
      amort: amort, needNet: needNet, gross: gross, perShift: perShift, perHour: perHour };
  }

  /* обратная проверка: что останется на руки при своей ставке */
  function backward(rate) {
    var c = calc();
    var gross = rate * c.shifts;
    var afterTax = gross * (1 - c.tax);
    return { gross: gross, afterTax: afterTax,
      net: afterTax - c.costs - c.amort - c.reserveSum,
      diff: afterTax - c.costs - c.amort - c.reserveSum - c.want };
  }

  function render() {
    var c = calc();
    var h = [];
    h.push('<div class="big">' + money(c.perShift) + "</div>");
    h.push('<div class="big-sub">минимальная ставка за смену при ' + c.shifts +
      " сменах в месяц · " + money(c.perHour) + " в час</div>");
    h.push('<div class="line"><b>Хочу на руки</b><span>' + money(c.want) + " в месяц</span></div>");
    h.push('<div class="line"><b>Резерв ' + c.reserve + "%</b><span>" + money(c.reserveSum) +
      " — отпуск, простой, ремонт</span></div>");
    h.push('<div class="line"><b>Постоянные расходы</b><span>' + money(c.costs) + " в месяц</span></div>");
    h.push('<div class="line"><b>Амортизация техники</b><span>' + money(c.amort) + " в месяц</span></div>");
    h.push('<div class="line"><b>Нужно после налога</b><span>' + money(c.needNet) + "</span></div>");
    h.push('<div class="line"><b>' + TAX_NAME[taxKey()] + "</b><span>" +
      (c.tax ? "+" + money(c.gross - c.needNet) + " сверху" : "налога нет") + "</span></div>");
    h.push('<div class="line"><b>Выручка в месяц</b><span>' + money(c.gross) + "</span></div>");

    var real = num("f-real", 0);
    if (real > 0) {
      var b = backward(real);
      h.push("<h4>Если брать " + money(real) + " за смену</h4>");
      h.push('<div class="line"><b>Выручка</b><span>' + money(b.gross) + " в месяц</span></div>");
      h.push('<div class="line"><b>Остаётся на руки</b><span>' + money(b.net) + "</span></div>");
      h.push("<p>" + (b.diff >= 0
        ? "Это на " + money(b.diff) + " больше цели — запас есть."
        : "Это на " + money(-b.diff) + " меньше цели. Варианта три: поднять ставку до " +
          money(c.perShift) + ", добрать " +
          Math.ceil((c.gross - b.gross) / real) + " смен(ы) или срезать расходы.") + "</p>");
    }

    h.push("<p>В ставку заложено " + c.hours + " часов работы на смену — не только съёмочный день, " +
      "но и подготовка, отбор материала, монтаж, цвет и правки. Часовая ставка получается " +
      money(c.perHour) + ": именно её стоит держать в голове, когда клиент просит «просто приехать на часок».</p>");
    h.push('<p class="doc-note">Это расчёт минимума, ниже которого работа идёт в минус, а не рыночная цена. ' +
      'Рынок может быть и выше — тогда разница идёт в развитие, и это нормально. Собрано конструктором pobubnim.ru.</p>');
    paper.innerHTML = h.join("");
    drawBars(c);
  }

  /* из чего складывается ставка — наглядной полосой */
  function drawBars(c) {
    var box = document.getElementById("split");
    var parts = [
      ["Доход", c.want, "want"],
      ["Резерв", c.reserveSum, "reserve"],
      ["Расходы", c.costs, "costs"],
      ["Техника", c.amort, "amort"],
      ["Налог", c.gross - c.needNet, "tax"]
    ].filter(function (p) { return p[1] > 0; });
    var total = parts.reduce(function (a, p) { return a + p[1]; }, 0) || 1;
    box.querySelector(".track").innerHTML = parts.map(function (p) {
      return '<i class="' + p[2] + '" style="width:' + (p[1] / total * 100) + '%" title="' +
        p[0] + '"></i>';
    }).join("");
    box.querySelector(".legend").innerHTML = parts.map(function (p) {
      return '<span><i class="' + p[2] + '"></i>' + p[0] + " · " +
        Math.round(p[1] / total * 100) + "%</span>";
    }).join("");
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);

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
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  render();
  window.PobubnimRate = { calc: calc, backward: backward };
})();
