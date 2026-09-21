/* ПОБУБНИМ — конструктор договора аренды фото- и видеотехники
   (instrumenty/dogovor-arendy-tehniki.html).

   Юр-основа: гл. 34 ГК РФ. Общая аренда — §1 (ст. 606-625), ПРОКАТ — §2
   (ст. 626-631). Разница не косметическая: у проката срок до года, ремонт на
   арендодателе, субаренда запрещена законом, а долг взыскивается по
   исполнительной надписи нотариуса. Поэтому вид договора выбирается первым
   и меняет текст, а не только заголовок.

   ЧТО ВЫЯСНИЛА СВЕРКА 21.09 (аудит по тексту закона, а не по памяти). Прокат —
   это договор с ПОТРЕБИТЕЛЕМ, значит работает Закон «О защите прав
   потребителей». Его часть 2 статьи 16 объявляет ничтожными условия, которые
   ограничивают выбор подсудности (п. 2) и навязывают обязательный досудебный
   порядок (п. 11). Поэтому оговорка о спорах в прокате ДРУГАЯ, чем в аренде:
   перенести туда пункт «суд по месту арендодателя» — значит вписать в договор
   два ничтожных условия.

   Ключевое требование ст. 607: объект аренды должен быть определён так, чтобы
   его можно было установить. Для техники это серийный номер. Опись без номеров
   делает договор незаключённым — отсюда колонка «серийный номер» в позициях и
   предупреждение в форме, а не мелкий шрифт.

   Всё считается и собирается в браузере, ничего никуда не уходит. */

