/* ПОБУБНИМ — профиль исполнителя: реквизиты вводятся один раз.
   Имя, ИНН, статус, адрес, телефон, почта, банк и счёт, вписанные в договор или смету,
   запоминаются в этом браузере и в следующий раз встают сами — в договор, смету и
   релиз. Паспортные данные сюда не попадают никогда: их в профиле нет по построению.
   Подключать ПОСЛЕ скрипта инструмента: у договора поля реквизитов рисует он сам. */

(function () {
  var KEY = "pobubnim-profile-v1";
  /* страница -> какие её поля чему в профиле соответствуют; radio — имя группы статуса */
  var MAPS = {
    "konstruktor-dogovora.html": { radio: "executor", fields: {
      "f-exec-name": "name", "f-exec-inn": "inn", "f-exec-ogrn": "ogrn", "f-exec-addr": "addr",
      "f-exec-phone": "tel", "f-exec-email": "email", "f-exec-acc": "acc", "f-exec-bank": "bank",
      "f-exec-bik": "bik", "f-exec-corr": "corr", "f-city": "city" } },
    "smeta-i-schet.html": { radio: "who", fields: {
      "f-exec": "name", "f-inn": "inn", "f-bank": "bank", "f-bik": "bik", "f-ks": "corr", "f-rs": "acc", "f-city": "city" } },
    "modelnyj-reliz.html": { fields: { "f-author": "name", "f-city": "city" } }
  };
  var map = MAPS[location.pathname.split("/").pop()];
  if (!map) return;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function refresh() {
    /* у договора обычная правка подсвечивает место в листе — подстановке это не нужно */
    if (window.PobubnimDogovor && window.PobubnimDogovor.quietRender) window.PobubnimDogovor.quietRender();
    else {
      var f = document.getElementById("cfg");
      if (f) f.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /* ---------- подстановка: только в пустые поля ---------- */
  var p = load(), filled = 0;
  if (map.radio && p.status) {
    var r = document.querySelector('input[name="' + map.radio + '"][value="' + p.status + '"]');
    if (r && !r.checked) { r.checked = true; filled++; }
  }
  Object.keys(map.fields).forEach(function (id) {
    var el = document.getElementById(id), v = p[map.fields[id]];
    if (el && !el.value && v) { el.value = v; filled++; }
  });
  if (filled) refresh();

  /* ---------- подпись с кнопкой «Забыть» — в разделе, где стоит первое поле профиля ---------- */
  var first = document.getElementById(Object.keys(map.fields)[0]);
  var sec = first && first.closest(".cfg-sec");
  var note = document.createElement("div");
  note.className = "hint profile-note";
  note.innerHTML = "Реквизиты исполнителя запоминаются в этом браузере и сами встают в договор, смету и релиз. " +
    'Паспортные данные не запоминаются. <button type="button" id="btn-profile-forget">Забыть реквизиты</button>';
  function drawNote() { note.hidden = !Object.keys(load()).length; }
  if (sec) { sec.appendChild(note); drawNote(); }
  note.addEventListener("click", function (e) {
    if (e.target.id !== "btn-profile-forget") return;
    try { localStorage.removeItem(KEY); } catch (er) { /* нечего чистить */ }
    drawNote();
    if (window.PobubnimToast) window.PobubnimToast("Реквизиты стёрты из памяти браузера");
  });

  /* ---------- запись: непустые значения полей профиля и статус ---------- */
  var timer;
  function save() {
    var cur = load();
    Object.keys(map.fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.value.trim()) cur[map.fields[id]] = el.value.trim();
    });
    if (map.radio) {
      var on = document.querySelector('input[name="' + map.radio + '"]:checked');
      if (on) cur.status = on.value;
    }
    if (!cur.name && !cur.inn) return;            /* один город — ещё не профиль */
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* приватный режим */ }
    drawNote();
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !(t.id in map.fields || t.name === map.radio)) return;
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  }
  document.addEventListener("input", onChange);
  document.addEventListener("change", onChange);
})();
