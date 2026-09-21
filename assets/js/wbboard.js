/* ПОБУБНИМ — доска «баланс белого и смешанный свет»
   (uroki/balans-belogo.html).

   Цвет источников считается, а не подбирается на глаз: кельвины → координаты
   цветности планковского локуса (приближение Kim et al., применимость
   1667–25000 K) → XYZ → линейный sRGB (IEC 61966-2-1) → гамма. Приближение
   сверено интегралом закона Планка с функциями сложения цвета CIE 1931:
   худшее расхождение 0,003, на источнике A (2856 K) — 0,0005 (EDU_BASE §8о.3).

   Баланс белого камеры считается делением каналов на белый выбранной
   температуры — это МОДЕЛЬ фон Криза в sRGB, а не матрица конкретной камеры;
   зелень люминесцентной лампы задана отдельным множителем по зелёному каналу.
   И то и другое подписано на странице. */

(function () {
  var board = document.getElementById("wb");
  if (!board) return;
  var cv = document.getElementById("wb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("wb-stat");

  /* [название, кельвины (null — выключен), зелёный выброс] */
  var LEFT = [["Окно 5600 K", 5600, 0], ["Пасмурно 7000 K", 7000, 0],
              ["Лампа 3000 K", 3000, 0], ["Свеча 1900 K", 1900, 0]];
  var RIGHT = [["Лампа 3000 K", 3000, 0], ["Галоген 3200 K", 3200, 0],
               ["Люминесцент 4000 K", 4000, 0.18], ["Выключен", null, 0]];
  var KELV = [2500, 2800, 3000, 3200, 3600, 4000, 4500, 5000, 5600, 6500, 7500, 9000];

  var state = { left: 0, right: 0, wb: 8, tint: 0 };

  function tl() { return LEFT[state.left][1]; }
  function tr() { return RIGHT[state.right][1]; }
  function cam() { return KELV[state.wb]; }

  /* ---------- цвет ---------- */

  /* планковский локус: кельвины → x, y (Kim et al., 2002) */
  function locus(T) {
    var x = T < 4000
      ? -0.2661239e9 / (T * T * T) - 0.2343589e6 / (T * T) + 0.8776956e3 / T + 0.179910
      : -3.0258469e9 / (T * T * T) + 2.1070379e6 / (T * T) + 0.2226347e3 / T + 0.240390;
    var y = T < 2222
      ? -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683
      : T < 4000
        ? -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
        : 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
    return [x, y];
  }

  /* x, y → линейный sRGB с яркостью 1 */
  function linRgb(T) {
    var c = locus(T), x = c[0], y = c[1];
    var X = x / y, Y = 1, Z = (1 - x - y) / y;
    return [
      3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
      0.0557 * X - 0.2040 * Y + 1.0570 * Z
    ];
  }

  function luma(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }

  /* белый камеры: температура баланса плюс оттенок по оси зелёный—пурпурный */
  function camWhite() {
    var w = linRgb(cam()), g = state.tint / 100;
    return [w[0], w[1] * (1 + g), w[2]];
  }

  /* как выглядит источник, снятый с этим балансом: деление каналов (фон Криз) */
  function cast(T, green) {
    if (T === null) return [0, 0, 0];
    var s = linRgb(T), w = camWhite();
    var c = [s[0] / w[0], s[1] / w[1] * (1 + green), s[2] / w[2]];
    var k = luma(c);
    return k > 0 ? [c[0] / k, c[1] / k, c[2] / k] : [1, 1, 1];
  }

  function gamma(v) {
    v = Math.max(0, Math.min(1, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }
  function css(c, scale) {
    return "rgb(" + Math.round(gamma(c[0] * scale) * 255) + "," +
      Math.round(gamma(c[1] * scale) * 255) + "," +
      Math.round(gamma(c[2] * scale) * 255) + ")";
  }

  /* ---------- рисование ---------- */
  var W = 880, H = 420;
  var HEAD = { x: 440, y: 196, r: 132 };

  function draw() {
    var cl = cast(tl(), LEFT[state.left][2]);
    var cr = cast(tr(), RIGHT[state.right][2]);
    var on = tr() !== null ? 1 : 0;

    /* стена: усреднённый свет обоих источников, приглушённый */
    var wall = [(cl[0] + cr[0] * on) / (1 + on), (cl[1] + cr[1] * on) / (1 + on),
                (cl[2] + cr[2] * on) / (1 + on)];
    ctx.fillStyle = css(wall, 0.07);
    ctx.fillRect(0, 0, W, H);

    var img = ctx.getImageData(0, 0, W, H);
    var d = img.data;
    var r = HEAD.r;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var dx = x - HEAD.x, dy = y - HEAD.y;
        var rr = Math.sqrt(dx * dx + dy * dy);
        if (rr > r) continue;
        var nz = Math.sqrt(Math.max(0, 1 - (rr / r) * (rr / r)));
        var nx = dx / r, ny = dy / r;
        /* слева и справа под 55° к оси камеры, чуть сверху */
        var wl = Math.max(0, -nx * 0.82 + nz * 0.5 - ny * 0.2);
        var wrr = on ? Math.max(0, nx * 0.82 + nz * 0.5 - ny * 0.2) : 0;
        var i = (y * W + x) * 4;
        d[i] = Math.round(gamma((cl[0] * wl + cr[0] * wrr) * 0.92) * 255);
        d[i + 1] = Math.round(gamma((cl[1] * wl + cr[1] * wrr) * 0.92) * 255);
        d[i + 2] = Math.round(gamma((cl[2] * wl + cr[2] * wrr) * 0.92) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);

    swatches(cl, cr, on);
    labels();
    stats();
  }

  /* образцы белой карты под каждым источником — по ним видно цвет без лица */
  function swatches(cl, cr, on) {
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    box(40, 300, cl, LEFT[state.left][0]);
    if (on) box(700, 300, cr, RIGHT[state.right][0]);

    function box(x, y, c, name) {
      ctx.fillStyle = css(c, 0.82);
      ctx.fillRect(x, y, 140, 74);
      ctx.strokeStyle = "rgba(245,239,226,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, 139, 73);
      ctx.fillStyle = "rgba(245,239,226,0.65)";
      ctx.fillText("БЕЛАЯ КАРТА", x, y - 20);
      ctx.fillText(name.toUpperCase(), x, y - 7);
    }
  }

  function labels() {
    ctx.font = "500 12px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.fillText("БАЛАНС БЕЛОГО КАМЕРЫ " + cam() + " K" +
      (state.tint ? " · ОТТЕНОК " + (state.tint > 0 ? "+" : "") + state.tint : ""), 20, 28);
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.fillText("ИСТОЧНИК СЛЕВА", 40, 52);
    if (tr() !== null) ctx.fillText("ИСТОЧНИК СПРАВА", 700, 52);
  }

  /* насколько половина лица уходит от нейтрали и куда */
  function drift(T) {
    if (T === null) return null;
    return T - cam();
  }
  function driftWord(T) {
    var d = drift(T);
    if (d === null) return "выключен";
    if (Math.abs(d) < 150) return "нейтрально";
    return (d > 0 ? "в синеву" : "в тепло") + " · " +
      (d > 0 ? "+" : "") + Math.round(d) + " K";
  }

  function stats() {
    var gap = tr() === null ? 0 : Math.abs(tl() - tr());
    var bad = gap > 800;
    statEl.innerHTML =
      '<span class="' + (Math.abs(drift(tl())) > 400 ? "warn" : "") + '"><i>ЛЕВАЯ ПОЛОВИНА</i>' +
        driftWord(tl()) + "</span>" +
      '<span class="' + (tr() !== null && Math.abs(drift(tr())) > 400 ? "warn" : "") +
        '"><i>ПРАВАЯ ПОЛОВИНА</i>' + driftWord(tr()) + "</span>" +
      '<span class="' + (bad ? "warn" : "") + '"><i>РАЗБЕГ ИСТОЧНИКОВ</i>' +
        (tr() === null ? "один источник" : gap + " K") + "</span>" +
      '<span class="' + (bad ? "warn" : "") + '"><i>НА ПОСТЕ</i>' +
        (bad ? "одним балансом не свести" : "сводится") + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-wb")) { state.wb = +r.value; sv.textContent = cam() + " K"; }
    else if (r.hasAttribute("data-tint")) {
      state.tint = +r.value;
      sv.textContent = (state.tint > 0 ? "+" : "") + state.tint;
    }
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    if (b.hasAttribute("data-left")) state.left = +b.dataset.left;
    else if (b.hasAttribute("data-right")) state.right = +b.dataset.right;
    draw();
  });

  draw();
  window.PobubnimWb = {
    state: state, locus: locus, linRgb: linRgb, cast: cast, camWhite: camWhite,
    tl: tl, tr: tr, cam: cam, drift: drift, draw: draw
  };
})();
