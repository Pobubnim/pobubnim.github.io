/* ПОБУБНИМ — интерфейс калькулятора ГРИП (instrumenty/kalkulyator-grip.html).
   Считает dof.js; здесь — форма, лист расчёта и схема зоны резкости. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;
  var D = window.PobubnimDof;

  var FOCALS = [14, 24, 35, 50, 85, 135];

  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function num(id, def) {
    var v = parseFloat(val(id).replace(",", "."));
    return isNaN(v) ? def : v;
  }
  function strict() {
    var el = form.querySelector('input[name="strict"]:checked');
    return el ? el.value : "print";
  }
  function ru(n, digits) {
    return n.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  /* дистанции печатаем по-русски: до метра — в сантиметрах */
  function dist(mm) {
    if (!isFinite(mm)) return "бесконечность";
    if (mm < 1000) return Math.round(mm / 10) + " см";
    var m = mm / 1000;
    return ru(m, m >= 100 ? 0 : (m >= 10 ? 1 : 2)) + " м";
  }

  document.getElementById("f-fmt").innerHTML = D.FORMATS.map(function (f, i) {
    return '<option value="' + i + '"' + (i === 0 ? " selected" : "") + ">" + f[0] + "</option>";
  }).join("");
  document.getElementById("chips-focal").innerHTML = FOCALS.map(function (f) {
    return '<button type="button" class="chip" data-f="' + f + '">' + f + " мм</button>";
  }).join("");
  document.getElementById("chips-focal").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    document.getElementById("f-focal").value = b.dataset.f;
    render();
  });

  function state() {
    var fmt = D.FORMATS[+val("f-fmt") || 0];
    var f = Math.max(1, num("f-focal", 50));
    var N = Math.max(0.7, num("f-ap", 2.8));
    var s = Math.max(0.05, num("f-dist", 3)) * 1000;      /* мм */
    var res = Math.max(320, num("f-res", 3840));
    var c = D.coc(strict(), fmt[1], fmt[2], res);
    var d = D.dof(f, N, s, c);
    var bg = Math.max(0.05, num("f-bg", 8)) * 1000;
    var blurMm = D.blur(f, N, s, bg);
    var pxPerMm = res / fmt[1];
    return { fmt: fmt, f: f, N: N, s: s, res: res, c: c, d: d, bg: bg,
      blurMm: blurMm, blurPx: blurMm * pxPerMm };
  }

  function render() {
    var st = state();
    var d = st.d;
    var front = st.s - d.near, back = isFinite(d.far) ? d.far - st.s : Infinity;
    var h = [];
    h.push('<div class="big">' + (isFinite(d.total) ? dist(d.total) : "от " + dist(d.near) + " до ∞") + "</div>");
    h.push('<div class="big-sub">' + (isFinite(d.total) ? "глубина резкости" : "резкость до бесконечности") + "</div>");
    h.push('<div class="line"><b>Резкость от</b><span>' + dist(d.near) + "</span></div>");
    h.push('<div class="line"><b>Резкость до</b><span>' + dist(d.far) + "</span></div>");
    h.push('<div class="line"><b>Перед объектом</b><span>' + dist(front) + "</span></div>");
    h.push('<div class="line"><b>За объектом</b><span>' + (isFinite(back) ? dist(back) : "бесконечность") + "</span></div>");
    h.push('<div class="line"><b>Гиперфокал</b><span>' + dist(d.H) + "</span></div>");
    h.push('<div class="line"><b>Кружок нерезкости</b><span>' + ru(st.c, 4) + " мм</span></div>");
    var inside = st.bg >= d.near && st.bg <= d.far;
    h.push('<div class="line"><b>Фон на ' + dist(st.bg) + "</b><span>" +
      (inside ? "внутри зоны резкости" : "размыт на " + ru(st.blurPx, st.blurPx < 10 ? 1 : 0) +
        " px (" + ru(st.blurMm, 3) + " мм)") + "</span></div>");
    var crit = strict() === "pixel"
      ? "два пикселя записи при " + st.res + " px по горизонтали"
      : "диагональ кадра / 1500";
    var note = st.fmt[0] + ", " + ru(st.f, 0) + " мм, f/" + ru(st.N, 1) +
      ", фокус на " + dist(st.s) + ". Критерий резкости: " + crit +
      ". Модель тонкой линзы: расчёт идеальной оптики, реальный объектив мягче.";
    h.push('<p class="doc-note">' + note + "</p>");
    paper.innerHTML = h.join("");
    drawScene(st);
  }

  /* ---------- схема зоны резкости (логарифмическая шкала 0.3 м … ∞) ---------- */
  var MIN = 300, MAX = 30000;                       /* мм */
  function pos(mm) {
    if (!isFinite(mm) || mm >= MAX) return 100;
    if (mm <= MIN) return 0;
    return (Math.log(mm) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN)) * 100;
  }

  function drawScene(st) {
    var box = document.getElementById("scene-bar");
    var d = st.d;
    var a = pos(d.near), b = pos(d.far);
    var html = '<i class="zone' + (isFinite(d.far) ? "" : " open") + '" style="left:' + a +
      "%;width:" + Math.max(1.8, b - a) + '%"></i>';   /* совсем узкую зону всё равно видно */
    html += '<i class="mark" style="left:' + pos(st.s) + '%"></i>';
    html += '<span class="cap" style="left:' + pos(st.s) + '%">фокус</span>';
    html += '<i class="mark bg" style="left:' + pos(st.bg) + '%"></i>';
    html += '<span class="cap bg" style="left:' + pos(st.bg) + '%">фон</span>';
    box.querySelector(".track").innerHTML = html;
    var inside = st.bg >= d.near && st.bg <= d.far;
    box.querySelector(".stext").innerHTML = "Резкость <b>" + dist(d.near) + " – " + dist(d.far) +
      "</b>, глубина <b>" + (isFinite(d.total) ? dist(d.total) : "до бесконечности") + "</b>. Фон на " +
      dist(st.bg) + (inside ? " попадает в зону резкости — он будет читаемым."
        : " размыт на <b>" + ru(st.blurPx, st.blurPx < 10 ? 1 : 0) + " px</b> вашей записи.");
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
  window.PobubnimGrip = { state: state };
})();
