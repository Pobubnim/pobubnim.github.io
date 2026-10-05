/* ПОБУБНИМ — общая обвязка черновиков инструментов.
   Делает две вещи для страниц с атрибутом data-draft-key на <body>:
   1) кнопка «Ссылка на расчёт» — упаковывает черновик из localStorage в адрес
      страницы, чтобы его можно было отправить в чат или открыть на другом
      устройстве. Ничего никуда не отправляется: данные живут в самой ссылке.
   2) подпись под кнопками — вслух говорит, что черновик сохраняется сам.
   Подключать ДО скрипта инструмента: адрес разбирается синхронно, чтобы
   инструмент прочитал уже подставленный черновик. */
(function () {
  var key = document.body.getAttribute("data-draft-key");
  if (!key) return;

  /* --- тост с кнопкой «Вернуть»: один на все инструменты с черновиком ---
     Показывается в открытом dialog, если он есть: модальное окно живёт в верхнем
     слое, и тост из body остался бы под его подложкой. */
  var toastEl, toastTimer;
  function hideToast() { if (toastEl) toastEl.classList.remove("on"); }
  function toast(text, undo) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "pb-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
    }
    (document.querySelector("dialog[open]") || document.body).appendChild(toastEl);
    toastEl.textContent = "";
    var s = document.createElement("span");
    s.textContent = text;
    toastEl.appendChild(s);
    if (undo) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Вернуть";
      b.addEventListener("click", function () { hideToast(); undo(); });
      toastEl.appendChild(b);
    }
    toastEl.classList.remove("on");
    void toastEl.offsetWidth;                 /* без rAF: в скрытой вкладке он не срабатывает */
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 7000 : 3200);
  }
  window.PobubnimToast = toast;

  /* «Очистить» больше не безвозвратно: снимок черновика берём до того, как инструмент
     его сотрёт (перехват на фазе погружения), и возвращаем перезагрузкой страницы.
     Инструмент со своей отменой помечает body атрибутом data-own-undo. */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#btn-clear");
    if (!b || document.body.hasAttribute("data-own-undo")) return;
    var snap;
    try { snap = localStorage.getItem(key); } catch (er) { snap = null; }
    if (!snap) return;
    setTimeout(function () {
      toast("Черновик очищен", function () {
        try { localStorage.setItem(key, snap); } catch (er) { /* приватный режим */ }
        location.reload();
      });
    }, 0);
  }, true);

  /* ponytail: черновик кладётся в адрес как есть, без сжатия — так разбор
     остаётся синхронным. Потолок 8000 символов (шот-лист на ~40 кадров);
     дальше жать через CompressionStream и переводить приём на async. */
  var LIMIT = 8000;

  function toUrl(json) {
    var b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromUrl(s) {
    var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  }

  /* --- приём: черновик из ссылки кладём в хранилище до старта инструмента --- */
  var m = /[#&]s=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    try {
      var json = fromUrl(m[1]);
      JSON.parse(json);                       // мусор в адресе не пускаем дальше
      localStorage.setItem(key, json);
      history.replaceState(null, "", location.pathname + location.search);
    } catch (e) { /* битая ссылка — открываем инструмент как обычно */ }
  }

  /* ссылку вставили в уже открытую вкладку: браузер меняет только адрес,
     скрипты не перезапускаются — принимаем черновик и перечитываем страницу */
  addEventListener("hashchange", function () {
    if (/[#&]s=[A-Za-z0-9_-]+/.test(location.hash)) location.reload();
  });

  /* --- кнопка и подпись --- */
  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.querySelector(".paper-bar");
    if (!bar) return;

    var btn = document.createElement("button");
    btn.className = "pbtn";
    btn.id = "btn-share";
    btn.type = "button";
    btn.textContent = document.body.getAttribute("data-share-label") || "Ссылка на расчёт";
    bar.appendChild(btn);

    var note = document.createElement("p");
    note.className = "paper-note";
    note.textContent = "Черновик сохраняется в этом браузере сам — вкладку можно закрыть и вернуться позже.";
    bar.insertAdjacentElement("afterend", note);
    /* страница может спрятать подпись стилями (ей тесно) — тогда ответ кнопки уходит в тост */
    function say(text) {
      if (getComputedStyle(note).display === "none") toast(text);
      else note.textContent = text;
    }

    /* --- черновик файлом: перенос между устройствами без предела длины ссылки и запас
       на случай, когда браузер почистили. Файл — тот же черновик, что лежит в хранилище,
       плюс ключи из data-draft-extra (у вызывного листа это логотип). --- */
    var extra = (document.body.getAttribute("data-draft-extra") || "").split(",").filter(Boolean);
    function pack() {
      var raw = null, more = {};
      try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
      if (!raw) return null;
      extra.forEach(function (k) { try { if (localStorage.getItem(k)) more[k] = localStorage.getItem(k); } catch (e) { /* нет доступа */ } });
      return { app: key, saved: new Date().toISOString(), data: JSON.parse(raw), extra: more };
    }
    function apply(obj) {
      if (!obj || obj.app !== key || !obj.data || typeof obj.data !== "object") return false;
      try {
        localStorage.setItem(key, JSON.stringify(obj.data));
        extra.forEach(function (k) { if (obj.extra && obj.extra[k]) localStorage.setItem(k, obj.extra[k]); });
      } catch (e) { return false; }
      return true;
    }
    var files = document.createElement("p");
    files.className = "draft-files";
    files.innerHTML = '<button type="button" id="btn-file-save">Сохранить в файл</button>' +
      '<button type="button" id="btn-file-open">Открыть из файла</button>' +
      '<input type="file" id="f-draft-file" accept=".json,application/json" aria-label="Файл черновика" hidden>';
    note.insertAdjacentElement("afterend", files);
    files.querySelector("#btn-file-save").addEventListener("click", function () {
      var obj = pack();
      if (!obj) { say("Пока нечего сохранять: заполните хотя бы одно поле."); return; }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }));
      a.download = key.replace(/^pobubnim-/, "").replace(/-v\d+$/, "") + "-" + obj.saved.slice(0, 10) + ".json";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      if (window.pbGoal) window.pbGoal("tool_file");
    });
    var pick = files.querySelector("#f-draft-file");
    files.querySelector("#btn-file-open").addEventListener("click", function () { pick.click(); });
    pick.addEventListener("change", function () {
      var f = pick.files && pick.files[0];
      pick.value = "";
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var obj = null;
        try { obj = JSON.parse(rd.result); } catch (e) { obj = null; }
        if (apply(obj)) location.reload();
        else toast(obj && obj.app && obj.app !== key ? "Это файл другого инструмента — откройте его на своей странице"
          : "Не получилось прочитать файл: нужен тот, что сохранён кнопкой «Сохранить в файл»");
      };
      rd.readAsText(f);
    });
    window.PobubnimDraftFile = { pack: pack, apply: apply };

    btn.addEventListener("click", function () {
      var raw;
      try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
      if (!raw) { say("Пока нечего сохранять: заполните хотя бы одно поле."); return; }
      var packed = toUrl(raw);
      if (packed.length > LIMIT) {
        say("Расчёт слишком большой для ссылки — сохраните его в Word, файл отдаётся целиком.");
        return;
      }
      var url = location.origin + location.pathname + "#s=" + packed;
      var done = function () {
        say("Ссылка скопирована. Откроется с вашими данными на любом устройстве.");
        if (window.pbGoal) window.pbGoal("tool_share");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { fallback(url, done); });
      } else {
        fallback(url, done);
      }
    });

    function fallback(url, done) {
      var t = document.createElement("textarea");
      t.value = url;
      t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (e) {
        say("Скопируйте ссылку вручную: " + url);
      }
      t.remove();
    }
  });
})();
