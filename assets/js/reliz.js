/* ПОБУБНИМ — конструктор модельного релиза (instrumenty/modelnyj-reliz.html).
   Юр-основа: ст. 152.1 ГК РФ (согласие на обнародование изображения);
   для ребёнка подписывает законный представитель. Всё локально в браузере. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }
  function ruDate(iso) {
    if (!iso) return null;
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : null;
  }

  var MEDIA = { photo: "фотосъёмки", video: "видеосъёмки", both: "фото- и видеосъёмки" };
  var MEDIA_RES = { photo: "фотографические изображения", video: "видеозаписи", both: "фотографические изображения и видеозаписи" };

  function read() {
    return {
      model: radio("model"), media: radio("media"), terms: radio("terms"), scope: radio("scope"),
      term: radio("term"), years: val("f-years"),
      author: val("f-author"), modelName: val("f-model"), parent: val("f-parent"),
      date: ruDate(val("f-date")), place: val("f-place"), city: val("f-city"), pay: val("f-pay")
    };
  }

  function scopeText(s) {
    var base = "в портфолио, на личном сайте и в социальных сетях Автора, в том числе с указанием имени Автора";
    if (s.scope === "commercial") return base + ", а также в рекламных и иных коммерческих материалах Автора и его заказчиков";
    if (s.scope === "stock") return base + ", в рекламных и иных коммерческих материалах, а также путём размещения на фотостоках и передачи прав использования третьим лицам";
    return base;
  }

  function render() {
    var s = read();
    var child = s.model === "child";
    document.getElementById("fld-parent-wrap").hidden = !child;
    document.getElementById("lbl-model").textContent = child ? "Ребёнок — ФИО" : "Модель — ФИО";
    document.getElementById("flds-years").hidden = s.term !== "years";
    document.getElementById("hint-paid").hidden = s.terms !== "paid";
    var payFld = document.getElementById("f-pay");
    payFld.disabled = s.terms !== "paid";
    payFld.closest(".fld").style.opacity = s.terms === "paid" ? "" : "0.4";

    var media = MEDIA[s.media], res = MEDIA_RES[s.media];
    var signer = child ? bl(s.parent) : bl(s.modelName);
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>СОГЛАСИЕ НА СЪЁМКУ И ИСПОЛЬЗОВАНИЕ ИЗОБРАЖЕНИЯ<br>(МОДЕЛЬНЫЙ РЕЛИЗ)</h3>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(s.city) + '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');

    if (child) {
      h.push("<p>Я, " + signer + ", являясь законным представителем несовершеннолетнего " + bl(s.modelName) + " (далее — Модель), действуя в его интересах, даю согласие " + bl(s.author) + " (далее — Автор) на проведение " + media + " с участием Модели " + (s.date ? "«" + esc(s.date) + "»" : "«___»") + " " + (s.place ? "(" + esc(s.place) + ")" : "") + " и на использование созданных изображений на условиях настоящего Согласия (ст. 152.1 ГК РФ).</p>");
    } else {
      h.push("<p>Я, " + signer + " (далее — Модель), даю согласие " + bl(s.author) + " (далее — Автор) на проведение " + media + " с моим участием " + (s.date ? "«" + esc(s.date) + "»" : "«___»") + " " + (s.place ? "(" + esc(s.place) + ")" : "") + " и на использование созданных изображений на условиях настоящего Согласия (ст. 152.1 ГК РФ).</p>");
    }

    h.push("<h4>1. Предмет согласия</h4>");
    h.push("<p>1.1. Согласие распространяется на все " + res + " с участием Модели, созданные Автором в рамках указанной съёмки (далее — Материалы), включая их обнародование, обработку (цветокоррекция, ретушь, монтаж) и использование целиком или фрагментами.</p>");

    h.push("<h4>2. Объём использования</h4>");
    h.push("<p>2.1. Автор вправе использовать Материалы " + scopeText(s) + ".</p>");
    h.push("<p>2.2. Не допускается использование Материалов способами, порочащими честь, достоинство и деловую репутацию Модели, а также в контексте, очевидно оскорбительном для Модели.</p>");
    h.push("<p>2.3. Согласие действует " + (s.term === "years" ? "в течение " + bl(s.years) + " лет с даты подписания" : "без ограничения срока") + ", территория использования не ограничена.</p>");

    h.push("<h4>3. Условия</h4>");
    if (s.terms === "tfp") {
      h.push("<p>3.1. Съёмка проводится на условиях взаимозачёта (TFP): Модель участвует в съёмке безвозмездно, Автор передаёт Модели отобранные обработанные Материалы для личного некоммерческого использования с указанием авторства. Денежные расчёты между сторонами не производятся.</p>");
    } else if (s.terms === "paid") {
      h.push("<p>3.1. Модель позирует за плату: Автор выплачивает Модели вознаграждение в размере " + (s.pay ? esc((+s.pay).toLocaleString("ru-RU")) + " ₽" : BL + " ₽") + ". Подписание настоящего Согласия подтверждает получение вознаграждения" + (child ? " законным представителем Модели" : "") + " и факт позирования за плату (п. 1 ст. 152.1 ГК РФ).</p>");
    } else {
      h.push("<p>3.1. Съёмка проводится по заказу и за счёт Модели" + (child ? " (её законного представителя)" : "") + ". Настоящее Согласие определяет право Автора использовать отдельные Материалы в объёме пункта 2.1; во всём остальном отношения сторон регулируются договором на съёмку.</p>");
    }
    h.push("<p>3.2. Исключительное право на Материалы принадлежит Автору (ст. 1270 ГК РФ). Настоящее Согласие не передаёт Модели прав на Материалы, кроме прямо указанных.</p>");

    h.push("<h4>4. Отзыв согласия</h4>");
    h.push("<p>4.1. Согласие может быть отозвано письменным уведомлением Автора. Отзыв действует на будущее использование и не распространяется на публикации, состоявшиеся до получения уведомления" + (s.terms === "paid" ? "; при отзыве возмездного согласия Автор вправе требовать возмещения причинённых отзывом убытков" : "") + ".</p>");

    h.push('<table class="req"><tr><td><b>Автор</b>' + bl(s.author) + '<div class="sig">Подпись: ' + BL + "</div></td><td><b>" + (child ? "Законный представитель" : "Модель") + "</b>" + signer + (child ? "<br>за несовершеннолетнего " + bl(s.modelName) : "") + '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push('<p class="doc-note">Типовой шаблон собран конструктором pobubnim.github.io и не является юридической консультацией.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta); done();
    }
  });

  document.getElementById("btn-doc").addEventListener("click", function () {
    PobubnimDocx.download(paper, "modelnyj-reliz-pobubnim.docx");
  });

  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  render();
})();
