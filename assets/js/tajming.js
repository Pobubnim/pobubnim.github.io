/* ПОБУБНИМ — тайминг свадебного дня (instrumenty/tajming-svadby.html).
   Точка отсчёта — церемония: блоки до неё считаются назад, после — вперёд.
   Длительности — ориентир свадебного видеографа, всё двигается. */

(function () {
  var wrap = document.getElementById("blocks");
  var paper = document.getElementById("paper");
  if (!wrap || !paper) return;

  /* pre: до церемонии (в обратном порядке от неё), post: после.
     tip — короткий совет в подписи блока */
  var BLOCKS = [
    { id: "sbory", nm: "Сборы и утро", dur: 90, pre: true, on: true, tip: "причёска и макияж — до этого блока" },
    { id: "vstrecha", nm: "Встреча / выкуп", dur: 30, pre: true, on: true, tip: "первый взгляд снимается здесь" },
    { id: "doroga1", nm: "Дорога к церемонии", dur: 30, pre: true, on: true, tip: "с запасом на пробки" },
    { id: "cer", nm: "Церемония", dur: 60, fixed: true, on: true, tip: "точка отсчёта дня" },
    { id: "pozdrav", nm: "Поздравления и общие фото", dur: 30, on: true, tip: "шампанское, объятия, общий кадр" },
    { id: "progulka", nm: "Прогулка-фотосессия", dur: 90, on: true, tip: "1–2 локации рядом, не больше" },
    { id: "doroga2", nm: "Дорога и сбор гостей", dur: 30, on: true, tip: "молодожёнам — выдохнуть" },
    { id: "banket", nm: "Банкет: встреча и первый танец", dur: 120, on: true, tip: "танец — в начале, пока все свежие" },
    { id: "tort", nm: "Торт и вечерняя программа", dur: 90, on: true, tip: "торт — примерно за час до финала" }
  ];

  function row(b) {
    return '<label class="blk" data-id="' + b.id + '">' +
      '<input type="checkbox" ' + (b.on ? "checked" : "") + (b.fixed ? " disabled" : "") + ">" +
      "<b>" + b.nm + "<i>" + b.tip + "</i></b>" +
      '<span class="dur"><input type="number" min="15" max="360" step="15" value="' + b.dur + '"' + (b.fixed ? "" : "") + "> мин</span></label>";
  }
  wrap.innerHTML = BLOCKS.map(row).join("");

  function fmt(mins) {
    mins = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  function read() {
    var cer = document.getElementById("f-cer").value || "13:00";
    var p = cer.split(":");
    var cerMin = (+p[0]) * 60 + (+p[1]);
    var items = BLOCKS.map(function (b) {
      var el = wrap.querySelector('[data-id="' + b.id + '"]');
      el.classList.toggle("off", !el.querySelector('input[type="checkbox"]').checked);
      return {
        nm: b.nm, pre: !!b.pre,
        on: el.querySelector('input[type="checkbox"]').checked,
        dur: Math.max(15, +el.querySelector('input[type="number"]').value || b.dur)
      };
    }).filter(function (b) { return b.on; });
    return { cerMin: cerMin, items: items };
  }

  function schedule() {
    var d = read();
    var pre = d.items.filter(function (b) { return b.pre; });
    var post = d.items.filter(function (b) { return !b.pre; });
    var out = [];
    var t = d.cerMin - pre.reduce(function (a, b) { return a + b.dur; }, 0);
    pre.concat(post).forEach(function (b) {
      out.push({ time: fmt(t), end: fmt(t + b.dur), nm: b.nm });
      t += b.dur;
    });
    out.push({ time: fmt(t), end: null, nm: "Финал: проводы и разъезд" });
    return out;
  }

  function render() {
    var rows = schedule();
    var h = ['<div class="bmark-row tl" aria-hidden="true"><span class="bmark">Б</span></div>'];
    h.push("<h3>ТАЙМИНГ СВАДЕБНОГО ДНЯ</h3>");
    h.push('<p style="text-align:center;font-size:12px;color:#6b675e">план по часам · собрано на pobubnim.ru</p>');
    rows.forEach(function (r) {
      h.push('<div class="line"><b>' + r.time + (r.end ? "–" + r.end : "") + "</b><span>" + r.nm + "</span></div>");
    });
    h.push('<p class="doc-note">Ориентир, не догма: держите 15–30 минут запаса между блоками — свадьба всегда опаздывает.</p>');
    h.push('<div class="bmark-row br" aria-hidden="true"><span class="bmark">Б</span></div>');
    paper.innerHTML = h.join("");
  }

  document.getElementById("cfg").addEventListener("input", render);
  document.getElementById("cfg").addEventListener("change", render);

  document.getElementById("btn-copy").addEventListener("click", function () {
    var btn = this;
    var txt = "Тайминг свадебного дня — pobubnim.ru\n" +
      schedule().map(function (r) { return r.time + (r.end ? "–" + r.end : "") + "  " + r.nm; }).join("\n");
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
    PobubnimDocx.download(paper, "tajming-svadby-pobubnim.docx");
  });
  document.getElementById("btn-print").addEventListener("click", function () { window.print(); });

  render();
})();