(function () {
  var form = document.getElementById("cfg");
  var paper = document.getElementById("paper");
  var rowsEl = document.getElementById("rows");
  if (!form || !paper || !rowsEl) return;

  var tabD = document.getElementById("tab-dogovor");
  var tabA = document.getElementById("tab-akt");
  var mode = "dogovor";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var BL = '<span class="blank">&nbsp;</span>';
  function bl(v) { return v ? esc(v) : BL; }
  function money(n) { return (+n || 0).toLocaleString("ru-RU"); }
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

  /* ---------- позиции описи ---------- */
  var PRESETS = [
    ["Камера", "камера"],
    ["Объектив", "объектив"],
    ["Свет", "прибор"],
    ["Штатив / стойка", "штатив"],
    ["Стабилизатор", "стабилизатор"],
    ["Монитор / рекордер", "монитор"],
    ["Микрофон / рекордер звука", "звук"],
    ["Карта памяти / накопитель", "носитель"],
    ["Аккумулятор / питание", "питание"],
    ["+ Своя позиция", ""]
  ];

  var rows = [{ name: "", sn: "", value: "", rate: "", qty: 1 }];

  document.getElementById("chips").innerHTML = PRESETS.map(function (p, i) {
    return '<button type="button" class="chip" data-i="' + i + '">' + esc(p[0]) + "</button>";
  }).join("");
  document.getElementById("chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var p = PRESETS[+b.dataset.i];
    rows.push({ name: p[0] === "+ Своя позиция" ? "" : p[0], sn: "", value: "", rate: "", qty: 1 });
    drawRows();
    render();
    var last = rowsEl.lastElementChild;
    if (last) last.querySelector(".name").focus();
  });

  function drawRows() {
    rowsEl.innerHTML = rows.map(function (r, i) {
      return '<div class="rowa" data-i="' + i + '">' +
        '<input class="name" type="text" value="' + esc(r.name) + '" placeholder="Что именно: марка и модель" aria-label="Наименование оборудования">' +
        '<input class="sn" type="text" value="' + esc(r.sn) + '" placeholder="Серийный номер" aria-label="Серийный номер">' +
        '<input class="qty" type="number" min="1" step="1" value="' + esc(r.qty) + '" aria-label="Количество">' +
        '<input class="value" type="number" min="0" step="1000" value="' + esc(r.value) + '" placeholder="Оценка" aria-label="Оценочная стоимость">' +
        '<input class="rate" type="number" min="0" step="100" value="' + esc(r.rate) + '" placeholder="₽/смена" aria-label="Ставка за смену">' +
        '<button type="button" class="del" aria-label="Удалить позицию">✕</button></div>';
    }).join("");
  }
  rowsEl.addEventListener("input", function (e) {
    var w = e.target.closest(".rowa");
    if (!w) return;
    var r = rows[+w.dataset.i];
    r.name = w.querySelector(".name").value;
    r.sn = w.querySelector(".sn").value;
    r.qty = w.querySelector(".qty").value;
    r.value = w.querySelector(".value").value;
    r.rate = w.querySelector(".rate").value;
    render();
  });
  rowsEl.addEventListener("click", function (e) {
    if (!e.target.closest(".del")) return;
    rows.splice(+e.target.closest(".rowa").dataset.i, 1);
    if (!rows.length) rows.push({ name: "", sn: "", value: "", rate: "", qty: 1 });
    drawRows();
    render();
  });

  /* ---------- расчёт ---------- */
  function shiftWord(n) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return "смен";
    if (b > 1 && b < 5) return "смены";
    if (b === 1) return "смена";
    return "смен";
  }
  function dayWord(n) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return "дней";
    if (b > 1 && b < 5) return "дня";
    if (b === 1) return "день";
    return "дней";
  }

  function shiftsFromDates() {
    var f = val("f-from"), t = val("f-to");
    if (!f || !t) return null;
    var d = Math.round((new Date(t) - new Date(f)) / 86400000) + 1;
    return d >= 1 ? Math.min(d, 365) : null;
  }

  function calc() {
    var items = rows.filter(function (r) { return r.name || +r.rate || +r.value; }).map(function (r) {
      var qty = Math.max(1, +r.qty || 1);
      return {
        name: r.name, sn: r.sn, qty: qty,
        value: (+r.value || 0) * qty,
        rate: (+r.rate || 0) * qty
      };
    });
    var perShift = items.reduce(function (a, i) { return a + i.rate; }, 0);
    var totalValue = items.reduce(function (a, i) { return a + i.value; }, 0);
    var auto = shiftsFromDates();
    var shifts = auto !== null ? auto : Math.max(1, +val("f-shifts") || 1);
    var half = radio("shift") === "half";
    /* полусмена: шесть часов идут за 70% суточной ставки — правило рынка,
       скидка за срок на неё не накладывается, иначе двойное снижение */
    var rate = half ? Math.round(perShift * 0.7) : perShift;
    var full = rate * shifts;
    var disc = half ? 0 : Math.min(90, Math.max(0, +val("f-disc") || 0));
    var discSum = Math.round(full * disc / 100);
    var rent = full - discSum;
    var depositMode = radio("deposit");
    var deposit = depositMode === "sum" ? (+val("f-deposit") || 0)
      : depositMode === "value" ? totalValue : 0;
    return {
      items: items, perShift: perShift, totalValue: totalValue, shifts: shifts,
      half: half, rate: rate, full: full, disc: disc, discSum: discSum, rent: rent,
      deposit: deposit, depositMode: depositMode, auto: auto !== null
    };
  }

  /* ---------- стороны ---------- */
  function party(pref) {
    var kind = radio(pref + "kind");
    var name = val("f-" + pref + "name");
    var inn = val("f-" + pref + "inn");
    var doc = val("f-" + pref + "doc");
    var head = { person: "", selfemp: "самозанятый (налог на профессиональный доход), ИНН ",
                 ip: "Индивидуальный предприниматель ", org: "" };
    var s;
    if (kind === "ip") s = "Индивидуальный предприниматель " + bl(name) + ", ИНН " + bl(inn);
    else if (kind === "org") s = bl(name) + ", ИНН " + bl(inn) + ", в лице " + bl(doc) + ", действующего на основании Устава";
    else if (kind === "selfemp") s = bl(name) + ", самозанятый (налог на профессиональный доход), ИНН " + bl(inn);
    else s = bl(name) + ", паспорт " + bl(doc);
    return s;
  }
  function partyShort(pref) {
    return bl(val("f-" + pref + "name"));
  }

  /* ---------- опись ---------- */
  function itemsTable(d, withValue) {
    var h = ['<table class="items" data-cols="44,20,10,26"><tr><th>Наименование</th><th>Серийный №</th><th>Кол-во</th><th>' +
      (withValue ? "Оценка, ₽" : "Ставка, ₽/смена") + "</th></tr>"];
    d.items.forEach(function (i) {
      h.push("<tr><td>" + bl(i.name) + "</td><td>" + bl(i.sn) + "</td><td>" + i.qty +
        "</td><td>" + (withValue ? money(i.value) : money(i.rate)) + "</td></tr>");
    });
    if (!d.items.length) h.push("<tr><td>" + BL + "</td><td>" + BL + "</td><td>" + BL + "</td><td>" + BL + "</td></tr>");
    h.push("</table>");
    return h.join("");
  }

  /* ---------- договор ---------- */
  function renderDogovor(d) {
    var prokat = radio("vid") === "prokat";
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h2>ДОГОВОР " + (prokat ? "ПРОКАТА" : "АРЕНДЫ") + "<br>фото- и видеооборудования № " + bl(val("f-num")) + "</h2>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(val("f-city")) +
      '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');

    h.push("<p>" + party("a") + ", именуемый далее «" + (prokat ? "Арендодатель" : "Арендодатель") +
      "», с одной стороны, и " + party("b") + ", именуемый далее «Арендатор», с другой стороны, заключили настоящий договор о нижеследующем.</p>");

    h.push("<h3>1. Предмет договора</h3>");
    h.push("<p>1.1. Арендодатель передаёт Арендатору во временное владение и пользование фото- и видеооборудование (далее — Оборудование), перечисленное в описи ниже, а Арендатор обязуется принять Оборудование, своевременно вносить плату и вернуть его в исправном состоянии" +
      (prokat ? " (ст. 626 ГК РФ)" : " (ст. 606 ГК РФ)") + ".</p>");
    h.push("<p>1.2. Состав Оборудования, его серийные номера и оценочная стоимость:</p>");
    h.push(itemsTable(d, true));
    h.push('<div class="line"><span>Общая оценочная стоимость Оборудования</span><span><b>' +
      (PobubnimDocx.moneyFull(d.totalValue) || BL + " рублей") + "</b></span></div>");
    h.push("<p>1.3. Оценочная стоимость применяется для расчётов при утрате или повреждении Оборудования и не является его рыночной ценой.</p>");
    if (prokat) {
      /* Абзац второй п. 1 ст. 626 говорит «используется для потребительских
         целей, ЕСЛИ ИНОЕ НЕ ПРЕДУСМОТРЕНО ДОГОВОРОМ». Скачанные образцы
         пишут «для потребительских целей» жёстко — и документ начинает
         врать, как только технику берут на коммерческую съёмку. Пользуемся
         оговоркой, которую даёт сам закон. */
      h.push("<p>1.4. Оборудование передаётся для использования по прямому назначению: проведение фото- и видеосъёмки. Стороны согласовали, что использование Оборудования не ограничивается потребительскими целями (абзац второй пункта 1 статьи 626 ГК РФ). Арендодатель в присутствии Арендатора проверяет исправность Оборудования и знакомит Арендатора с правилами его эксплуатации (ст. 628 ГК РФ).</p>");
    } else {
      h.push("<p>1.4. Оборудование передаётся для использования по прямому назначению: проведение фото- и видеосъёмки. Использование Оборудования иным способом не допускается (ст. 615 ГК РФ).</p>");
    }

    h.push("<h3>2. Срок аренды</h3>");
    var from = ruDate(val("f-from")), to = ruDate(val("f-to"));
    h.push("<p>2.1. Срок аренды: с " + (from ? esc(from) : BL) + " по " + (to ? esc(to) : BL) +
      ", что составляет " + d.shifts + " " + shiftWord(d.shifts) + ".</p>");
    h.push("<p>2.2. Смена — сутки с момента фактической передачи Оборудования по акту." +
      (d.half ? " Стороны согласовали неполную смену продолжительностью до 6 (шести) часов, оплачиваемую в размере 70% суточной ставки." : "") + "</p>");
    if (prokat) {
      h.push("<p>2.3. Договор проката заключается на срок до одного года. Правила о возобновлении договора на неопределённый срок и о преимущественном праве на заключение договора на новый срок к настоящему договору не применяются (ст. 627 ГК РФ).</p>");
      /* Две нормы, а не одна: право отказаться — п. 3 ст. 627, возврат части
         платы при досрочном возврате — п. 2 ст. 630. Ставить под обеими
         ст. 627 (как делают образцы) — ошибка в ссылке. */
      h.push("<p>2.4. Арендатор вправе отказаться от договора в любое время, письменно предупредив Арендодателя не менее чем за десять дней (п. 3 ст. 627 ГК РФ). При досрочном возврате Оборудования Арендодатель возвращает соответствующую часть полученной арендной платы, исчисляя её со дня, следующего за днём фактического возврата (п. 2 ст. 630 ГК РФ).</p>");
    } else {
      h.push("<p>2.3. Срок аренды может быть продлён соглашением сторон. Продление оформляется письменно и оплачивается по ставкам настоящего договора.</p>");
    }

    h.push("<h3>3. Арендная плата и расчёты</h3>");
    h.push(itemsTable(d, false));
    h.push('<div class="line"><span>Ставка за смену' + (d.half ? " (неполная смена, 70%)" : "") + "</span><span>" + money(d.rate) + " ₽</span></div>");
    h.push('<div class="line"><span>' + d.shifts + " " + shiftWord(d.shifts) + "</span><span>" + money(d.full) + " ₽</span></div>");
    if (d.disc) h.push('<div class="line"><span>Скидка за срок ' + d.disc + "%</span><span>−" + money(d.discSum) + " ₽</span></div>");
    h.push('<div class="line grand"><b>Итого арендная плата</b><span><b>' +
      (PobubnimDocx.moneyFull(d.rent) || BL + " рублей") + "</b></span></div>");
    h.push("<p>3.1. Арендная плата за весь срок составляет " + (PobubnimDocx.moneyFull(d.rent) || BL + " рублей") +
      " и вносится " + (radio("pay") === "prepaid" ? "в полном объёме до передачи Оборудования" :
        radio("pay") === "half" ? "в размере 50% до передачи Оборудования, остаток — в день возврата" :
        "в день возврата Оборудования") + ".</p>");
    /* дальше пункты раздела 3 появляются по условиям, поэтому нумеруем счётчиком */
    var n3 = 1;
    function p3(text) { n3++; h.push("<p>3." + n3 + ". " + text + "</p>"); }
    if (radio("akind") === "selfemp") p3("НДС не облагается: Арендодатель применяет налог на профессиональный доход. После оплаты Арендатору передаётся чек из приложения «Мой налог».");
    else if (radio("akind") === "person") p3("НДС не облагается.");
    /* Сильная сторона проката, которой нет ни в одном скачанном образце:
       долг по плате взыскивается БЕЗ СУДА, по исполнительной надписи
       нотариуса (п. 3 ст. 630). Пункт работает, только если он написан. */
    if (prokat) p3("Взыскание с Арендатора задолженности по арендной плате производится в бесспорном порядке на основе исполнительной надписи нотариуса (п. 3 ст. 630 ГК РФ).");

    h.push("<h3>4. Обеспечительный платёж</h3>");
    if (d.depositMode === "none") {
      h.push("<p>4.1. Обеспечительный платёж по настоящему договору не вносится. Ответственность Арендатора за сохранность Оборудования определяется разделом 6.</p>");
    } else {
      h.push("<p>4.1. Арендатор вносит Арендодателю обеспечительный платёж в размере " +
        (d.deposit ? esc(money(d.deposit)) + " ₽" : BL + " ₽") +
        (d.depositMode === "value" ? " (равен общей оценочной стоимости Оборудования)" : "") +
        " в обеспечение исполнения обязательств по возврату Оборудования и внесению платы (ст. 381.1 ГК РФ).</p>");
      h.push("<p>4.2. Обеспечительный платёж возвращается Арендатору в течение трёх рабочих дней после возврата Оборудования в исправном и комплектном состоянии. При повреждении, утрате или просрочке возврата Арендодатель удерживает из платежа сумму убытков и неустойки, а остаток возвращает.</p>");
      h.push("<p>4.3. Обеспечительный платёж не является задатком и не засчитывается в счёт арендной платы, если стороны не согласовали иное письменно.</p>");
    }

    h.push("<h3>5. Передача и возврат</h3>");
    h.push("<p>5.1. Оборудование передаётся и возвращается по акту приёма-передачи, который является неотъемлемой частью настоящего договора. В акте фиксируются комплектность, внешнее состояние и работоспособность каждой позиции.</p>");
    h.push("<p>5.2. Претензии к состоянию и комплектности Оборудования заявляются в момент передачи и вносятся в акт. Оборудование, принятое без замечаний в акте, считается переданным исправным и комплектным.</p>");
    var logi = radio("logi");
    h.push("<p>5.3. " + (logi === "self" ? "Получение и возврат Оборудования производятся силами и за счёт Арендатора по адресу Арендодателя." :
      logi === "drop" ? "Арендодатель доставляет Оборудование Арендатору; возврат производится силами и за счёт Арендатора." :
      "Доставка Оборудования Арендатору и его возврат производятся силами Арендодателя. Стоимость доставки согласована сторонами отдельно.") + "</p>");
    var penalty = +val("f-penalty") || 0;
    h.push("<p>5.4. При невозврате Оборудования в срок Арендодатель вправе требовать внесения арендной платы за всё время просрочки (ст. 622 ГК РФ)" +
      (penalty ? ", а также неустойку в размере " + penalty + (penalty === 1 ? "-кратной" : "-кратной") + " суточной ставки за каждые сутки просрочки" : "") + ".</p>");
    h.push("<p>5.5. Просрочка возврата свыше семи суток без согласования с Арендодателем считается удержанием чужого имущества; Арендодатель вправе требовать возврата Оборудования и возмещения убытков.</p>");

    h.push("<h3>6. Ответственность сторон</h3>");
    h.push("<p>6.1. Арендатор несёт ответственность за сохранность Оборудования с момента подписания акта передачи и до момента подписания акта возврата, в том числе за действия третьих лиц, которым он предоставил доступ к Оборудованию.</p>");
    h.push("<p>6.2. При повреждении Оборудования Арендатор возмещает стоимость восстановительного ремонта, а если ремонт невозможен или экономически нецелесообразен — оценочную стоимость соответствующей позиции по описи.</p>");
    h.push("<p>6.3. При утрате или хищении Оборудования Арендатор возмещает его оценочную стоимость по описи, а также вносит арендную плату по день фактического возмещения.</p>");
    h.push("<p>6.4. Арендодатель отвечает за недостатки Оборудования, полностью или частично препятствующие его использованию, даже если во время заключения договора он о них не знал (ст. 612 ГК РФ)" +
      (prokat ? ". Обнаруженные недостатки устраняются Арендодателем в десятидневный срок либо Оборудование заменяется аналогичным исправным (ст. 629 ГК РФ)" : "") + ".</p>");
    h.push("<p>6.5. Естественный износ Оборудования, возникший при его использовании по назначению, основанием для возмещения не является.</p>");

    h.push("<h3>7. Прочие условия</h3>");
    if (prokat) {
      h.push("<p>7.1. Сдача Оборудования в субаренду, передача прав и обязанностей по договору другому лицу, предоставление Оборудования в безвозмездное пользование, залог арендных прав и внесение их в качестве имущественного вклада не допускаются (ст. 631 ГК РФ).</p>");
      h.push("<p>7.2. Капитальный и текущий ремонт Оборудования является обязанностью Арендодателя (ст. 631 ГК РФ).</p>");
    } else {
      h.push("<p>7.1. " + (radio("sub") === "allow" ?
        "Сдача Оборудования в субаренду допускается только с предварительного письменного согласия Арендодателя (ст. 615 ГК РФ)." :
        "Сдача Оборудования в субаренду и передача прав по настоящему договору третьим лицам не допускаются.") + "</p>");
      h.push("<p>7.2. Текущее содержание Оборудования и поддержание его в исправном состоянии в период аренды — обязанность Арендатора (ст. 616 ГК РФ). Капитальный ремонт производится Арендодателем.</p>");
    }
    var n7 = 2;
    function p7(text) { n7++; h.push("<p>7." + n7 + ". " + text + "</p>"); }
    if (prokat) p7("Настоящий договор является публичным (п. 3 ст. 626 ГК РФ): Арендодатель не вправе оказывать предпочтение одному лицу перед другим, а условия договора устанавливаются одинаковыми для всех арендаторов, кроме случаев, когда законом допускается предоставление льгот отдельным категориям.");
    p7("Договор вступает в силу с момента подписания и действует до полного исполнения сторонами обязательств.");
    /* ПОЧЕМУ В ПРОКАТЕ ДРУГАЯ ОГОВОРКА О СПОРАХ. Прокат — договор с
       потребителем, и к нему применяется Закон «О защите прав потребителей».
       Там часть 2 статьи 16 прямо называет НЕДОПУСТИМЫМИ (ничтожными)
       условия, которые ограничивают выбор потребителем территориальной
       подсудности (п. 2) и навязывают обязательный досудебный порядок
       (п. 11). Переписывать в прокат пункт из обычной аренды — значит
       вписать в договор два ничтожных условия и выглядеть глупо в суде. */
    if (prokat) {
      p7("Споры разрешаются путём переговоров. Арендатор, использующий Оборудование для личных нужд, вправе предъявить иск по своему выбору — по месту своего жительства, месту нахождения Арендодателя либо месту заключения или исполнения договора (п. 2 ст. 17 Закона РФ «О защите прав потребителей»). Досудебный порядок для такого Арендатора не является обязательным.");
    } else {
      p7("Споры разрешаются путём переговоров; при недостижении согласия — в суде по месту нахождения Арендодателя. Претензионный порядок обязателен, срок ответа на претензию — 10 рабочих дней.");
    }
    p7("Договор составлен в двух экземплярах, по одному для каждой стороны, имеющих равную силу.");

    h.push("<h3>8. Реквизиты и подписи сторон</h3>");
    h.push('<table class="req"><tr><td><b>Арендодатель</b>' + party("a") +
      "<br>Адрес: " + bl(val("f-aaddr")) + "<br>Телефон: " + bl(val("f-atel")) +
      '<div class="sig">Подпись: ' + BL + "</div></td>" +
      "<td><b>Арендатор</b>" + party("b") +
      "<br>Адрес: " + bl(val("f-baddr")) + "<br>Телефон: " + bl(val("f-btel")) +
      '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push('<p class="doc-note">Типовой шаблон собран конструктором pobubnim.ru по гл. 34 ГК РФ и не является юридической консультацией.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
  }

  /* ---------- акт приёма-передачи ---------- */
  function renderAkt(d) {
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h2>АКТ ПРИЁМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ<br>к договору № " + bl(val("f-num")) + "</h2>");
    h.push('<table class="doc-meta"><tr><td>г. ' + bl(val("f-city")) +
      '</td><td style="text-align:right">«___» ____________ 20___ г.</td></tr></table>');
    h.push("<p>" + party("a") + " (Арендодатель) передал, а " + party("b") +
      " (Арендатор) принял во временное владение и пользование следующее оборудование:</p>");
    h.push('<table class="items" data-cols="34,18,8,20,20"><tr><th>Наименование</th><th>Серийный №</th><th>Кол-во</th><th>Оценка, ₽</th><th>Состояние при передаче</th></tr>');
    d.items.forEach(function (i) {
      h.push("<tr><td>" + bl(i.name) + "</td><td>" + bl(i.sn) + "</td><td>" + i.qty +
        "</td><td>" + money(i.value) + "</td><td>" + BL + "</td></tr>");
    });
    if (!d.items.length) h.push("<tr><td>" + BL + "</td><td>" + BL + "</td><td>" + BL + "</td><td>" + BL + "</td><td>" + BL + "</td></tr>");
    h.push("</table>");
    h.push('<div class="line"><span>Общая оценочная стоимость</span><span><b>' +
      (PobubnimDocx.moneyFull(d.totalValue) || BL + " рублей") + "</b></span></div>");

    h.push("<h3>Отметки при передаче</h3>");
    h.push("<p>1. Комплектность проверена, оборудование осмотрено, работоспособность проверена включением в присутствии обеих сторон.</p>");
    h.push("<p>2. Замечания к внешнему состоянию и комплектности: " + BL + "</p>");
    h.push("<p>3. Оборудование передано с элементами питания, картами памяти и кофрами согласно описи. Расходные материалы возврату не подлежат, если стороны не указали иное в графе замечаний.</p>");
    var from = ruDate(val("f-from")), to = ruDate(val("f-to"));
    h.push("<p>4. Дата и время передачи: " + (from ? esc(from) : BL) + ", время " + BL +
      ". Срок возврата: " + (to ? esc(to) : BL) + ", время " + BL + ".</p>");

    h.push('<table class="req"><tr><td><b>Передал (Арендодатель)</b>' + partyShort("a") +
      '<div class="sig">Подпись: ' + BL + "</div></td>" +
      "<td><b>Принял (Арендатор)</b>" + partyShort("b") +
      '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");

    h.push("<h3>Возврат оборудования</h3>");
    h.push("<p>Оборудование возвращено Арендодателю «___» ____________ 20___ г. в " + BL + " часов.</p>");
    h.push("<p>Состояние при возврате, замечания, недостача: " + BL + "</p>");
    h.push("<p>Взаимные претензии: " + BL + "</p>");
    if (d.depositMode !== "none") {
      h.push("<p>Обеспечительный платёж " + (d.deposit ? esc(money(d.deposit)) + " ₽" : BL + " ₽") +
        " возвращён / удержан в сумме " + BL + " ₽ по основанию: " + BL + "</p>");
    }
    h.push('<table class="req"><tr><td><b>Принял (Арендодатель)</b>' + partyShort("a") +
      '<div class="sig">Подпись: ' + BL + "</div></td>" +
      "<td><b>Сдал (Арендатор)</b>" + partyShort("b") +
      '<div class="sig">Подпись: ' + BL + "</div></td></tr></table>");
    h.push('<p class="doc-note">Акт без серийных номеров не доказывает, что передавали именно эту технику. Заполняйте номера даже в спешке.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
  }

  /* ---------- сборка ---------- */
  function render() {
    var d = calc();
    var prokat = radio("vid") === "prokat";

    /* поля, которые зависят от выбора */
    document.getElementById("wrap-shifts").hidden = d.auto;
    document.getElementById("wrap-deposit").hidden = radio("deposit") !== "sum";
    document.getElementById("wrap-sub").hidden = prokat;
    document.getElementById("hint-prokat").hidden = !prokat;
    var discFld = document.getElementById("f-disc");
    discFld.disabled = d.half;
    discFld.closest(".fld").style.opacity = d.half ? "0.4" : "";

    /* прокат ведёт только тот, для кого сдача — постоянная предпринимательская
       деятельность (п. 1 ст. 626). Физлицо без статуса стороной проката быть
       не может, и молча собрать ему такой договор нельзя. */
    document.getElementById("warn-vid").hidden = !(prokat && radio("akind") === "person");

    /* предупреждение о серийных номерах: ст. 607 требует определённости объекта */
    var noSn = d.items.length && d.items.some(function (i) { return i.name && !i.sn; });
    document.getElementById("warn-sn").hidden = !noSn;

    /* счётчик смен из дат */
    var badge = document.getElementById("shift-badge");
    badge.textContent = d.auto ? d.shifts + " " + shiftWord(d.shifts) + " по датам" : "";
    badge.hidden = !d.auto;

    if (mode === "dogovor") renderDogovor(d); else renderAkt(d);
  }

  function setMode(m) {
    mode = m;
    tabD.classList.toggle("on", m === "dogovor");
    tabA.classList.toggle("on", m === "akt");
    tabD.setAttribute("aria-selected", m === "dogovor" ? "true" : "false");
    tabA.setAttribute("aria-selected", m === "akt" ? "true" : "false");
    render();
  }
  tabD.addEventListener("click", function () { setMode("dogovor"); });
  tabA.addEventListener("click", function () { setMode("akt"); });

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
    PobubnimDocx.download(paper, (mode === "dogovor" ? "dogovor-arendy-tehniki" : "akt-priema-peredachi") + "-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  /* Окно для приёмки: тест гоняет тот же расчёт, что и страница, а не свою
     копию формул. Позиции задаются целиком, чтобы проверка не зависела от
     порядка кликов по чипам. */
  window.PobubnimArenda = {
    calc: calc,
    setRows: function (list) {
      rows = list.map(function (r) {
        return { name: r.name || "", sn: r.sn || "", value: r.value || "", rate: r.rate || "", qty: r.qty || 1 };
      });
      if (!rows.length) rows = [{ name: "", sn: "", value: "", rate: "", qty: 1 }];
      drawRows();
      render();
    },
    mode: function () { return mode; },
    setMode: setMode
  };

  drawRows();
  render();
})();
