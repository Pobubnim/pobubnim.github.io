/* ПОБУБНИМ — QR-код без библиотек (ISO/IEC 18004, байтовый режим, коррекция L).
   Нужен вызывному листу: ссылка на карту печатается кодом, и человек с бумажным
   листом открывает маршрут камерой телефона. Версии 1–20 — до 858 байт, с запасом
   на любой адрес. Маска выбирается по штрафам стандарта без третьего правила.
   Приёмка — tools/test_callsheet.py: коды читает независимый декодер OpenCV. */

(function () {
  /* уровень L: слов коррекции на блок и число блоков для версий 1–20 (таблица 9 стандарта) */
  var ECC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28];
  var BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8];
  var MAX = 20;

  /* сколько модулей версии остаётся под данные и коррекцию после служебных узоров */
  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      var n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }
  function dataWords(v) { return Math.floor(rawModules(v) / 8) - ECC[v] * BLOCKS[v]; }

  /* ---------- поле Галуа GF(256), многочлен 0x11D ---------- */
  var EXP = [], LOG = [];
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; }
  })();
  function mul(a, b) { return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0; }
  /* порождающий многочлен Рида — Соломона степени deg (старший коэффициент 1 опущен) */
  function divisor(deg) {
    var g = [], root = 1, i, j;
    for (i = 0; i < deg - 1; i++) g.push(0);
    g.push(1);
    for (i = 0; i < deg; i++) {
      for (j = 0; j < deg; j++) {
        g[j] = mul(g[j], root);
        if (j + 1 < deg) g[j] ^= g[j + 1];
      }
      root = mul(root, 2);
    }
    return g;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      div.forEach(function (c, i) { r[i] ^= mul(c, f); });
    });
    return r;
  }

  /* ---------- данные: режим, длина, байты, добивка; блоки с коррекцией вперемешку ---------- */
  function codewords(bytes, v) {
    var bits = [], cap = dataWords(v) * 8, i;
    function put(val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); }
    put(4, 4);                                     /* байтовый режим */
    put(bytes.length, v < 10 ? 8 : 16);
    for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
    put(0, Math.min(4, cap - bits.length));        /* терминатор */
    put(0, (8 - bits.length % 8) % 8);
    for (i = 0; bits.length < cap; i++) put(i % 2 ? 0x11 : 0xEC, 8);
    var data = [];
    for (i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

    var nb = BLOCKS[v], ecLen = ECC[v], raw = Math.floor(rawModules(v) / 8);
    var shortN = nb - raw % nb, shortLen = Math.floor(raw / nb), div = divisor(ecLen);
    var blocks = [], at = 0, out = [];
    for (i = 0; i < nb; i++) {
      var d = data.slice(at, at + shortLen - ecLen + (i < shortN ? 0 : 1));
      at += d.length;
      blocks.push({ d: d, e: remainder(d, div) });
    }
    for (i = 0; i <= shortLen - ecLen; i++) blocks.forEach(function (b) { if (i < b.d.length) out.push(b.d[i]); });
    for (i = 0; i < ecLen; i++) blocks.forEach(function (b) { out.push(b.e[i]); });
    return out;
  }

  /* ---------- матрица ---------- */
  function matrix(text) {
    var bytes = Array.prototype.slice.call(new TextEncoder().encode(text)), v = 1;
    while (v <= MAX && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataWords(v) * 8) v++;
    if (v > MAX) return null;                       /* текст длиннее 858 байт — кода не будет */
    var size = 17 + 4 * v, m = [], fn = [], x, y, i, j;
    for (y = 0; y < size; y++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(0)); }
    function set(px, py, dark) { m[py][px] = dark ? 1 : 0; fn[py][px] = 1; }

    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      /* линии синхронизации */
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {                        /* поисковые узоры */
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), px = c[0] + dx, py = c[1] + dy;
        if (px >= 0 && px < size && py >= 0 && py < size) set(px, py, d !== 2 && d !== 4);
      }
    });
    var al = [];
    if (v > 1) {                                                                        /* выравнивающие узоры */
      var n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
      al = [6];
      for (var p = size - 7; al.length < n; p -= step) al.splice(1, 0, p);
    }
    al.forEach(function (ay, a) {
      al.forEach(function (ax, b) {
        var last = al.length - 1;
        if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    function format(mask) {                         /* 15 бит: уровень L и номер маски, код БЧХ */
      var data = (1 << 3) | mask, rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      function b(k) { return (bits >>> k) & 1; }
      for (k = 0; k <= 5; k++) set(8, k, b(k));
      set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, b(k));
      for (k = 0; k < 8; k++) set(size - 1 - k, 8, b(k));
      for (k = 8; k < 15; k++) set(8, size - 15 + k, b(k));
      set(8, size - 8, 1);
    }
    format(0);                                      /* место под формат занимаем до раскладки данных */
    if (v >= 7) {                                   /* 18 бит номера версии, два раза */
      var rem = v;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) {
        var a = size - 11 + i % 3, b2 = Math.floor(i / 3), bit = (vb >>> i) & 1;
        set(a, b2, bit); set(b2, a, bit);
      }
    }

    var cw = codewords(bytes, v), k = 0;            /* данные змейкой: парами столбцов справа налево */
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fn[y][x] && k < cw.length * 8) { m[y][x] = (cw[k >>> 3] >>> (7 - (k & 7))) & 1; k++; }
        }
      }
    }

    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x, y) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function flip(mask) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        if (!fn[yy][xx] && MASKS[mask](xx, yy)) m[yy][xx] ^= 1;
      }
    }
    /* штраф: длинные полосы, квадраты 2×2 и перекос тёмного. ponytail: третьего правила
       (ложные поисковые узоры) нет — на чтение оно не влияет, только на выбор лучшей из годных масок */
    function penalty() {
      var pen = 0, dark = 0, yy, xx, run, c;
      for (yy = 0; yy < size; yy++) {
        for (var dir = 0; dir < 2; dir++) {
          run = 0; c = -1;
          for (xx = 0; xx < size; xx++) {
            var val = dir ? m[xx][yy] : m[yy][xx];
            if (val === c) { run++; if (run === 5) pen += 3; else if (run > 5) pen++; } else { c = val; run = 1; }
          }
        }
        for (xx = 0; xx < size; xx++) {
          dark += m[yy][xx];
          if (yy && xx && m[yy][xx] === m[yy - 1][xx] && m[yy][xx] === m[yy][xx - 1] && m[yy][xx] === m[yy - 1][xx - 1]) pen += 3;
        }
      }
      return pen + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    }
    var best = 0, bestPen = Infinity;
    for (i = 0; i < 8; i++) {
      flip(i); format(i);
      var pn = penalty();
      if (pn < bestPen) { bestPen = pn; best = i; }
      flip(i);                                      /* маска обратима: повторный проход её снимает */
    }
    flip(best); format(best);
    return { size: size, version: v, mask: best, rows: m };
  }

  /* картинка PNG с полем в четыре модуля; scale — пикселей на модуль */
  function png(text, scale) {
    var q = matrix(text);
    if (!q) return "";
    scale = scale || 6;
    var n = q.size + 8, c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = c.height = n * scale;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#000";
    q.rows.forEach(function (r, y) {
      r.forEach(function (d, x) { if (d) g.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale); });
    });
    return c.toDataURL("image/png");
  }

  window.PobubnimQR = { matrix: matrix, png: png };
})();
