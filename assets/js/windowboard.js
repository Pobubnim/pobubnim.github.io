/* ПОБУБНИМ — доска «свет из окна» (uroki/svet-iz-okna.html).

   Считает свет от ПЛОЩАДНОГО источника, а не от точки. Обратный квадрат выведен
   для точечного источника и у окна вблизи врёт в разы: освещённость на оси от
   равномерного ламбертова диска радиуса R равна

     E(d) / E(0) = R² / (R² + d²),   R = √(A/π)

   При d ≫ R формула переходит в привычный обратный квадрат. Вывод и сверка
   численным интегрированием по квадратной площадке — EDU_BASE §8п.2;
   поворот героя — косинус Ламберта, §8п.3; мягкость и полутень — §8о.2.

   МОДЕЛИ, подписанные на странице: отражение от стен комнаты взято 3 % ключа
   (у светлой комнаты больше, у чёрной студии меньше); отражатель — ламбертов
   белый, ρ = 0,8, серебро с направленным отблеском так не считается; голова —
   шар, поэтому рисунок на ней геометрически правильный, но без носа и скул. */

(function () {
  var board = document.getElementById("wb");
  if (!board) return;
  var cv = document.getElementById("wb-frame");
  var ctx = cv.getContext("2d");
  var statEl = document.getElementById("wb-stat");

  var W = 880, H = 420;
  var PLAN = { x: 0, y: 0, w: 392, h: 286 };
  var SHOT = { x: 408, y: 0, w: 472, h: 286 };
  var GRAPH = { x: 0, y: 300, w: 880, h: 118 };
  var HEAD = 0.22;         /* ширина головы, м */
  var CAM = 2.0;           /* камера в двух метрах от героя — для масштаба фона */

  var AMB = 0.03;          /* отражение от стен комнаты — модель */
  var RHO = 0.8;           /* белая сторона отражателя */
  var REFL_A = 1.0;        /* отражатель 1 м² */
  var FACE = 0.16;         /* ширина лица, м */

  var state = { win: 1.5, refl: 1.0, d: 1.2, rot: 45, bg: 1.5 };

  /* ---------- физика ---------- */
  function radiusOf(area) { return Math.sqrt(area / Math.PI); }
  function disc(R, d) { return R * R / (R * R + d * d); }

  function winR() { return radiusOf(state.win * state.win); }
  function key(d) { return disc(winR(), Math.max(d, 0.01)); }
  function fill() { return state.refl ? RHO * disc(radiusOf(REFL_A), state.refl) : 0; }

  /* угловой размер окна с позиции героя (§8о.2) */
  function angular() { return 2 * Math.atan(state.win / (2 * state.d)) * 180 / Math.PI; }

  /* перепад по лицу от одной дистанции: ближняя щека на 8 см ближе дальней */
  function faceFall() {
    return Math.log(key(state.d - FACE / 2) / key(state.d + FACE / 2)) / Math.LN2;
  }

  /* фон за героем темнее героя на столько ступеней */
  function bgFall() {
    return Math.log(key(state.d) / key(state.d + state.bg)) / Math.LN2;
  }

  /* потеря на плоскости, повёрнутой от окна (§8п.3) */
  function turnLoss() {
    var c = Math.cos(state.rot * Math.PI / 180);
    return c > 0.001 ? -Math.log(c) / Math.LN2 : Infinity;
  }

  /* направление на окно в системе камеры: герой повёрнут от окна на rot */
  function lightDir() {
    var a = state.rot * Math.PI / 180;
    var v = [-Math.sin(a), -0.15, Math.cos(a)];
    var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  }
  function fillDir() {
    var l = lightDir();
    return [-l[0], l[1] * 0.5, Math.abs(l[2]) * 0.6 + 0.3];
  }

  /* освещённость щеки: ламберт от окна + отражатель + отражение стен */
  function cheek(side) {
    var l = lightDir(), f = fillDir();
    var nx = side * 0.5, nz = Math.sqrt(1 - nx * nx);
    var lam = nx * l[0] + nz * l[2];
    var fl = nx * f[0] + nz * f[2];
    var nf = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    var k = key(state.d + side * FACE / 2);
    return Math.max(0, lam) * k + Math.max(0, fl / nf) * fill() * k + AMB * k;
  }

  /* контраст лица: сторона к окну против теневой */
  function contrast() {
    var a = cheek(-1), b = cheek(1);
    return b > 0 ? Math.log(a / b) / Math.LN2 : Infinity;
  }

  /* ширина полутени от героя на фоне (§8о.2) */
  function penumbra() { return state.win * state.bg / state.d; }

  /* Насколько вообще темнеет фон за героем. Голова загораживает от точки фона
     лишь часть окна: отношение телесных углов головы и окна с этой точки.
     Если окно с фона «больше» головы, полной тени нет в принципе. */
  function shadowDepth() {
    var th = HEAD / state.bg;                       /* угловой размер головы с фона */
    var tw = state.win / (state.d + state.bg);      /* угловой размер окна с фона */
    var k = th / tw;
    return Math.min(1, k * k);
  }

  /* ---------- рисование ---------- */
  function draw() {
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, W, H);
    plan();
    shot();
    graph();
    stats();
  }

  function panel(p, title) {
    ctx.fillStyle = "rgba(18,16,15,0.9)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    ctx.fillStyle = "rgba(245,239,226,0.55)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText(title, p.x + 12, p.y + 18);
  }

  /* ---------- вид сверху ---------- */
  function plan() {
    panel(PLAN, "ВИД СВЕРХУ · МЕТРЫ");
    var x0 = PLAN.x + 46, cy = PLAN.y + 138;
    var pm = 58;                                  /* пикселей на метр */
    var hx = x0 + state.d * pm;
    var wx = x0 + (state.d + state.bg) * pm;
    var wh = state.win * pm;
    var right = PLAN.x + PLAN.w - 10;
    ctx.font = "500 9px 'JetBrains Mono', monospace";

    /* свет расходится от окна — трапеция, гаснущая вправо */
    var g = ctx.createLinearGradient(x0, 0, x0 + 260, 0);
    g.addColorStop(0, "rgba(198,214,240,0.30)");
    g.addColorStop(1, "rgba(198,214,240,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, cy - wh / 2);
    ctx.lineTo(x0 + 260, cy - wh / 2 - 76);
    ctx.lineTo(x0 + 260, cy + wh / 2 + 76);
    ctx.lineTo(x0, cy + wh / 2);
    ctx.closePath();
    ctx.fill();

    /* лучи с краёв окна к герою — видно угловой размер */
    ctx.strokeStyle = "rgba(198,214,240,0.4)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, cy - wh / 2); ctx.lineTo(hx, cy);
    ctx.moveTo(x0, cy + wh / 2); ctx.lineTo(hx, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    /* само окно */
    ctx.fillStyle = "#c6d6f0";
    ctx.fillRect(x0 - 6, cy - wh / 2, 6, wh);
    ctx.fillStyle = "rgba(198,214,240,0.8)";
    ctx.fillText("ОКНО " + num(state.win) + " м", x0 - 6, cy - wh / 2 - 7);
    ctx.fillStyle = "rgba(198,214,240,0.55)";
    ctx.fillText(angular().toFixed(0) + "° с места героя", x0 + 16, cy + wh / 2 + 16);

    /* стена-фон */
    if (wx < right) {
      ctx.strokeStyle = "rgba(245,239,226,0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wx + 0.5, cy - 62); ctx.lineTo(wx + 0.5, cy + 62);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(245,239,226,0.5)";
      ctx.fillText("ФОН " + num(state.bg) + " м", wx - 18, cy - 70);
    }

    /* отражатель на теневой стороне — рисуем до героя, чтобы не перекрыть */
    var a = (state.rot - 90) * Math.PI / 180;
    if (state.refl) {
      var dir = a + Math.PI / 2;
      var rx = hx + state.refl * pm * Math.cos(dir);
      var ry = cy + state.refl * pm * Math.sin(dir);
      ctx.strokeStyle = "#f5efe2";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rx - Math.cos(dir - Math.PI / 2) * 16, ry - Math.sin(dir - Math.PI / 2) * 16);
      ctx.lineTo(rx + Math.cos(dir - Math.PI / 2) * 16, ry + Math.sin(dir - Math.PI / 2) * 16);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = "rgba(245,239,226,0.55)";
      var tx = Math.min(rx + 22, right - 106), ty = ry + (ry > cy ? 14 : -8);
      ctx.fillText("ОТРАЖАТЕЛЬ " + num(state.refl) + " м", tx, ty);
      ctx.fillStyle = "rgba(245,239,226,0.4)";
      ctx.fillText("вернёт " + (fill() * 100).toFixed(0) + " % ключа", tx, ty + 12);
    }

    /* герой: кружок и стрелка взгляда */
    ctx.fillStyle = "#e0b57a";
    ctx.beginPath();
    ctx.arc(hx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f0c46e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, cy);
    ctx.lineTo(hx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(240,196,110,0.9)";
    ctx.fillText("ГЕРОЙ " + num(state.d) + " м · поворот " + state.rot + "°",
      Math.min(hx + 16, right - 152), cy - 16);

    /* камера снизу */
    var camY = cy + 78;
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.beginPath();
    ctx.moveTo(hx, camY - 9); ctx.lineTo(hx - 7, camY + 5); ctx.lineTo(hx + 7, camY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(245,239,226,0.18)";
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, camY - 10); ctx.lineTo(hx, cy + 12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText("КАМЕРА", hx + 12, camY + 3);

    /* линейка по низу */
    var ry2 = PLAN.y + PLAN.h - 22;
    ctx.strokeStyle = "rgba(245,239,226,0.14)";
    ctx.beginPath();
    ctx.moveTo(x0, ry2 + 0.5); ctx.lineTo(Math.min(x0 + 5 * pm, right), ry2 + 0.5);
    ctx.stroke();
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    for (var m = 0; m <= 5; m++) {
      var x = x0 + m * pm;
      if (x > right) break;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, ry2); ctx.lineTo(x + 0.5, ry2 - 5);
      ctx.stroke();
      ctx.fillText(m + " м", x - 8, ry2 + 13);
    }
  }

  /* ---------- кадр ---------- */
  function oetf709(L) {
    if (L < 0) L = 0;
    return L < 0.018 ? 4.5 * L : 1.099 * Math.pow(L, 0.45) - 0.099;
  }

  var shotImg = null;

  function shot() {
    panel(SHOT, "КАДР · ЭКСПОЗИЦИЯ ПО ОСВЕЩЁННОЙ ЩЕКЕ");
    var x0 = SHOT.x + 1, y0 = SHOT.y + 26, w = SHOT.w - 2, h = SHOT.h - 27;
    if (!shotImg || shotImg.width !== w) shotImg = ctx.createImageData(w, h);
    var d = shotImg.data;

    var cx = w * 0.46, cy = h * 0.48, r = h * 0.28;
    var l = lightDir(), f = fillDir();
    var nf = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
    var kf = fill();
    var pxm = 2 * r / HEAD;                 /* пикселей на метр на лице героя */

    /* экспозиция: самая светлая точка лица выходит на 0,45 линейных */
    var peak = 0;
    for (var t = -1; t <= 1; t += 0.05) {
      var nz0 = Math.sqrt(Math.max(0, 1 - t * t));
      var v = Math.max(0, t * l[0] + nz0 * l[2]) * key(state.d + t * FACE / 2);
      if (v > peak) peak = v;
    }
    var gain = peak > 0 ? 0.45 / (peak * 0.62) : 1;   /* 0,62 — альбедо кожи */

    /* фон: стена альбедо 0,25 на своей дистанции от окна */
    var bgE = key(state.d + state.bg) * (1 + AMB) * 0.25;
    /* полутень на фоне: ширина по §8о.2, глубина — по доле закрытого окна.
       Масштаб фона мельче лица: он дальше от камеры на bg метров */
    var wallScale = CAM / (CAM + state.bg);
    var shR = r * wallScale * 1.05;                        /* радиус тени на фоне */
    var halfPen = penumbra() * pxm * wallScale / 2;
    var hp = shR > 0 ? halfPen / shR : 0;
    var depth = shadowDepth();
    var shCx = cx + r * 1.15 * (l[0] < 0 ? 1 : -1);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        /* фон с тенью героя */
        var dx = (x - shCx) / shR, dy = (y - cy) / (shR * 1.22);
        var sd = Math.sqrt(dx * dx + dy * dy);
        var lit = hp > 0.01 ? (sd - (1 - hp)) / (2 * hp) : (sd < 1 ? 0 : 1);
        lit = lit < 0 ? 0 : (lit > 1 ? 1 : lit);
        var e = bgE * (1 - depth * (1 - lit)) * (1 - 0.25 * y / h);
        var rr = e * 1.02, gg = e, bb = e * 0.98;

        /* плечи: цилиндр под тем же светом, чтобы голова не висела в пустоте */
        var byTop = cy + r * 1.06;
        if (y > byTop) {
          var half = r * 0.62 + (y - byTop) * 1.25;
          var bx = (x - cx) / half;
          if (Math.abs(bx) < 1) {
            var bnz = Math.sqrt(1 - bx * bx);
            var body = Math.max(0, bx * l[0] + bnz * l[2]) * key(state.d) +
              Math.max(0, (bx * f[0] + bnz * f[2]) / nf) * kf * key(state.d) +
              AMB * key(state.d);
            rr = body * 0.15; gg = body * 0.15; bb = body * 0.17;
          }
        }
        /* шея — в тени от подбородка */
        if (y > cy + r * 0.8 && y < byTop + 6 && Math.abs(x - cx) < r * 0.36) {
          var neck = (Math.max(0, l[2]) * 0.5 + AMB) * key(state.d);
          rr = neck * 0.78; gg = neck * 0.60; bb = neck * 0.49;
        }

        /* голова */
        var hx = (x - cx) / r, hy = (y - cy) / (r * 1.22), q = hx * hx + hy * hy;
        if (q <= 1) {
          var nz = Math.sqrt(1 - q);
          var lam = Math.max(0, hx * l[0] + hy * l[1] + nz * l[2]);
          var flm = Math.max(0, (hx * f[0] + hy * f[1] + nz * f[2]) / nf);
          var kk = key(state.d + hx * FACE / 2);
          var face = lam * kk + flm * kf * kk + AMB * kk;
          rr = face * 0.78; gg = face * 0.60; bb = face * 0.49;
        }

        d[i] = oetf709(rr * gain) * 255;
        d[i + 1] = oetf709(gg * gain) * 255;
        d[i + 2] = oetf709(bb * gain) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(shotImg, x0, y0);

    ctx.fillStyle = "rgba(11,10,9,0.72)";
    ctx.fillRect(x0, y0 + h - 20, w, 20);
    ctx.fillStyle = "rgba(245,239,226,0.65)";
    ctx.font = "500 10px 'JetBrains Mono', monospace";
    ctx.fillText("УГОЛ ОКНА " + angular().toFixed(0) + "° · ПОЛУТЕНЬ " +
      num(penumbra()) + " м · ФОН ТЕМНЕЕТ ЗА ГЕРОЕМ НА " +
      (shadowDepth() * 100).toFixed(0) + " %", x0 + 10, y0 + h - 6);
  }

  /* ---------- график падения света ---------- */
  function graph() {
    var p = GRAPH;
    ctx.fillStyle = "rgba(18,16,15,0.9)";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);

    var x0 = p.x + 56, y0 = p.y + 26, w = p.w - 240, h = p.h - 50;
    var DMAX = 5, SMAX = 6;                 /* метры и ступени на шкалах */
    var R = winR();
    var ref = key(0.5);

    function px(m) { return x0 + m / DMAX * w; }
    function py(st) { return y0 + Math.min(st, SMAX) / SMAX * h; }

    ctx.strokeStyle = "rgba(245,239,226,0.1)";
    ctx.fillStyle = "rgba(245,239,226,0.4)";
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    for (var st = 0; st <= SMAX; st += 2) {
      ctx.beginPath();
      ctx.moveTo(x0, py(st) + 0.5); ctx.lineTo(x0 + w, py(st) + 0.5);
      ctx.stroke();
      ctx.fillText("−" + st + " ст.", x0 - 44, py(st) + 3);
    }
    for (var m2 = 1; m2 <= DMAX; m2++) ctx.fillText(m2 + " м", px(m2) - 8, y0 + h + 14);

    /* обратный квадрат — то, чему учат */
    ctx.strokeStyle = "rgba(245,239,226,0.32)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (var i = 0; i <= 200; i++) {
      var m3 = 0.3 + (DMAX - 0.3) * i / 200;
      ctx[i ? "lineTo" : "moveTo"](px(m3), py(2 * Math.log(m3 / 0.5) / Math.LN2));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    /* площадной источник — то, что на самом деле */
    ctx.strokeStyle = "#c6d6f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i <= 200; i++) {
      var m4 = 0.3 + (DMAX - 0.3) * i / 200;
      ctx[i ? "lineTo" : "moveTo"](px(m4), py(Math.log(ref / disc(R, m4)) / Math.LN2));
    }
    ctx.stroke();
    ctx.lineWidth = 1;

    /* где стоят герой и фон */
    mark(px(state.d), py(Math.log(ref / key(state.d)) / Math.LN2), "#f0c46e", "ГЕРОЙ");
    if (state.d + state.bg <= DMAX) {
      mark(px(state.d + state.bg),
        py(Math.log(ref / key(state.d + state.bg)) / Math.LN2), "#f5efe2", "ФОН");
    }

    ctx.fillStyle = "rgba(245,239,226,0.5)";
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.fillText("СКОЛЬКО СВЕТА ОСТАЁТСЯ, ЕСЛИ ОТОЙТИ ОТ ОКНА (от позиции 0,5 м)", x0, p.y + 16);
    var lx = x0 + w + 24;
    ctx.strokeStyle = "#c6d6f0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, y0 + 16); ctx.lineTo(lx + 22, y0 + 16);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = "#c6d6f0";
    ctx.font = "500 9.5px 'JetBrains Mono', monospace";
    ctx.fillText("окно " + num(state.win) + " м — как есть", lx + 28, y0 + 19);
    ctx.strokeStyle = "rgba(245,239,226,0.32)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, y0 + 36); ctx.lineTo(lx + 22, y0 + 36);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(245,239,226,0.5)";
    ctx.fillText("обратный квадрат —", lx + 28, y0 + 39);
    ctx.fillText("чему учат на курсах", lx + 28, y0 + 52);
  }

  function mark(x, y, color, label) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "500 9px 'JetBrains Mono', monospace";
    ctx.fillText(label, x - 12, y - 8);
  }

  /* ---------- показания ---------- */
  function num(v) {
    return (Math.round(v * 100) / 100).toString().replace(".", ",");
  }
  function st(v) {
    return !isFinite(v) ? "∞" : (Math.round(v * 100) / 100).toString().replace(".", ",");
  }

  function verdict() {
    var c = contrast(), a = angular();
    if (!isFinite(c) || c > 4) return ["теневая сторона провалится", "warn"];
    if (c < 0.4) return ["плоско: рисунка нет", "warn"];
    if (a < 25) return ["жёсткая тень на лице", "warn"];
    if (c > 2.6) return ["контрастно, но живо", ""];
    return ["мягкий рисунок", ""];
  }

  function stats() {
    var v = verdict(), a = angular(), c = contrast();
    statEl.innerHTML =
      '<span class="' + (a < 25 ? "warn" : "") + '"><i>УГОЛ ОКНА</i>' +
        a.toFixed(0) + "°</span>" +
      '<span><i>ПЕРЕПАД ПО ЛИЦУ</i>' + st(faceFall()) + " ст.</span>" +
      '<span class="' + (!isFinite(c) || c > 4 || c < 0.4 ? "warn" : "") +
        '"><i>КОНТРАСТ ЛИЦА</i>' + st(c) + " ст.</span>" +
      '<span><i>ФОН ТЕМНЕЕ</i>' + st(bgFall()) + " ст.</span>" +
      '<span class="' + v[1] + '"><i>ВЕРДИКТ</i>' + v[0] + "</span>";
  }

  /* ---------- управление ---------- */
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".vbtn");
    if (!b) return;
    [].forEach.call(b.parentNode.querySelectorAll(".vbtn"), function (x) {
      x.classList.remove("on");
    });
    b.classList.add("on");
    if (b.hasAttribute("data-win")) state.win = +b.dataset.win;
    else if (b.hasAttribute("data-refl")) state.refl = +b.dataset.refl;
    draw();
  });
  board.addEventListener("input", function (e) {
    var r = e.target.closest(".lab-range");
    if (!r) return;
    var sv = r.closest(".lab-row").querySelector(".sv");
    if (r.hasAttribute("data-dist")) {
      state.d = +r.value / 10;
      sv.textContent = num(state.d) + " м";
    } else if (r.hasAttribute("data-rot")) {
      state.rot = +r.value;
      sv.textContent = state.rot + "°";
    } else if (r.hasAttribute("data-bg")) {
      state.bg = +r.value / 10;
      sv.textContent = num(state.bg) + " м";
    }
    draw();
  });

  draw();
  window.PobubnimWindow = {
    state: state, draw: draw, disc: disc, key: key, fill: fill,
    angular: angular, faceFall: faceFall, bgFall: bgFall, turnLoss: turnLoss,
    contrast: contrast, cheek: cheek, penumbra: penumbra, winR: winR,
    shadowDepth: shadowDepth, amb: AMB, rho: RHO, head: HEAD, face: FACE
  };
})();
