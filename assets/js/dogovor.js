/* ПОБУБНИМ — конструктор договоров и актов (konstruktor-dogovora.html).
   Всё локально: state читается из формы, документ рендерится в #paper.
   Каркас: договор возмездного оказания услуг, гл. 39 ГК РФ; отмена — ст. 782;
   портфолио — ст. 152.1; права — лицензия/отчуждение (ч. 4 ГК РФ). */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  if (!form || !paper) return;

  var tabD = document.getElementById("tab-dogovor");
  var tabA = document.getElementById("tab-akt");
  var mode = "dogovor";

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  var MARK_TL = '<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>';
  var MARK_BR = '<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>';
  function bl(v, pad) { return v ? esc(v) : (pad ? '<span class="blank">' + pad + "</span>" : BL); }
  function money(n) {
    if (!n || isNaN(+n)) return null;
    return (+n).toLocaleString("ru-RU");
  }

  /* сумма прописью живёт в общем модуле docx.js */
  function moneyFull(n) { return PobubnimDocx.moneyFull(n); }
  function val(id) { return (document.getElementById(id) || {}).value || ""; }
  function checked(id) { return !!(document.getElementById(id) || {}).checked; }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }
  function ruDate(iso) {
    if (!iso) return null;
    var p = iso.split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : null;
  }

  function read() {
    var kindSel = document.getElementById("f-kind");
    var kind = kindSel.value || val("f-kind-free");
    return {
      executor: radio("executor"), client: radio("client"), service: radio("service"),
      kind: kind, date: ruDate(val("f-date")), hours: val("f-hours"), place: val("f-place"),
      overtime: money(val("f-overtime")), shots: val("f-shots"),
      pdays: val("f-alldays"), runtime: val("f-runtime"), vdays: val("f-vdays"),
      teaser: checked("f-teaser"), vertical: checked("f-vertical"), revisions: checked("f-revisions"),
      raw: radio("raw") === "yes", price: val("f-price"),
      bron: radio("bron"), bronSum: val("f-bron-sum"),
      paywhen: val("f-paywhen"), rights: radio("rights"), portfolio: radio("portfolio") === "yes",
      city: val("f-city"), num: val("f-num"),
      execName: val("f-exec-name"), execPhone: val("f-exec-phone"), execInn: val("f-exec-inn"),
      clientName: val("f-client-name"), clientPhone: val("f-client-phone")
    };
  }

  /* ---------- текстовые кубики ---------- */
  var SVC = {
    photo: { subject: "фотосъёмке", isShoot: true },
    video: { subject: "видеосъёмке и созданию видеоролика", isShoot: true },
    both: { subject: "фото- и видеосъёмке", isShoot: true },
    edit: { subject: "монтажу видеоматериалов, предоставленных Заказчиком", isShoot: false },
    color: { subject: "цветокоррекции видеоматериалов, предоставленных Заказчиком", isShoot: false }
  };

  function execIntro(s) {
    var nm = bl(s.execName);
    switch (s.executor) {
      case "selfemp": return nm + ", применяющий(ая) специальный налоговый режим «Налог на профессиональный доход» (самозанятый), ИНН " + bl(s.execInn);
      case "ip": return "Индивидуальный предприниматель " + nm + ", ИНН " + bl(s.execInn);
      case "ooo": return nm + ", ИНН " + bl(s.execInn) + ", в лице " + BL + ", действующего на основании Устава";
      default: return nm + " (гражданин РФ)";
    }
  }
  function clientIntro(s) {
    var nm = bl(s.clientName);
    switch (s.client) {
      case "ip": return "Индивидуальный предприниматель " + nm;
      case "ooo": return nm + ", в лице " + BL + ", действующего на основании Устава";
      default: return nm;
    }
  }

  function resultItems(s) {
    var out = [];
    if (s.service === "photo" || s.service === "both") {
      out.push("не менее " + bl(s.shots, "&nbsp;&nbsp;&nbsp;") + " обработанных фотографий в электронном виде (цветокоррекция и ретушь на усмотрение Исполнителя в его авторском стиле)");
    }
    if (s.service === "video" || s.service === "both") {
      out.push("смонтированный видеоролик хронометражом " + bl(s.runtime, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + " с цветокоррекцией и звуковым оформлением");
      if (s.teaser) out.push("тизер для социальных сетей длительностью до 1 минуты");
      if (s.vertical) out.push("вертикальные версии ролика для социальных сетей");
    }
    if (s.service === "edit") out.push("смонтированный видеоролик хронометражом " + bl(s.runtime, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + " из материалов Заказчика");
    if (s.service === "color") out.push("видеоматериалы Заказчика с выполненной цветокоррекцией");
    return out;
  }

  function rightsClause(s) {
    switch (s.rights) {
      case "commercial":
        return "Исполнитель предоставляет Заказчику неисключительную лицензию на использование Материалов в коммерческих целях (реклама, сайт, социальные сети и иные каналы Заказчика) без ограничения срока и территории. Вознаграждение за лицензию включено в цену Договора. Исключительное право на Материалы сохраняется за Исполнителем.";
      case "full":
        return "Исключительное право на Материалы переходит к Заказчику в полном объёме с момента полной оплаты по Договору. За Исполнителем сохраняется право авторства и право на имя.";
      default:
        return "Исключительное право на Материалы сохраняется за Исполнителем. Заказчику предоставляется право использования Материалов в личных некоммерческих целях без ограничения срока и территории.";
    }
  }

  /* ---------- договор ---------- */
  function renderDogovor(s) {
    var svc = SVC[s.service];
    var priceF = moneyFull(s.price);
    var bronF = moneyFull(s.bronSum);
    var payRest = s.paywhen === "day" ? "в день съёмки, до её начала" : "в течение 3 (трёх) дней после передачи Материалов";
    var n = 0, h = [];
    function sec(title) { n++; h.push("<h4>" + n + ". " + title + "</h4>"); return n; }
    function p(txt) { h.push("<p>" + txt + "</p>"); }

    h.push(MARK_TL);
    h.push("<h3>ДОГОВОР ВОЗМЕЗДНОГО ОКАЗАНИЯ УСЛУГ № " + bl(s.num, "&nbsp;&nbsp;&nbsp;&nbsp;") + "</h3>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(s.city, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');
    p(execIntro(s) + ", именуемый(ая) в дальнейшем «Исполнитель», с одной стороны, и " + clientIntro(s) + ", именуемый(ая) в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем.");

    sec("Предмет договора");
    p("1.1. Исполнитель обязуется оказать Заказчику услуги по " + svc.subject + (s.kind ? " (" + esc(s.kind) + ")" : "") + " (далее — Услуги), а Заказчик обязуется принять Услуги и оплатить их в порядке и сроки, установленные настоящим Договором.");
    if (svc.isShoot) {
      p("1.2. Съёмка проводится «" + (s.date ? esc(s.date) : "___") + "» " + (s.hours ? esc(s.hours) : "с ____ до ____") + " по адресу: " + bl(s.place, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + ".");
      p("1.3. Работа сверх согласованного времени возможна по предварительному согласованию Сторон и оплачивается из расчёта " + (s.overtime ? esc(s.overtime) : BL) + " ₽ за каждый начатый час.");
    } else {
      p("1.2. Заказчик передаёт Исполнителю исходные видеоматериалы в согласованном Сторонами виде (облачная ссылка или носитель) в течение 3 (трёх) дней с даты подписания Договора. Срок оказания Услуг исчисляется с момента передачи материалов.");
    }

    sec("Результат и порядок передачи");
    var items = resultItems(s);
    p("2.1. По результатам оказания Услуг Исполнитель передаёт Заказчику (далее — Материалы): " + items.join("; ") + ".");
    var days = s.service === "photo" ? s.pdays : (s.vdays || s.pdays);
    p("2.2. Срок передачи Материалов — не позднее " + bl(days, "&nbsp;&nbsp;&nbsp;") + " календарных дней " + (svc.isShoot ? "с даты съёмки" : "с даты передачи исходных материалов") + ". Передача осуществляется облачной ссылкой; ссылка действительна не менее 30 (тридцати) дней, в течение которых Заказчик обязан сохранить Материалы себе.");
    if (s.service !== "photo" && s.revisions) {
      p("2.3. В стоимость включены два раунда правок по замечаниям Заказчика, не меняющих согласованную концепцию. Последующие правки и изменение концепции оплачиваются дополнительно по согласованию Сторон.");
    }
    var pRaw = (s.service !== "photo" && s.revisions ? "2.4" : "2.3") + ". ";
    if (svc.isShoot) {
      p(pRaw + "Исходные материалы (" + (s.service === "photo" ? "RAW-файлы" : "необработанные исходники") + ") " + (s.raw ? "передаются Заказчику вместе с Материалами" : "Заказчику не передаются и остаются у Исполнителя") + ". Исполнитель хранит исходные материалы не менее 6 (шести) месяцев с даты передачи Материалов.");
    } else {
      p(pRaw + "Проектные файлы (проект монтажа и настройки цветокоррекции) " + (s.raw ? "передаются Заказчику вместе с Материалами" : "Заказчику не передаются") + ". Переданные Заказчиком исходные материалы Исполнитель хранит не менее 30 (тридцати) дней после передачи результата, после чего удаляет по требованию Заказчика.");
    }

    sec("Стоимость и порядок расчётов");
    p("3.1. Стоимость Услуг составляет " + (priceF ? priceF : BL + " ₽") + (s.executor === "selfemp" ? ". НДС не облагается: Исполнитель применяет налог на профессиональный доход" : s.executor === "fiz" ? ". НДС не облагается" : "") + ".");
    if (s.bron === "avans") {
      p("3.2. При подписании Договора Заказчик вносит аванс в размере " + (bronF ? bronF : BL + " ₽") + ". Оставшаяся часть стоимости Услуг оплачивается " + payRest + ".");
    } else if (s.bron === "zadatok") {
      p("3.2. При подписании Договора Заказчик передаёт Исполнителю задаток в размере " + (bronF ? bronF : BL + " ₽") + " — в счёт причитающихся с Заказчика платежей по Договору, в доказательство заключения Договора и в обеспечение его исполнения. Стороны прямо согласовали, что указанная сумма является именно задатком в смысле статей 380 и 381 ГК РФ, а не авансом, и известны последствия, установленные статьёй 381 ГК РФ (пункт 4.2 Договора). При надлежащем исполнении Договора задаток засчитывается в счёт стоимости Услуг.");
      p("3.3. Оставшаяся часть стоимости Услуг оплачивается " + payRest + ".");
    } else {
      p("3.2. Оплата производится " + payRest + " в полном объёме.");
    }
    var p3n = s.bron === "zadatok" ? "3.4" : "3.3";
    if (s.executor === "selfemp") {
      p(p3n + ". После каждой оплаты Исполнитель передаёт Заказчику чек, сформированный в приложении «Мой налог». В случае снятия с учёта в качестве плательщика НПД Исполнитель уведомляет Заказчика в течение 3 (трёх) рабочих дней.");
    } else if (s.executor === "fiz" && s.client !== "fiz") {
      p(p3n + ". Заказчик выступает налоговым агентом: исчисляет и удерживает НДФЛ из вознаграждения Исполнителя и уплачивает страховые взносы в соответствии с законодательством РФ.");
    }

    sec("Перенос и отмена");
    if (svc.isShoot) {
      p("4.1. Заказчик вправе один раз перенести дату съёмки на любую свободную у Исполнителя дату в пределах 6 (шести) месяцев, уведомив Исполнителя не менее чем за 14 (четырнадцать) дней, — без каких-либо удержаний.");
      if (s.bron === "zadatok") {
        p("4.2. Каждая из Сторон вправе отказаться от исполнения Договора (ст. 782 ГК РФ). Последствия для задатка Стороны определили по ст. 381 ГК РФ: если Договор не исполнен по обстоятельствам, за которые отвечает Заказчик, задаток остаётся у Исполнителя; если по обстоятельствам, за которые отвечает Исполнитель, — он уплачивает Заказчику двойную сумму задатка в течение 5 (пяти) рабочих дней. Суммы, уплаченные сверх задатка, в обоих случаях возвращаются Заказчику.");
        p("4.3. При прекращении Договора по соглашению Сторон до начала его исполнения либо вследствие невозможности исполнения (ст. 416 ГК РФ) задаток возвращается Заказчику в одинарном размере.");
      } else if (s.bron === "avans") {
        p("4.2. Каждая из Сторон вправе в любое время отказаться от исполнения Договора (ст. 782 ГК РФ). При отказе Заказчика он возмещает Исполнителю фактически понесённые к моменту отказа и документально подтверждённые расходы, связанные с исполнением Договора; остальная часть аванса возвращается Заказчику в течение 5 (пяти) рабочих дней.");
        p("4.3. При отказе Исполнителя по причинам, не связанным с нарушением Договора Заказчиком, аванс возвращается полностью в течение 5 (пяти) рабочих дней.");
      } else {
        p("4.2. Каждая из Сторон вправе в любое время отказаться от исполнения Договора (ст. 782 ГК РФ). При отказе Заказчика он оплачивает фактически оказанную часть Услуг и возмещает Исполнителю фактически понесённые, документально подтверждённые расходы.");
      }
    } else {
      p("4.1. Каждая из Сторон вправе отказаться от исполнения Договора (ст. 782 ГК РФ). При отказе Заказчика после начала работ Заказчик оплачивает фактически выполненную часть работ пропорционально готовности, согласованной Сторонами.");
      if (s.bron === "zadatok") {
        p("4.2. Последствия для задатка Стороны определили по ст. 381 ГК РФ: если Договор не исполнен по обстоятельствам, за которые отвечает Заказчик, задаток остаётся у Исполнителя; если по обстоятельствам, за которые отвечает Исполнитель, — он уплачивает Заказчику двойную сумму задатка. При прекращении Договора по соглашению Сторон либо вследствие невозможности исполнения задаток возвращается.");
        p("4.3. При отказе Исполнителя полученная оплата за невыполненную часть работ возвращается в течение 5 (пяти) рабочих дней.");
      } else {
        p("4.2. При отказе Исполнителя полученная оплата за невыполненную часть работ возвращается в течение 5 (пяти) рабочих дней.");
      }
    }

    sec("Невозможность исполнения и форс-мажор");
    if (svc.isShoot) {
      p("5.1. Если Исполнитель не может оказать Услуги лично (болезнь, иные уважительные причины), он по согласованию с Заказчиком либо привлекает специалиста сопоставимого уровня (с портфолио которого Заказчик вправе ознакомиться), либо возвращает предоплату в полном объёме в течение 5 (пяти) рабочих дней.");
      p("5.2. Исполнитель обеспечивает дублирование записи: съёмка ведётся с резервированием носителей, насколько это технически возможно.");
    }
    p((svc.isShoot ? "5.3" : "5.1") + ". Стороны освобождаются от ответственности за неисполнение обязательств, вызванное обстоятельствами непреодолимой силы. Сроки исполнения сдвигаются соразмерно действию таких обстоятельств.");

    sec("Права на материалы");
    p("6.1. " + rightsClause(s));
    p("6.2. " + (s.portfolio
      ? "Заказчик даёт согласие на использование Исполнителем отдельных Материалов в портфолио, на сайте и в социальных сетях Исполнителя, включая изображения Заказчика и участников съёмки (ст. 152.1 ГК РФ). Согласие может быть отозвано письменным уведомлением."
      : "Исполнитель не вправе публиковать Материалы или их фрагменты, в том числе в портфолио, без предварительного письменного согласия Заказчика."));
    if (s.service === "video" || s.service === "both" || s.service === "edit") {
      p("6.3. Музыкальное сопровождение подбирается Исполнителем из библиотек, разрешённых к использованию, либо предоставляется Заказчиком — в этом случае ответственность за права на предоставленные фонограммы несёт Заказчик.");
    }

    sec("Ответственность");
    p("7.1. Совокупная ответственность Исполнителя по Договору ограничена суммой, фактически уплаченной Заказчиком.");
    p("7.2. В случае полной утраты отснятого (переданного) материала до передачи Заказчику по вине Исполнителя Исполнитель возвращает всю полученную оплату в течение 5 (пяти) рабочих дней; Стороны вправе согласовать повторную съёмку.");

    sec("Заключительные положения");
    p("8.1. Договор вступает в силу с момента подписания и действует до полного исполнения обязательств. Изменения оформляются письменно; юридически значимой признаётся переписка Сторон по указанным в Договоре телефонам и адресам, в том числе в мессенджерах.");
    p("8.2. Споры решаются переговорами, при недостижении согласия — в суде в соответствии с законодательством РФ.");
    p("8.3. Договор составлен в двух экземплярах равной юридической силы, по одному для каждой из Сторон.");

    h.push('<table class="req"><tr><td><b>Исполнитель</b>' + execIntro(s) + "<br>Тел.: " + bl(s.execPhone) + '<div class="sig">Подпись: ' + BL + "</div></td><td><b>Заказчик</b>" + clientIntro(s) + "<br>Тел.: " + bl(s.clientPhone) + '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push('<p class="doc-note">Типовой шаблон собран конструктором pobubnim.github.io и не является юридической консультацией.</p>');
    h.push(MARK_BR);
    return h.join("");
  }

  /* ---------- акт ---------- */
  function renderAkt(s) {
    var priceF = moneyFull(s.price);
    var h = [];
    h.push(MARK_TL);
    h.push("<h3>АКТ ОБ ОКАЗАННЫХ УСЛУГАХ</h3>");
    h.push('<p style="text-align:center">к Договору возмездного оказания услуг № ' + bl(s.num, "&nbsp;&nbsp;&nbsp;&nbsp;") + " от «___» ____________ 20___ г.</p>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(s.city, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;") + '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');
    h.push("<p>" + execIntro(s) + " («Исполнитель») и " + clientIntro(s) + " («Заказчик») составили настоящий Акт о нижеследующем.</p>");
    h.push("<p>1. Исполнитель оказал, а Заказчик принял следующие услуги: " + resultItems(s).join("; ") + ".</p>");
    h.push("<p>2. Услуги оказаны в полном объёме и в согласованный срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.</p>");
    h.push("<p>3. Стоимость услуг составляет " + (priceF ? priceF : BL + " ₽") + (s.executor === "selfemp" ? ", НДС не облагается (НПД)" : "") + ". Оплата произведена " + (s.paywhen === "day" ? "полностью" : "в размере " + BL + "; остаток подлежит оплате в порядке, установленном Договором") + ".</p>");
    h.push("<p>4. Настоящий Акт составлен в двух экземплярах, по одному для каждой из Сторон.</p>");
    h.push('<table class="req"><tr><td><b>Исполнитель</b>' + bl(s.execName) + '<div class="sig">Подпись: ' + BL + "</div></td><td><b>Заказчик</b>" + bl(s.clientName) + '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push(MARK_BR);
    return h.join("");
  }

  /* ---------- видимость секций и подсказок ---------- */
  function syncVisibility(s) {
    var shoot = SVC[s.service].isShoot;
    document.getElementById("sec-shoot").hidden = !shoot;
    var isPhoto = s.service === "photo" || s.service === "both";
    var isVideo = s.service !== "photo";
    document.getElementById("flds-photo").hidden = !isPhoto;
    document.getElementById("flds-video").hidden = !isVideo;
    /* при «фото + видео» срок сдачи один — из видео-блока, дубль поля прячем */
    document.getElementById("f-alldays").closest(".fld").hidden = s.service === "both";
    document.getElementById("hint-fiz").hidden = !(s.executor === "fiz" && s.client !== "fiz");
    document.getElementById("flds-bron").hidden = s.bron === "none";
    document.getElementById("hint-avans").hidden = s.bron !== "avans";
    document.getElementById("hint-zadatok").hidden = s.bron !== "zadatok";
    document.getElementById("lbl-bron-sum").textContent = s.bron === "zadatok" ? "Сумма задатка, ₽" : "Сумма аванса, ₽";
    var kindSel = document.getElementById("f-kind");
    document.getElementById("f-kind-free-wrap").hidden = kindSel.value !== "";
  }

  function render() {
    var s = read();
    syncVisibility(s);
    paper.innerHTML = mode === "dogovor" ? renderDogovor(s) : renderAkt(s);
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);

  function setMode(m) {
    mode = m;
    tabD.classList.toggle("on", m === "dogovor");
    tabA.classList.toggle("on", m === "akt");
    tabD.setAttribute("aria-selected", m === "dogovor");
    tabA.setAttribute("aria-selected", m === "akt");
    render();
  }
  tabD.addEventListener("click", function () { setMode("dogovor"); });
  tabA.addEventListener("click", function () { setMode("akt"); });

  /* ---------- действия ---------- */
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
    PobubnimDocx.download(paper, (mode === "dogovor" ? "dogovor" : "akt") + "-pobubnim.docx");
  });

  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  render();
})();
