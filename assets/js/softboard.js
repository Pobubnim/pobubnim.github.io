/* ПОБУБНИМ — доска «мягкий свет: размер, а не мощность»
   (uroki/myagkij-svet.html).

   Считает, а не имитирует. Ширина полутени на фоне — точная геометрия:
   S · L / D, где S — размер источника, D — расстояние до героя, L — расстояние
   от героя до фона. Формула выведена и сверена трассировкой лучей (EDU_BASE §8о.2).
   Угловой размер источника θ = 2·arctg(S / 2D); падение света на фон — обратный
   квадрат, 2·log₂((D+L)/D) ступеней.

   Модель (подписана на странице): переход свет-тень НА САМОМ ЛИЦЕ рисуется
   линейной растяжкой шириной в удвоенный угловой радиус источника — направление
   верное, точная форма зависит от формы источника и кожи. Полутень на фоне и
   падение света — формулы, без допущений. */

(function () {
  var board = document.getElementById("sf");
  if (!board) return;
  var cv = document.getElementById("sf-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("sf-stat");

  /* [название, размер в метрах; null — солнце] */
  var SRC = [["Голая лампа", 0.1], ["Софтбокс 60 см", 0.6], ["Софтбокс 120 см", 1.2],
             ["Окно 1,5 м", 1.5], ["Солнце", null]];
  var DIST = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];
  var BG = [0.3, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
  /* угловой размер солнца: диаметр 1,392·10⁹ м на расстоянии 1,496·10¹¹ м */
  var SUN = 1.392e9 / 1.496e11;

  var state = { src: 1, dist: 2, bg: 4 };

  function size() { return SRC[state.src][1]; }
  function sun() { return size() === null; }
  function D() { return DIST[state.dist]; }
  function L() { return BG[state.bg]; }

  /* отношение размера источника к расстоянию — из него растёт всё остальное */
  function ratio() { return sun() ? SUN : size() / D(); }
  /* угловой размер источника с точки зрения героя, в градусах */
  function angle() { return 2 * Math.atan(ratio() / 2) * 180 / Math.PI; }
  /* ширина полутени на фоне, в метрах */
  function penumbra() { return ratio() * L(); }
  /* насколько фон темнее героя, в ступенях */
  function falloff() { return sun() ? 0 : 2 * Math.log((D() + L()) / D()) / Math.LN2; }

  function verdict() {
    var a = angle();
    if (a >= 30) return ["очень мягко", ""];
    if (a >= 15) return ["мягко", ""];
    if (a >= 5) return ["среднее", ""];
    return ["жёстко", "warn"];
  }

  /* ---------- рисование ---------- */
  var W = 880, H = 420;
  var PLAN = { x: 0, w: 452 };
  var SHOT = { x: 472, w: 408, h: 300 };
  var STRIP = { y: 318, h: 96 };
  var MPX = 54;                        /* пикселей на метр на плане сбоку */

  function draw() {
    ctx.clearRect(0, 0, W, H);
    plan();
    shot();
    strip();
    stats();
  }

  function plan() {
    ctx.fillStyle = "#121110";
    ctx.fillRect(PLAN.x, 0, PLAN.w, H);

    var cy = H / 2 - 18;
    var sx = 34;
    var hx = sx + D() * MPX;
    var wx = hx + L() * MPX;
    var half = (sun() ? 1.0 : size()) * MPX / 2;
    var pen = penumbra() * MPX;

    ctx.font = "500 10px 'JetBrains Mono', monospace";

    /* источник */
    ctx.fillStyle = "rgba(255,236,190,0.9)";
    ctx.fillRect(sx - 5, cy - half, 8, half * 2);
    ctx.fillStyle = "rgba(255,236,190,0.75)";
    ctx.fillText(sun() ? "СОЛНЦЕ · ОЧЕНЬ ДАЛЕКО" : SRC[state.src][0].toUpperCase(),
      12, cy - half - 12);

    /* крайние лучи: от краёв источника мимо героя на фон */
    ctx.strokeStyle = "rgba(255,236,190,0.32)";
    ctx.lineWidth = 1;
    [[-1, 1], [1, -1]].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(sx, cy + s[0] * half);
      ctx.lineTo(hx, cy);
      ctx.lineTo(wx, cy + s[1] * Math.min(pen, H) / 2);
      ctx.stroke();
    });

    /* герой */
    ctx.fillStyle = "#f5efe2";
    ctx.beginPath();
    ctx.arc(hx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.fillText("ГЕРОЙ", hx - 17, cy + 26);

    /* фон */
    ctx.strokeStyle = "rgba(245,239,226,0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx, 36);
    ctx.lineTo(wx, H - 76);
    ctx.stroke();
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.fillText("ФОН", wx - 12, 28);

    /* отрезок полутени на фоне */
    ctx.strokeStyle = "#f0c46e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wx, cy - Math.min(pen, H - 140) / 2);
    ctx.lineTo(wx, cy + Math.min(pen, H - 140) / 2);
    ctx.stroke();

    /* размеры внизу, где им не тесно */
    ctx.strokeStyle = "rgba(245,239,226,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, H - 58); ctx.lineTo(wx, H - 58);
    ctx.moveTo(hx, H - 63); ctx.lineTo(hx, H - 53);
    ctx.stroke();
    ctx.fillStyle = "rgba(245,239,226,0.45)";
    ctx.fillText("ДО ГЕРОЯ " + nm(D()) + " М", sx + 4, H - 66);
    ctx.fillText("ДО ФОНА " + nm(L()) + " М", hx + 6, H - 40);
    ctx.fillStyle = "#f0c46e";
    ctx.fillText("ПОЛУТЕНЬ НА ФОНЕ " + cm(penumbra()) + " · УГОЛ " +
      angle().toFixed(angle() < 10 ? 2 : 1).replace(".", ",") + "°", 12, H - 16);
  }

  /* кадр: стена с падающей тенью и герой с переходом света в тень */
  function shot() {
    var pen = Math.max(1, penumbra() * 218);
    var dark = Math.pow(2, -falloff());          /* во сколько раз фон темнее героя */
    var cx = SHOT.x + SHOT.w * 0.44, cy = SHOT.h * 0.48, r = 86;

    var wall = Math.round(205 * dark);
    ctx.fillStyle = "rgb(" + wall + "," + Math.round(wall * 0.96) + "," + Math.round(wall * 0.88) + ")";
    ctx.fillRect(SHOT.x, 0, SHOT.w, SHOT.h);

    /* падающая тень головы: край размыт ровно на ширину полутени */
    var shx = cx + r * 1.3, shy = cy + 22;
    var g = ctx.createRadialGradient(shx, shy, Math.max(1, r - pen / 2), shx, shy, r + pen / 2);
    g.addColorStop(0, "rgba(0,0,0,0.8)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(shx, shy, r + pen / 2 + 2, 0, Math.PI * 2);
    ctx.fill();

    /* герой: переход свет-тень шириной в угловой размер источника */
    var img = ctx.getImageData(SHOT.x, 0, SHOT.w, SHOT.h);
    var d = img.data;
    var sinA = Math.max(1e-4, Math.sin(Math.atan(ratio() / 2)));
    for (var y = 0; y < SHOT.h; y++) {
      for (var x = 0; x < SHOT.w; x++) {
        var px = SHOT.x + x, dx = px - cx, dy = y - cy;
        var rr = Math.sqrt(dx * dx + dy * dy);
        if (rr > r) continue;
        var nz = Math.sqrt(Math.max(0, 1 - (rr / r) * (rr / r)));
        var nl = (-dx / r) * 0.82 + nz * 0.57;   /* источник слева и чуть спереди */
        var lit = Math.max(0, Math.min(1, (nl + sinA) / (2 * sinA)));
        var v = 26 + 200 * lit;
        var i = (y * SHOT.w + x) * 4;
        d[i] = clamp(v);
        d[i + 1] = clamp(v * 0.93);
        d[i + 2] = clamp(v * 0.84);
      }
    }
    ctx.putImageData(img, SHOT.x, 0);

    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.fillText("КАДР · ИСТОЧНИК СЛЕВА · ФОН ТЕМНЕЕ НА " +
      falloff().toFixed(1).replace(".", ",") + " СТ.", SHOT.x + 10, SHOT.h - 12);
  }

  /* край тени крупно: масштаб подбирается так, чтобы переход всегда было видно,
     и подписан линейкой в сантиметрах — иначе на тёмном фоне полутень не прочесть */
  function strip() {
    var pen = penumbra();
    var span = Math.max(pen * 2.4, 0.04);        /* сколько метров показываем */
    var pxm = SHOT.w / span;
    var w = pen * pxm, mid = SHOT.x + SHOT.w / 2;

    var g = ctx.createLinearGradient(mid - w / 2, 0, mid + w / 2, 0);
    g.addColorStop(0, "#151311");
    g.addColorStop(1, "#ded7c7");
    ctx.fillStyle = "#151311";
    ctx.fillRect(SHOT.x, STRIP.y, SHOT.w, STRIP.h - 22);
    ctx.fillStyle = "#ded7c7";
    ctx.fillRect(mid + w / 2, STRIP.y, SHOT.x + SHOT.w - (mid + w / 2), STRIP.h - 22);
    ctx.fillStyle = g;
    ctx.fillRect(mid - w / 2, STRIP.y, w, STRIP.h - 22);

    /* линейка */
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(245,239,226,0.45)";
    ctx.fillText("КРАЙ ТЕНИ КРУПНО · ВИДНО " + cm(span), SHOT.x + 2, STRIP.y - 6);
    ctx.fillStyle = "#f0c46e";
    ctx.fillRect(mid - w / 2, STRIP.y + STRIP.h - 20, Math.max(1, w), 2);
    ctx.fillText("ПОЛУТЕНЬ " + cm(pen), mid - w / 2, STRIP.y + STRIP.h - 5);
  }

  function clamp(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }
  function nm(v) { return String(v).replace(".", ","); }
  function cm(m) {
    return m < 0.1 ? Math.round(m * 1000) + " мм"
      : (m < 1 ? Math.round(m * 100) + " см" : m.toFixed(2).replace(".", ",") + " м");
  }

  function stats() {
    var v = verdict();
    statEl.innerHTML =
      '<span><i>УГЛОВОЙ РАЗМЕР</i>' + angle().toFixed(angle() < 10 ? 2 : 1).replace(".", ",") + "°</span>" +
      '<span><i>ПОЛУТЕНЬ НА ФОНЕ</i>' + cm(penumbra()) + "</span>" +
      '<span><i>ФОН ТЕМНЕЕ</i>' + falloff().toFixed(1).replace(".", ",") + " ст.</span>" +
      '<span class="' + v[1] + '"><i>СВЕТ</i>' + v[0] + "</span>" +
      (sun() ? '<span><i>СОЛНЦЕ</i>расстояние ничего не меняет</span>' : "");
  }

  /* ---------- управление ---------- */
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-dist")) { state.dist = +r.value; sv.textContent = nm(D()) + " м"; }
    else if (r.hasAttribute("data-bg")) { state.bg = +r.value; sv.textContent = nm(L()) + " м"; }
    draw();
  });
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b || !b.hasAttribute("data-src")) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    state.src = +b.dataset.src;
    draw();
  });

  draw();
  window.PobubnimSoft = {
    state: state, angle: angle, penumbra: penumbra, falloff: falloff,
    ratio: ratio, D: D, L: L, size: size, draw: draw
  };
})();
