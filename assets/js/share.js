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
    btn.textContent = "Ссылка на расчёт";
    bar.appendChild(btn);

    var note = document.createElement("p");
    note.className = "paper-note";
    note.textContent = "Черновик сохраняется в этом браузере сам — вкладку можно закрыть и вернуться позже.";
    bar.insertAdjacentElement("afterend", note);

    btn.addEventListener("click", function () {
      var raw;
      try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
      if (!raw) { note.textContent = "Пока нечего сохранять: заполните хотя бы одно поле."; return; }
      var packed = toUrl(raw);
      if (packed.length > LIMIT) {
        note.textContent = "Расчёт слишком большой для ссылки — сохраните его в Word, файл отдаётся целиком.";
        return;
      }
      var url = location.origin + location.pathname + "#s=" + packed;
      var done = function () {
        note.textContent = "Ссылка скопирована. Откроется с вашим расчётом на любом устройстве.";
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
        note.textContent = "Скопируйте ссылку вручную: " + url;
      }
      t.remove();
    }
  });
})();
