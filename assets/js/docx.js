/* ПОБУБНИМ — генератор настоящего .docx из листа .paper (без библиотек).
   Зачем: HTML-файл с расширением .doc Word открывает с предупреждением, а
   мобильный Word не открывает вовсе. Здесь собирается честный OOXML:
   ZIP без сжатия (stored) + word/document.xml, Times New Roman 12pt, A4.
   Использование: PobubnimDocx.download(paperElement, "dogovor.docx") */

(function () {
  /* ---------- ZIP (stored) ---------- */
  var CRC = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return function (buf) {
      var c = 0xFFFFFFFF;
      for (var i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
  })();

  function zip(files) {
    var enc = new TextEncoder();
    var chunks = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >> 8) & 255]; }
    function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
      var crc = CRC(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(head), name, data);
      central.push([new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset))), name]);
      offset += head.length + name.length + data.length;
    });
    var cdSize = 0, cdStart = offset;
    central.forEach(function (c) {
      chunks.push(c[0], c[1]);
      cdSize += c[0].length + c[1].length;
    });
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  /* ---------- WordprocessingML ---------- */
  function xesc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /* run: текст с оформлением; sz в полупунктах (24 = 12pt) */
  function run(text, o) {
    o = o || {};
    var pr = "";
    if (o.bold) pr += "<w:b/>";
    if (o.italic) pr += "<w:i/>";
    if (o.color) pr += '<w:color w:val="' + o.color + '"/>';
    if (o.sz) pr += '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>';
    if (o.shd) pr += '<w:shd w:val="clear" w:color="auto" w:fill="' + o.shd + '"/>';
    if (o.font) pr += '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '" w:cs="' + o.font + '"/>';
    return "<w:r>" + (pr ? "<w:rPr>" + pr + "</w:rPr>" : "") +
      '<w:t xml:space="preserve">' + xesc(text) + "</w:t></w:r>";
  }
  /* par: абзац из готовых ранов; jc: left|center|right|both; tabRight — правый таб на край */
  function par(runsXml, o) {
    o = o || {};
    var pr = "";
    if (o.jc) pr += '<w:jc w:val="' + o.jc + '"/>';
    if (o.spaceAfter !== undefined) pr += '<w:spacing w:after="' + o.spaceAfter + '"/>';
    if (o.tabRight) pr += '<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>';
    return "<w:p>" + (pr ? "<w:pPr>" + pr + "</w:pPr>" : "") + runsXml + "</w:p>";
  }
  var TAB = "<w:r><w:tab/></w:r>";

  /* инлайн-содержимое узла → раны; blank-спаны становятся подчёркиваниями */
  function inlineRuns(node, o) {
    var out = "";
    node.childNodes.forEach(function (ch) {
      if (ch.nodeType === 3) {
        if (ch.textContent) out += run(ch.textContent, o);
      } else if (ch.nodeType === 1) {
        var cls = ch.classList;
        if (cls.contains("blank")) out += run("______________", o);
        else if (ch.tagName === "BR") out += "<w:r><w:br/></w:r>";
        else if (ch.tagName === "B" || ch.tagName === "STRONG") out += inlineRuns(ch, Object.assign({}, o, { bold: true }));
        else if (ch.tagName === "EM" || ch.tagName === "I") out += inlineRuns(ch, Object.assign({}, o, { italic: true }));
        else out += inlineRuns(ch, o);
      }
    });
    return out;
  }

  /* содержимое ячейки реквизитов: <b>роль</b> текст <br> ... <div class="sig"> */
  function cellPars(td) {
    var pars = [], cur = "";
    function flush() { if (cur) { pars.push(par(cur, { spaceAfter: 60 })); cur = ""; } }
    td.childNodes.forEach(function (ch) {
      if (ch.nodeType === 3) { if (ch.textContent.trim()) cur += run(ch.textContent); return; }
      if (ch.nodeType !== 1) return;
      if (ch.tagName === "B") { flush(); pars.push(par(inlineRuns(ch, { bold: true }), { spaceAfter: 80 })); }
      else if (ch.tagName === "BR") { flush(); }
      else if (ch.classList.contains("sig")) { flush(); pars.push(par(inlineRuns(ch), { spaceAfter: 0 })); }
      else if (ch.classList.contains("blank")) cur += run("______________");
      else cur += inlineRuns(ch);
    });
    flush();
    return pars.join("") || par(run(""), {});
  }

  function tableXml(tbl) {
    var tds = tbl.querySelectorAll("td");
    var cells = [].map.call(tds, function (td) {
      return '<w:tc><w:tcPr><w:tcW w:w="4819" w:type="dxa"/></w:tcPr>' + cellPars(td) + "</w:tc>";
    }).join("");
    return '<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders/></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="4819"/><w:gridCol w:w="4819"/></w:tblGrid><w:tr>' + cells + "</w:tr></w:tbl>" +
      par(run(""), { spaceAfter: 0 });
  }

  function bodyXml(paper) {
    var out = [];
    [].forEach.call(paper.children, function (el) {
      var cls = el.classList;
      if (cls.contains("bmark-row")) {
        out.push(par(run(" Б ", { bold: true, italic: true, shd: "000000", color: "F5EFE2", font: "Georgia" }),
          { jc: cls.contains("br") ? "right" : "left", spaceAfter: 120 }));
      } else if (el.tagName === "H3") {
        out.push(par(inlineRuns(el, { bold: true }), { jc: "center", spaceAfter: 120 }));
      } else if (el.tagName === "H4") {
        out.push(par(inlineRuns(el, { bold: true }), { spaceAfter: 100 }));
      } else if (el.tagName === "TABLE" && cls.contains("doc-meta")) {
        var tds = el.querySelectorAll("td");
        out.push(par(inlineRuns(tds[0]) + TAB + inlineRuns(tds[1]), { tabRight: true, spaceAfter: 240 }));
      } else if (el.tagName === "TABLE" && cls.contains("req")) {
        out.push(tableXml(el));
      } else if (cls.contains("line")) {
        /* строка расписания/сметы: <b>метка</b><span>текст</span> */
        var lb = el.querySelector("b"), ls = el.querySelector("span");
        out.push(par(run((lb ? lb.textContent : "") + "  ", { bold: true }) + (ls ? inlineRuns(ls) : ""), { spaceAfter: 60 }));
      } else if (el.tagName === "P") {
        var note = cls.contains("doc-note");
        out.push(par(inlineRuns(el, note ? { italic: true, color: "555555", sz: 18 } : {}),
          { jc: note || el.style.textAlign === "center" ? (el.style.textAlign === "center" ? "center" : "left") : "both", spaceAfter: 140 }));
      }
    });
    return out.join("");
  }

  var CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    "</Types>";
  var RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  var DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    "</Relationships>";
  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:docDefaults><w:rPrDefault><w:rPr>" +
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
    '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/>' +
    "</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>" +
    '<w:spacing w:after="140" w:line="300" w:lineRule="auto"/>' +
    "</w:pPr></w:pPrDefault></w:docDefaults></w:styles>";

  function documentXml(paper) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      bodyXml(paper) +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>' +
      "</w:sectPr></w:body></w:document>";
  }

  function build(paper) {
    return zip([
      { name: "[Content_Types].xml", data: CONTENT_TYPES },
      { name: "_rels/.rels", data: RELS },
      { name: "word/_rels/document.xml.rels", data: DOC_RELS },
      { name: "word/styles.xml", data: STYLES },
      { name: "word/document.xml", data: documentXml(paper) }
    ]);
  }

  window.PobubnimDocx = {
    build: build,
    download: function (paper, filename) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(build(paper));
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
  };
})();
