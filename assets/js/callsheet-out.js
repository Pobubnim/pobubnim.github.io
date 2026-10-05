/* ПОБУБНИМ — вызывной лист: рассылка и выгрузки (пара к callsheet.js).
   Общий текст в чат смены, личный вызов каждому со своим временем, ручные
   отметки «отправлено / подтвердил», сообщение «что изменилось» с прошлой
   рассылки, событие календаря .ics и таблица .csv для Excel.
   Сервера нет: ссылки wa.me и t.me открывают мессенджер на устройстве человека,
   текст собирается здесь же. Форматы и ограничения — docs/research/callsheet_tehnika.md. */

(function () {
  var C = window.PobubnimCallsheet, dlg = document.getElementById("send");
  if (!C || !dlg) return;
  function $(id) { return document.getElementById(id); }
  var SUN = window.PobubnimSun, val = C.val, hm = C.hm, pl = C.pl;
  var goal = function (name) { if (window.pbGoal) window.pbGoal(name, { tool: location.pathname }); };

  var DAY_ACC = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
    "августа", "сентября", "октября", "ноября", "декабря"];
  function shortDate(iso, acc) {
    var p = C.dateParts(iso);
    if (!p) return "";
    var wd = new Date(p.y, p.m - 1, p.d).getDay();
    return (acc ? DAY_ACC[wd] + ", " : "") + p.d + " " + MONTHS[p.m - 1];
  }
  function title() {
    return (val("f-proj") ? "«" + val("f-proj") + "»" : "") +
      (val("f-day") ? (val("f-proj") ? ", " : "") + "смена " + val("f-day") : "");
  }
  function locs() { return C.state().locs.filter(function (l) { return l.name || l.addr; }); }
  function locText(l) {
    var out = [[l.name, l.addr].filter(Boolean).join(", ")];
    if (l.addr) out.push("Карта: " + C.mapUrl(l.addr));
    if (l.how) out.push(l.how);
    return out;
  }
  function contactLine(skipWho) {
    var c = C.contact();
    if (!c || c.who === skipWho) return "";
    return "На связи: " + c.who + (c.role ? " (" + c.role.toLowerCase() + ")" : "") + ", " + c.phone;
  }
  function keyLine(k) {
    return [k.call ? "общий сбор " + k.call.t : "", k.start ? "начало съёмки " + k.start.t : "",
      k.end ? "конец около " + k.end.t : ""].filter(Boolean).join(", ");
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- общий текст в чат ---------- */
  function chatText() {
    var S = C.state(), k = C.key(), s = C.sun(), ph = !S.noPhones, o = [];
    o.push("ВЫЗЫВНОЙ ЛИСТ" + (title() ? " · " + title() : "") + (S.rev > 1 ? " · версия " + S.rev : ""));
    var d = val("f-date") ? C.dateRu(val("f-date"), true) : "";
    if (d || val("f-city")) o.push([d, val("f-city")].filter(Boolean).join(" · "));
    o.push("");
    if (k.call) o.push("Общий сбор — " + k.call.t);
    if (k.start) o.push("Начало съёмки — " + k.start.t);
    if (k.end) o.push("Конец смены — " + k.end.t + (k.call ? " (смена " + hm(k.end.m - k.call.m) + ")" : ""));
    if (val("f-notes")) o.push("", "ВАЖНОЕ", val("f-notes"));
    var L = locs();
    if (L.length) {
      o.push("", L.length > 1 ? "ЛОКАЦИИ" : "ЛОКАЦИЯ");
      L.forEach(function (l, i) {
        var t = locText(l);
        t[0] = (L.length > 1 ? i + 1 + ". " : "") + t[0] + (l.time ? ", с " + l.time : "");
        o.push.apply(o, t);
      });
    }
    if (k.tl.length > 1) {
      o.push("", "РАСПИСАНИЕ");
      k.tl.forEach(function (r) { o.push(r.t + "  " + (r.what || "")); });
    }
    var crew = C.people("crew");
    if (crew.length) {
      o.push("", "ГРУППА");
      crew.forEach(function (p) {
        o.push([[p.role, p.who].filter(Boolean).join(" — "), ph && p.phone ? p.phone : ""].filter(Boolean).join(", ") +
          (p.at || k.call ? " — к " + (p.at || k.call.t) : ""));
      });
    }
    var cast = S.on.cast ? C.people("cast") : [];
    if (cast.length) {
      o.push("", "В КАДРЕ");
      cast.forEach(function (p) {
        o.push([p.who + (p.part ? " (" + p.part + ")" : ""), ph && p.phone ? p.phone : ""].filter(Boolean).join(", ") +
          (p.at ? " — вызов " + p.at : "") + (p.ready ? ", в кадре с " + p.ready : ""));
      });
    }
    var sc = S.on.scenes ? S.scenes.filter(function (x) { return x.what; }) : [];
    if (sc.length) {
      o.push("", "ЧТО СНИМАЕМ");
      sc.forEach(function (x, i) { o.push(i + 1 + ". " + [x.what, x.where, x.note].filter(Boolean).join(" · ")); });
    }
    if (s && s.sunrise !== null && s.sunset !== null) {
      o.push("", "СВЕТ", "Восход " + SUN.hhmm(s.sunrise) + ", закат " + SUN.hhmm(s.sunset) +
        (s.goldenEvening[0] !== null && s.goldenEvening[1] !== null
          ? ". Золотой час вечером " + SUN.hhmm(s.goldenEvening[0]) + "–" + SUN.hhmm(s.goldenEvening[1]) : "") + ".");
      C.lightNotes().forEach(function (n) { o.push(n); });
    }
    if (val("f-wx")) o.push("Погода: " + val("f-wx"));
    if (S.on.safety) {
      var hosp = [val("f-hosp"), val("f-hospaddr"), val("f-hosptel")].filter(Boolean).join(", ");
      o.push("", "БЕЗОПАСНОСТЬ", "Экстренные службы — 112." + (hosp ? " Ближайшая помощь: " + hosp + "." : ""));
    }
    C.blocks.forEach(function (b) {
      if (b[2] && S.on[b[0]] && S.txt[b[0]]) o.push("", b[1].toUpperCase(), S.txt[b[0]]);
    });
    if (contactLine()) o.push("", contactLine());
    return o.join("\n");
  }

  /* короткий вариант: то, без чего человек не приедет. Идёт в ссылку мессенджера,
     когда полный текст в адрес не помещается */
  function briefText() {
    var k = C.key(), L = locs(), o = ["Вызывной" + (title() ? " · " + title() : "")];
    if (val("f-date")) o.push(cap(C.dateRu(val("f-date"), true)));
    if (keyLine(k)) o.push(cap(keyLine(k)) + ".");
    if (L[0]) o.push.apply(o, locText(L[0]));
    if (contactLine()) o.push(contactLine());
    return o.join("\n");
  }

  /* ---------- личный вызов ---------- */
  function personal(p, kind, brief) {
    var k = C.key(), L = locs(), o = [], first = (p.who || "").trim().split(/\s+/)[0];
    var when = val("f-date") ? " на " + shortDate(val("f-date"), true) : "";
    o.push((first ? first + ", в" : "В") + "ызывной лист" + when + ".");
    if (title()) o.push(cap(title()) + ".");
    o.push("");
    var mine = p.at || (k.call ? k.call.t : "");
    var what = kind === "cast" ? [p.part, p.ready ? "в кадре с " + p.ready : ""].filter(Boolean).join(", ") : p.role;
    if (mine) o.push("Вызов: " + mine + (what ? " · " + what : ""));
    if (keyLine(k)) o.push(cap(keyLine(k)) + ".");
    if (L.length) {
      o.push("");
      L.forEach(function (l, i) {
        var t = locText(l);
        t[0] = (L.length > 1 ? "Локация " + (i + 1) + ": " : "Куда: ") + t[0] + (l.time && L.length > 1 ? ", с " + l.time : "");
        o.push.apply(o, t);
      });
    }
    if (!brief && val("f-notes")) o.push("", "Важное: " + val("f-notes"));
    if (contactLine(p.who)) o.push("", contactLine(p.who));
    o.push("Напишите, пожалуйста, что получили.");
    return o.join("\n");
  }
  /* в адрес ссылки кладём полный текст, пока он помещается; иначе — без «Важного» */
  function fits(t) { return encodeURIComponent(t).length <= 6000; }
  function personalForUrl(p, kind) {
    var full = personal(p, kind);
    return fits(full) ? full : personal(p, kind, true);
  }

  /* ---------- что изменилось с прошлой рассылки ---------- */
  function compact() {
    var S = C.state(), k = C.key(), crew = {};
    C.people("crew").concat(S.on.cast ? C.people("cast") : []).forEach(function (p) {
      /* только личное время: сдвиг общего сбора уже назван строкой расписания, повторять его на каждого незачем */
      if (p.who) crew[p.who] = { at: p.at || "", role: p.role || p.part || "" };
    });
    return { date: val("f-date"), notes: val("f-notes"), crew: crew,
      sched: k.tl.map(function (r) { return [r.t, r.what]; }),
      locs: locs().map(function (l) { return [l.name, l.addr, l.time, l.how]; }) };
  }
  function diff(a, b) {
    var out = [], i;
    if (!a) return out;
    if (a.date !== b.date) out.push("Дата: " + (shortDate(a.date) || "не было") + " → " + (shortDate(b.date) || "не указана"));
    var was = {}, now = {};
    a.sched.forEach(function (r) { was[r[1]] = r[0]; });
    b.sched.forEach(function (r) { now[r[1]] = r[0]; });
    b.sched.forEach(function (r) {
      if (!(r[1] in was)) out.push("Новое в расписании: " + r[0] + " " + r[1]);
      else if (was[r[1]] !== r[0]) out.push((r[1] || "Строка расписания") + ": " + was[r[1]] + " → " + r[0]);
    });
    a.sched.forEach(function (r) { if (!(r[1] in now)) out.push("Убрано из расписания: " + r[0] + " " + r[1]); });
    for (i = 0; i < Math.max(a.locs.length, b.locs.length); i++) {
      var x = a.locs[i], y = b.locs[i], n = "Локация " + (i + 1);
      if (!x) out.push("Новая локация: " + [y[0], y[1]].filter(Boolean).join(", "));
      else if (!y) out.push("Убрана локация: " + [x[0], x[1]].filter(Boolean).join(", "));
      else {
        if (x[0] !== y[0] || x[1] !== y[1]) out.push(n + ": теперь " + [y[0], y[1]].filter(Boolean).join(", "));
        if (x[2] !== y[2]) out.push(n + ", время: " + (x[2] || "не было") + " → " + (y[2] || "не указано"));
        if (x[3] !== y[3] && y[3]) out.push(n + ", как попасть: " + y[3]);
      }
    }
    Object.keys(b.crew).forEach(function (w) {
      if (!a.crew[w]) out.push("В группе: " + w + (b.crew[w].role ? " (" + b.crew[w].role.toLowerCase() + ")" : ""));
      else if (a.crew[w].at !== b.crew[w].at) out.push(w + ", вызов: " + (a.crew[w].at || "к общему сбору") + " → " + (b.crew[w].at || "к общему сбору"));
    });
    Object.keys(a.crew).forEach(function (w) { if (!b.crew[w]) out.push("Не участвует: " + w); });
    if (a.notes !== b.notes) out.push("Обновлён раздел «Важное»" + (b.notes ? ": " + b.notes : ""));
    return out;
  }
  function changes() { return diff(C.state().snap, compact()); }
  function changesText() {
    var S = C.state();
    return "ИЗМЕНЕНИЯ В ВЫЗЫВНОМ" + (title() ? " · " + title() : "") +
      (val("f-date") ? " · " + shortDate(val("f-date")) : "") + "\n" +
      changes().map(function (l) { return "— " + l; }).join("\n") +
      "\nАктуальная версия: " + (S.rev + 1) + ".";
  }

  /* ---------- копирование и скачивание ---------- */
  function copy(text, done) {
    function fallback() {
      var t = document.createElement("textarea");
      t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      (dlg.open ? dlg : document.body).appendChild(t);
      t.select();
      try { document.execCommand("copy"); done(); } catch (e) { C.toast("Не получилось скопировать — выделите текст вручную"); }
      t.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function flash(btn, text) {
    var old = btn.textContent;
    btn.textContent = text || "Скопировано ✓";
    btn.classList.add("copy-done");
    setTimeout(function () { btn.textContent = old; btn.classList.remove("copy-done"); }, 1600);
  }
  function download(name, type, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function slug() { return "vyzyvnoj-list" + (val("f-date") ? "-" + val("f-date") : ""); }

  /* ---------- календарь .ics (RFC 5545) ---------- */
  function icsEsc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  /* строка не длиннее 75 октетов UTF-8; продолжение начинается с пробела, символ не рвём */
  function fold(line) {
    var enc = new TextEncoder(), out = [], cur = "", bytes = 0;
    Array.from(line).forEach(function (ch) {
      var n = enc.encode(ch).length;
      if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch; bytes += n;
    });
    out.push(cur);
    return out.join("\r\n ");
  }
  function stamp(dt) { return dt.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; }
  function ics() {
    var p = C.dateParts(val("f-date")), k = C.key();
    if (!p || !k.call) return null;
    var tz = parseFloat(val("f-tz").replace(",", "."));
    if (isNaN(tz)) tz = 3;
    /* время в UTC: событие встанет верно у каждого, в каком бы поясе ни был его телефон */
    function utc(m) { return stamp(new Date(Date.UTC(p.y, p.m - 1, p.d, 0, m - tz * 60))); }
    var L = locs()[0], lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//pobubnim.ru//callsheet//RU",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      "UID:" + val("f-date") + "-" + k.call.m + "-" + Math.random().toString(36).slice(2, 10) + "@pobubnim.ru",
      "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + utc(k.call.m),
      "DTEND:" + utc(k.end ? k.end.m : k.call.m + 60),
      "SUMMARY:" + icsEsc("Съёмка" + (val("f-proj") ? ": " + val("f-proj") : "") + (val("f-day") ? " (смена " + val("f-day") + ")" : ""))];
    if (L) lines.push("LOCATION:" + icsEsc([L.name, L.addr].filter(Boolean).join(", ")));
    lines.push("DESCRIPTION:" + icsEsc(chatText()),
      /* одно напоминание — за час: «за 12 часов» у дневного сбора звенело бы среди ночи */
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc("Сбор через час: " + k.call.t), "TRIGGER:-PT1H", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  /* ---------- таблица .csv для Excel: точка с запятой и BOM, иначе кириллица и столбцы съедут ---------- */
  function csv() {
    var S = C.state(), k = C.key(), rows = [];
    function q(v) { v = String(v === undefined || v === null ? "" : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function add() { rows.push([].map.call(arguments, q).join(";")); }
    add("Вызывной лист", val("f-proj"), val("f-date"), val("f-day") ? "смена " + val("f-day") : "", val("f-city"));
    add();
    add("РАСПИСАНИЕ"); add("Время", "Что происходит");
    k.tl.forEach(function (r) { add(r.t, r.what); });
    add();
    add("ЛОКАЦИИ"); add("Локация", "Адрес", "Снимаем с", "Как попасть");
    locs().forEach(function (l) { add(l.name, l.addr, l.time, l.how); });
    add();
    add("ГРУППА"); add("Роль", "Имя", "Телефон", "Вызов", "Статус");
    C.people("crew").forEach(function (p) { add(p.role, p.who, p.phone, p.at || (k.call ? k.call.t : ""), ST[p.st || ""]); });
    if (S.on.cast && C.people("cast").length) {
      add();
      add("В КАДРЕ"); add("Кто", "В кадре как", "Телефон", "Вызов", "В кадре с", "Статус");
      C.people("cast").forEach(function (p) { add(p.who, p.part, p.phone, p.at, p.ready, ST[p.st || ""]); });
    }
    return "\ufeff" + rows.join("\r\n") + "\r\n";
  }

  /* ---------- окно рассылки ---------- */
  var ST = { "": "не отправлено", sent: "отправлено", ok: "подтвердил" };
  function everyone() {
    var S = C.state(), out = [];
    S.crew.forEach(function (p, i) { if (p.who) out.push({ p: p, kind: "crew", i: i }); });
    if (S.on.cast) S.cast.forEach(function (p, i) { if (p.who) out.push({ p: p, kind: "cast", i: i }); });
    return out;
  }
  function draw() {
    var S = C.state(), k = C.key(), all = chatText(), list = everyone();
    $("msg-all").textContent = all;
    var inUrl = fits(all) ? all : briefText();
    $("url-note").hidden = fits(all);
    var L = locs()[0];
    $("btn-tg").href = "https://t.me/share/url?url=" + encodeURIComponent(L && L.addr ? C.mapUrl(L.addr) : location.origin + location.pathname) +
      "&text=" + encodeURIComponent(inUrl);
    $("btn-wa").href = "https://wa.me/?text=" + encodeURIComponent(inUrl);
    $("btn-share-all").hidden = !navigator.share;

    /* список перерисовывается на каждую правку — фокус возвращаем на тот же элемент той же строки */
    var act = document.activeElement, keep = act && act.closest ? act.closest(".per-i") : null;
    var keepSel = keep ? '.per-i[data-kind="' + keep.dataset.kind + '"][data-i="' + keep.dataset.i + '"] ' +
      (act.dataset.act ? '[data-act="' + act.dataset.act + '"]' : ".per-st") : "";
    $("per").innerHTML = list.length ? list.map(function (x) {
      var p = x.p, d = C.digits(p.phone), at = p.at || (k.call ? k.call.t : "");
      return '<div class="per-i" data-kind="' + x.kind + '" data-i="' + x.i + '" data-st="' + (p.st || "") + '">' +
        '<div class="per-who"><b>' + C.esc(p.who) + "</b><span>" +
        C.esc([p.role || p.part, at ? "вызов " + at : "", p.phone ? "" : "нет телефона"].filter(Boolean).join(" · ")) + "</span></div>" +
        '<div class="per-act">' +
        (d ? '<a class="mini" data-act="wa" target="_blank" rel="noopener" href="https://wa.me/' + d + "?text=" +
          encodeURIComponent(personalForUrl(p, x.kind)) + '">WhatsApp</a>' +
          '<a class="mini" data-act="tg" target="_blank" rel="noopener" href="https://t.me/+' + d + '">Telegram</a>' : "") +
        '<button type="button" class="mini" data-act="copy">Текст</button>' +
        '<select class="per-st" aria-label="Статус: ' + C.esc(p.who) + '">' +
        Object.keys(ST).map(function (v) {
          return '<option value="' + v + '"' + (v === (p.st || "") ? " selected" : "") + ">" + ST[v] + "</option>";
        }).join("") + "</select></div></div>";
    }).join("") : '<p class="per-empty">Впишите в группу хотя бы одно имя — здесь появятся личные вызовы.</p>';

    if (keepSel && $("per").querySelector(keepSel)) $("per").querySelector(keepSel).focus();

    var sent = list.filter(function (x) { return x.p.st; }).length;
    var ok = list.filter(function (x) { return x.p.st === "ok"; }).length;
    $("per-sum").textContent = list.length ? "Отправлено " + sent + " из " + list.length + " · подтвердили " + ok : "";
    $("btn-remind").hidden = !sent || ok === list.length;

    var ch = changes();
    $("diff-box").hidden = !S.snap || !ch.length;
    $("diff").innerHTML = ch.map(function (l) { return "<li>" + C.esc(l) + "</li>"; }).join("");
    $("mark-note").textContent = S.rev
      ? "Версия " + S.rev + (S.sentAt ? " разослана " + S.sentAt : "") + (ch.length ? " · с тех пор есть правки" : " · правок не было")
      : "Отметьте, когда разошлёте — лист запомнит эту версию и потом покажет, что изменилось.";
    $("btn-mark").textContent = S.rev && ch.length ? "Отметить: разослана версия " + (S.rev + 1) : "Отметить: лист разослан";
    $("btn-mark").disabled = !!S.rev && !ch.length;
  }
  function setSt(x, st) {
    var p = C.state()[x.kind][x.i];
    if (!p || p.st === st) return;
    p.st = st;
    C.changed();
  }

  $("btn-send").addEventListener("click", function () { draw(); dlg.showModal(); goal("tool_send"); });
  $("mbar-send").addEventListener("click", function () { $("btn-send").click(); });
  $("send-x").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });   /* клик по подложке */
  C.onChange(function () { if (dlg.open) draw(); });

  $("btn-copy").addEventListener("click", function () { var b = this; copy(chatText(), function () { flash(b); }); });
  $("btn-share-all").addEventListener("click", function () {
    navigator.share({ text: chatText() }).catch(function () { /* человек закрыл окно — это не ошибка */ });
  });
  $("per").addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"), r = e.target.closest(".per-i");
    if (!b || !r) return;
    var x = { kind: r.dataset.kind, i: +r.dataset.i }, p = C.state()[x.kind][x.i], act = b.dataset.act;
    goal("tool_send_personal");
    if (act === "wa") { setTimeout(function () { setSt(x, p.st || "sent"); }, 0); return; }   /* ссылка откроется сама */
    /* у Telegram нет ссылки «написать по номеру с готовым текстом»: текст кладём в буфер, чат открывается следом */
    copy(personal(p, x.kind), function () {
      if (act === "tg") C.toast("Текст скопирован — вставьте его в открывшийся чат");
      else flash(b);
      setSt(x, p.st || "sent");
    });
  });
  $("per").addEventListener("change", function (e) {
    var r = e.target.closest(".per-i");
    if (r && e.target.classList.contains("per-st")) setSt({ kind: r.dataset.kind, i: +r.dataset.i }, e.target.value);
  });
  $("btn-remind").addEventListener("click", function () {
    var k = C.key(), b = this, wait = everyone().filter(function (x) { return x.p.st !== "ok"; })
      .map(function (x) { return x.p.who.split(/\s+/)[0]; });
    copy("Напоминаю про съёмку" + (val("f-date") ? " в " + shortDate(val("f-date"), true) : "") +
      (k.call ? ": сбор в " + k.call.t : "") + ". Вызывной лист отправлял выше — напишите, пожалуйста, что получили.\n" +
      wait.join(", "), function () { flash(b); });
  });
  $("btn-diff").addEventListener("click", function () { var b = this; copy(changesText(), function () { flash(b); }); });
  $("btn-mark").addEventListener("click", function () {
    var S = C.state(), d = new Date();
    S.rev = (S.rev || 0) + 1;
    S.snap = compact();
    S.sentAt = d.getDate() + " " + MONTHS[d.getMonth()] + " в " + C.p2(d.getHours()) + ":" + C.p2(d.getMinutes());
    C.changed();
    draw();
  });

  $("btn-ics").addEventListener("click", function () {
    var text = ics();
    if (!text) { C.toast("Для календаря нужны дата съёмки и время сбора"); return; }
    download(slug() + ".ics", "text/calendar;charset=utf-8", text);
    goal("tool_ics");
  });
  $("btn-csv").addEventListener("click", function () {
    download(slug() + ".csv", "text/csv;charset=utf-8", csv());
    goal("tool_csv");
  });

  C.chatText = chatText; C.briefText = briefText; C.personal = personal; C.ics = ics; C.csv = csv;
  C.changes = changes; C.changesText = changesText; C.fold = fold;
})();
