/* ПОБУБНИМ — интерфейс ND-калькулятора (instrumenty/kalkulyator-nd-filtra.html).
   Считает nd.js; здесь — форма, лист расчёта и подбор фильтров. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;
  var ND = window.PobubnimNd;

  var SHUTTERS = [1 / 8000, 1 / 4000, 1 / 2000, 1 / 1000, 1 / 500, 1 / 250, 1 / 125,
    1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 15, 30];

  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function num(id, def) {
    var v = parseFloat(val(id).replace(",", "."));
    return isNaN(v) ? def : v;
  }
  function mode() {
    var el = form.querySelector('input[name="mode"]:checked');
    return el ? el.value : "video";
  }
  function ru(n, d) {
    return n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function stopsText(s) {
    var v = Math.round(Math.abs(s) * 10) / 10;
    /* дробные по-русски всегда «стопа»: 9,4 стопа, но 9 стопов */
    var tail = v % 1 ? " стопа" : (v === 1 ? " стоп" : (v > 1 && v < 5 ? " стопа" : " стопов"));
    return ru(v, v % 1 ? 1 : 0) + tail;
  }

  /* поля выбора */
  document.getElementById("f-scene").innerHTML = ND.SCENES.map(function (s, i) {
    return '<option value="' + s[1] + '"' + (i === 1 ? " selected" : "") + ">" + s[0] +
      " · EV " + s[1] + "</option>";
  }).join("");
  document.getElementById("f-shut").innerHTML = SHUTTERS.map(function (t) {
    return '<option value="' + t + '"' + (Math.abs(t - 1 / 250) < 1e-9 ? " selected" : "") + ">" +
      ND.shutterText(t) + "</option>";
  }).join("");
  document.getElementById("f-filter").innerHTML = ND.FILTERS.map(function (f) {
    return '<option value="' + f[1] + '"' + (f[1] === 10 ? " selected" : "") + ">" + f[0] +
      " · " + f[1] + " ст.</option>";
  }).join("") + '<option value="custom">Свои стопы</option>';

  function syncSections() {
    var m = mode();
    document.getElementById("sec-video").hidden = m !== "video";
    document.getElementById("sec-photo").hidden = m !== "photo";
    document.getElementById("fld-custom").hidden = !(m === "photo" && val("f-filter") === "custom");
  }

  /* ---------- расчёт ---------- */
  function video() {
    var fps = Math.max(1, num("f-fps", 25));
    var angle = Math.max(1, num("f-angle", 180));
    var t = ND.shutterFromAngle(fps, angle);
    var N = Math.max(0.7, num("f-ap", 2.8));
    var iso = Math.max(12, num("f-iso", 800));
    var ev = num("f-scene", 15);
    var stops = ND.ndStops(ev, iso, N, t);
    return { fps: fps, angle: angle, t: t, N: N, iso: iso, ev: ev, stops: stops,
      picks: ND.pickFilters(stops) };
  }

  function photo() {
    var t0 = num("f-shut", 1 / 250);
    var raw = val("f-filter");
    var stops = raw === "custom" ? num("f-stops", 10) : parseFloat(raw);
    return { t0: t0, stops: stops, t1: t0 * ND.stopsToFactor(stops) };
  }

  function renderVideo() {
    var v = video();
    var h = [];
    var need = v.stops > 0.15;
    h.push('<div class="big">' + (need ? stopsText(v.stops) + " ND" : "Фильтр не нужен") + "</div>");
    h.push('<div class="big-sub">' + (need
      ? "чтобы держать шаттер " + ND.shutterText(v.t) + " при f/" + ru(v.N, 1) + " и ISO " + v.iso
      : (v.stops < -0.15 ? "света не хватает на " + stopsText(v.stops) : "экспозиция сходится как есть")) + "</div>");
    h.push('<div class="line"><b>Выдержка по шаттеру</b><span>' + ND.shutterText(v.t) +
      " (" + v.angle + "° при " + ru(v.fps, 0) + " к/с)</span></div>");
    h.push('<div class="line"><b>Сцена</b><span>EV ' + ru(v.ev, 0) + " при ISO 100</span></div>");
    h.push('<div class="line"><b>Ваши настройки</b><span>f/' + ru(v.N, 1) + ", ISO " + v.iso + "</span></div>");
    if (need) {
      h.push('<div class="line"><b>Плотность фильтра</b><span>' + ru(ND.density(v.stops), 1) + " D</span></div>");
      v.picks.forEach(function (p, i) {
        var rest = p.stops - v.stops;
        h.push('<div class="line"><b>' + (i === 0 ? "Ближайший фильтр" : "Или") + "</b><span>" + p.name +
          " · " + p.stops + " ст." + (Math.abs(rest) < 0.15 ? " — ровно"
            : (rest > 0 ? " — темнее на " + stopsText(rest) : " — светлее на " + stopsText(rest))) +
          "</span></div>");
      });
      var p0 = v.picks[0], rest0 = p0 ? p0.stops - v.stops : 0;
      if (p0 && Math.abs(rest0) >= 0.15) {
        var apNew = v.N * Math.pow(2, -rest0 / 2);
        h.push("<p>С фильтром " + p0.name + " останется " + stopsText(rest0) +
          (rest0 > 0 ? " темноты" : " пересвета") + ": добирайте диафрагмой примерно до f/" +
          ru(apNew, 1) + " или ISO.</p>");
      }
    } else if (v.stops < -0.15) {
      h.push("<p>Для такой сцены света не хватает: открывайте диафрагму, поднимайте ISO или ставьте свет. Шаттер трогать не стоит — он держит естественный смаз движения.</p>");
    }
    h.push('<p class="doc-note">Расчёт по правилу Sunny 16 и таблице EV — это ориентир по типу освещения, а не замер экспонометром. Точную экспозицию всегда проверяйте по зебре, ложным цветам или гистограмме камеры.</p>');
    return h.join("");
  }

  function renderPhoto() {
    var p = photo();
    var h = [];
    h.push('<div class="big">' + ND.shutterText(p.t1) + "</div>");
    h.push('<div class="big-sub">выдержка под фильтром на ' + stopsText(p.stops) + "</div>");
    h.push('<div class="line"><b>Без фильтра</b><span>' + ND.shutterText(p.t0) + "</span></div>");
    h.push('<div class="line"><b>Фильтр</b><span>' + stopsText(p.stops) + " (плотность " +
      ru(ND.density(p.stops), 1) + " D, кратность ×" + Math.round(ND.stopsToFactor(p.stops)) + ")</span></div>");
    h.push('<div class="line"><b>С фильтром</b><span>' + ND.shutterText(p.t1) + "</span></div>");
    if (p.t1 > 30) {
      h.push("<p>Дольше 30 секунд — это режим BULB: нужен пульт или таймер, штатив и терпение. На таких выдержках прибавьте запас: под фильтром автофокус и замер обычно уже не работают, наводитесь и мерьте до того, как накрутите стекло.</p>");
    } else if (p.t1 > 1) {
      h.push("<p>Выдержка длиннее секунды — снимайте со штатива и спуском по таймеру, иначе смажет нажатие кнопки.</p>");
    }
    h.push('<p class="doc-note">Кратность фильтра переводится в стопы как log₂: ND8 — три стопа, ND1000 — десять. У дешёвых фильтров реальная плотность гуляет на треть стопа, а на сильных ND появляется цветовой сдвиг, который лечится балансом белого на посте.</p>');
    return h.join("");
  }

  function render() {
    syncSections();
    paper.innerHTML = '<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>' +
      (mode() === "video" ? renderVideo() : renderPhoto()) +
      '<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>';
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

  render();
  window.PobubnimNdCalc = { video: video, photo: photo, mode: mode };
})();
