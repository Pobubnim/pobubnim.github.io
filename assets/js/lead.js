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
  var WHAT = ["Рекламный ролик", "Имиджевый фильм", "Свадебное кино", "Музыкальный клип",
    "Съёмка мероприятия", "Цветокоррекция", "Сайт", "Приложение", "Бот / автоматизация",
    "Обучение", "Другое"];

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
      '<button type="button" class="btn btn-lamp" id="lf-send">Отправить заявку</button>' +
      '<p class="lead-alt" id="lf-status">Заявка придёт мне мгновенно — отвечаю в тот же день. Привычнее мессенджер? Пишите напрямую: ' +
      '<a href="' + TG + '" target="_blank" rel="noopener">@sbphotoshoter</a> или ' +
      '<a href="https://vk.ru/sbphotoshoter" target="_blank" rel="noopener">ВКонтакте</a></p>' +
      '<p class="lead-alt" style="font-size:12.5px;color:var(--mute)">Отправляя заявку, вы соглашаетесь на обработку указанных данных — только чтобы я мог вам ответить. Подробности в ' +
      '<a href="/privacy.html">политике конфиденциальности</a>.</p>' +
      '</form>';
    document.body.appendChild(dlg);
  }

  var elWhat = dlg.querySelector("#lf-what");
  var elSend = dlg.querySelector("#lf-send");
  var elStatus = dlg.querySelector("#lf-status");

  function openWith(topic) {
    if (topic && elWhat) {
      for (var i = 0; i < elWhat.options.length; i++) {
        if (elWhat.options[i].text === topic) { elWhat.selectedIndex = i; break; }
      }
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
    elSend.disabled = true;
    elSend.textContent = "Отправляю…";
    try {
      var r = await fetch(RPC, {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p: {
          name: name, contact: contact, service: what, message: desc,
          page: location.pathname + location.hash,
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
      /* сеть или бэкенд легли: не теряем человека, открываем чат с готовым текстом */
      var text = "Привет! Заявка с сайта ПОБУБНИМ.\n\nИмя: " + (name || "—") +
        "\nКонтакт: " + contact + "\nНужно: " + what + "\nЗадача: " + (desc || "—");
      open(TG + "?text=" + encodeURIComponent(text), "_blank", "noopener");
      elSend.disabled = false;
      elSend.textContent = "Отправить заявку";
      dlg.close();
    }
  });
})();
