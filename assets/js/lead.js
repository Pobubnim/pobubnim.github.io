/* ПОБУБНИМ — форма заявки, один файл на все страницы.

   Раньше окно заявки жило разметкой в index.html, поэтому оно было только на
   главной: на услугах, гео-страницах и статьях про цены человеку предлагали
   уйти в мессенджер. Теперь окно собирается скриптом и работает везде, где
   подключён этот файл.

   Как звать со страницы:
     <a class="btn btn-lamp" data-lead="Свадебное кино">Оставить заявку</a>
   Значение data-lead (необязательное) подставляется в список «Что нужно».
   Ссылка на #zayavka тоже открывает окно — старые ссылки не ломаются.

   Бэкенд — Supabase RPC site_lead_create (docs/LEADS_ADMIN.md). Если сеть или
   база недоступны, человек не теряется: открывается чат с готовым текстом. */

(function () {
  var RPC = "https://jkdrnaagjplpyhlsmxii.supabase.co/rest/v1/rpc/site_lead_create";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZHJuYWFnanBscHlobHNteGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDM1NzksImV4cCI6MjA5ODU3OTU3OX0.LP0aO74dEjIYr5oGFXCRz4js-GxZTx2jrCZxVqrTWAo";
  var TG = "https://t.me/sbphotoshoter";
  /* первым идёт нейтральный пункт: кнопка без темы (шапка, гео-страницы) не
     должна подсовывать «Рекламный ролик» тому, кто пришёл за свадьбой —
     ложная тема в заявке хуже пустой */
  var WHAT = ["Другое — опишу ниже", "Рекламный ролик", "Имиджевый фильм", "Свадебное кино",
    "Музыкальный клип", "Съёмка мероприятия", "Цветокоррекция", "Сайт", "Приложение",
    "Бот / автоматизация", "Обучение"];

  /* ---------- откуда человек пришёл ----------
     Заявка редко уходит со страницы входа: пришёл по рекламе на услугу, посмотрел
     работы, написал с третьей страницы. Источник снимается при заходе с метками или
     с чужого сайта и живёт в localStorage: pb_src_first — первый (90 дней),
     pb_src_last — последний. Живёт здесь, а не в analytics.js: файл с таким именем
     режут блокировщики. Внутренние переходы источник не перетирают, возврат из
     своего телеграма или ВК не перетирает свежий рекламный (30 дней). */
  var DAY = 864e5;
  function readSrc(k) {
    try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v && typeof v === "object" ? v : null; }
    catch (_) { return null; }
  }
  try {
    var q = new URLSearchParams(location.search), src = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid"].forEach(function (k) {
      var v = q.get(k); if (v) src[k] = String(v).slice(0, 80);
    });
    var host = (document.referrer || "").replace(/^https?:\/\//, "").split("/")[0];
    if (host && !/(^|\.)pobubnim\.(ru|github\.io)$/.test(host)) src.ref = host;
    if (Object.keys(src).length) {
      src.land = location.pathname;
      src.date = new Date().toISOString().slice(0, 10);
      var age = function (s) { return s && s.date ? (Date.now() - Date.parse(s.date)) / DAY : 1e9; };
      var first = readSrc("pb_src_first"), last = readSrc("pb_src_last");
      var paid = last && (last.utm_source || last.yclid) && age(last) < 30;
      var ownChat = !src.utm_source && !src.yclid && /(^|\.)(t\.me|telegram\.org|vk\.com|vk\.ru)$/.test(src.ref || "");
      if (!first || age(first) > 90) localStorage.setItem("pb_src_first", JSON.stringify(src));
      if (!(paid && ownChat)) localStorage.setItem("pb_src_last", JSON.stringify(src));
    }
  } catch (_) { /* приватный режим без localStorage: заявка уйдёт без источника */ }

  /* ClientID Метрики: заявку по нему можно вернуть в Метрику офлайн-конверсией */
  var cid = "";
  try {
    if (typeof ym === "function") ym(window.YM_ID || 111935483, "getClientID", function (id) { cid = String(id || ""); });
  } catch (_) {}
  window.pbSource = function () {
    return { first: readSrc("pb_src_first"), last: readSrc("pb_src_last"), cid: cid };
  };

  var dlg = document.getElementById("lead");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "lead";
    dlg.id = "lead";
    dlg.innerHTML =
      '<form method="dialog" class="lead-in">' +
      '<button class="lead-close" value="cancel" aria-label="Закрыть">&times;</button>' +
      '<span class="label">Заявка</span>' +
      '<h3>Опишите задачу — отвечу в тот же день</h3>' +
      '<label>Как вас зовут<input type="text" id="lf-name" autocomplete="name" placeholder="Имя"></label>' +
      '<label>Телефон или телеграм<input type="text" id="lf-contact" autocomplete="tel" placeholder="+7… или @ник" required></label>' +
      '<input type="text" id="lf-website" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
      '<label>Что нужно<select id="lf-what">' +
      WHAT.map(function (w) { return '<option>' + w + '</option>'; }).join("") +
      '</select></label>' +
      '<label>Пара слов о задаче<textarea id="lf-desc" rows="3" placeholder="Что снимаем или строим, сроки, ориентир бюджета"></textarea></label>' +
      /* согласие — отдельной строкой и отдельным действием (решение владельца 17.09;
         с 01.09.2025 согласие на обработку данных оформляется отдельно от прочих
         документов). Галочка не стоит заранее: поставленная за человека — не согласие */
      '<label class="lead-consent"><input type="checkbox" id="lf-consent">' +
      '<span>Даю <a href="/soglasie.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a></span></label>' +
      '<button type="button" class="btn btn-lamp" id="lf-send">Отправить заявку</button>' +
      '<p class="lead-alt" id="lf-status">Заявка придёт мне мгновенно — отвечаю в тот же день. Привычнее мессенджер? Пишите напрямую: ' +
      '<a href="' + TG + '" target="_blank" rel="noopener">@sbphotoshoter</a> или ' +
      '<a href="https://vk.ru/sbphotoshoter" target="_blank" rel="noopener">ВКонтакте</a></p>' +
      '<a class="btn btn-lamp" id="lf-tg" hidden target="_blank" rel="noopener" href="' + TG + '">Открыть телеграм с готовым текстом</a>' +
      '<p class="lead-alt" style="font-size:12.5px;color:var(--mute)">Как я храню и использую данные из заявки — в ' +
      '<a href="/privacy.html">политике конфиденциальности</a>.</p>' +
      '</form>';
    document.body.appendChild(dlg);
  }

  var elWhat = dlg.querySelector("#lf-what");
  var elTg = dlg.querySelector("#lf-tg");
  var elSend = dlg.querySelector("#lf-send");
  var elStatus = dlg.querySelector("#lf-status");

  function openWith(topic) {
    if (topic && elWhat) {
      for (var i = 0; i < elWhat.options.length; i++) {
        if (elWhat.options[i].text === topic) { elWhat.selectedIndex = i; break; }
      }
    }
    if (elTg) elTg.hidden = true;
    if (elSend) {
      elSend.disabled = false;
      elSend.textContent = "Отправить заявку";
      elSend.className = "btn btn-lamp";
    }
    if (!dlg.open) dlg.showModal();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-lead]");
    if (!b) return;
    e.preventDefault();
    openWith(b.getAttribute("data-lead"));
  });
  if (location.hash === "#zayavka") openWith(null);
  addEventListener("hashchange", function () { if (location.hash === "#zayavka") openWith(null); });

  /* Откуда пришёл человек — в поле page (база хранит 200 символов и показывает их
     в админке). Полный объект уходит ключом source: база его пока пропускает,
     после миграции начнёт хранить и присылать в телеграм.
     Вид: «/services/x.html ← yandex/cpc/123 «видеосъёмка москва» · вход /x.html 20.09 · cid 17…» */
  function pageWithSource() {
    var here = location.pathname + location.hash;
    /* ошибка учёта не должна ронять заявку: иначе человек увидит «связь подвела» */
    try {
      var s = window.pbSource();
      var l = s.last;
      if (!l) return (here + " ← прямой заход" + (s.cid ? " · cid " + s.cid : "")).slice(0, 200);
      var from = l.utm_source ? [l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join("/")
        : l.yclid ? "yandex/cpc" : l.ref || "?";
      var parts = [from];
      if (l.utm_term) parts.push("«" + String(l.utm_term).slice(0, 40) + "»");
      parts.push("вход " + l.land + " " + String(l.date || "").slice(5).split("-").reverse().join("."));
      if (s.cid) parts.push("cid " + s.cid);
      return (here + " ← " + parts.join(" · ")).slice(0, 200);
    } catch (_) {
      return here.slice(0, 200);
    }
  }
  function sourceObj() {
    try { return window.pbSource(); } catch (_) { return null; }
  }

  elSend.addEventListener("click", async function () {
    var name = dlg.querySelector("#lf-name").value.trim();
    var contact = dlg.querySelector("#lf-contact").value.trim();
    var what = elWhat.value;
    var desc = dlg.querySelector("#lf-desc").value.trim();
    if (!contact) {
      dlg.querySelector("#lf-contact").focus();
      elStatus.textContent = "Оставьте телефон или телеграм — иначе мне некуда ответить.";
      return;
    }
    var consent = dlg.querySelector("#lf-consent");
    if (consent && !consent.checked) {
      consent.focus();
      elStatus.textContent = "Отметьте согласие на обработку данных — без него я не могу принять заявку.";
      return;
    }
    elSend.disabled = true;
    elSend.textContent = "Отправляю…";
    try {
      var r = await fetch(RPC, {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p: {
          name: name, contact: contact, service: what, message: desc,
          page: pageWithSource(),
          source: sourceObj(),
          website: dlg.querySelector("#lf-website").value,
        } }),
      });
      var res = await r.json();
      if (!res.ok) throw new Error(res.error || "fail");
      if (window.pbGoal) pbGoal("lead_send", { page: location.pathname });
      elSend.textContent = "Заявка у меня — отвечу в тот же день";
      elStatus.textContent = "Готово. Если удобнее мессенджер — я и там на связи: @sbphotoshoter.";
      setTimeout(function () {
        dlg.close();
        elSend.disabled = false;
        elSend.textContent = "Отправить заявку";
      }, 2600);
    } catch (_) {
      /* Сеть или бэкенд легли. Раньше здесь вызывался window.open — но после
         await это уже не жест человека, и браузер такое окно БЛОКИРУЕТ
         (проверено измерением: возвращает null). Окно заявки при этом
         закрывалось, и человек оставался ни с чем, считая, что отправил.
         Теперь показываем честный отказ и даём ссылку, по которой он щёлкнет
         сам — по клику браузер откроет её без вопросов. */
      var text = "Привет! Заявка с сайта ПОБУБНИМ.\n\nИмя: " + (name || "—") +
        "\nКонтакт: " + contact + "\nНужно: " + what + "\nЗадача: " + (desc || "—");
      if (elTg) {
        elTg.href = TG + "?text=" + encodeURIComponent(text);
        elTg.hidden = false;
      }
      elStatus.textContent = "Не смог отправить — связь подвела. Текст заявки уже собран: " +
        "откройте телеграм кнопкой ниже или попробуйте ещё раз.";
      elSend.disabled = false;
      elSend.textContent = "Отправить ещё раз";
      elSend.className = "btn btn-ghost";
    }
  });
})();
