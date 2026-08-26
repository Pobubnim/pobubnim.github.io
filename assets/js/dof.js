/* ПОБУБНИМ — глубина резкости (instrumenty/kalkulyator-grip.html).
   Модель тонкой линзы: гиперфокал, ближняя и дальняя границы, размытие фона.
   Формулы и кружки нерезкости — docs/EDU_BASE.md §8и. Всё в браузере. */

(function () {
  /* формат: имя, ширина сенсора (мм), высота (мм) */
  var FORMATS = [
    ["Полный кадр (36×24)", 36, 24],
    ["Super35 / кино (24.9×18.7)", 24.89, 18.66],
    ["APS-C Sony, Nikon, Fuji (23.5×15.6)", 23.5, 15.6],
    ["APS-C Canon (22.3×14.9)", 22.3, 14.9],
    ["Micro 4/3 (17.3×13)", 17.3, 13],
    ["Дюймовый, 1\" (13.2×8.8)", 13.2, 8.8],
    ["Телефон, 1/1.7\" (7.6×5.7)", 7.6, 5.7]
  ];

  function diag(w, h) { return Math.sqrt(w * w + h * h); }

  /* кружок нерезкости, мм.
     mode = "print" — классика Zeiss: диагональ / 1500 (даёт привычные
     0.029 для полного кадра, 0.019 APS-C, 0.015 M4/3);
     mode = "pixel" — киношная строгость: два пикселя записи. */
  function coc(mode, w, h, px) {
    if (mode === "pixel" && px > 0) return 2 * (w / px);
    return diag(w, h) / 1500;
  }

  /* s — дистанция фокусировки в ММ, f — фокусное в мм, N — диафрагма */
  function dof(f, N, s, c) {
    var H = f * f / (N * c) + f;                 /* гиперфокальное расстояние */
    var near = s * (H - f) / (H + s - 2 * f);
    var far = s < H ? s * (H - f) / (H - s) : Infinity;
    return { H: H, near: near, far: far, total: far - near };
  }

  /* диаметр пятна размытия на сенсоре (мм) для объекта на дистанции d */
  function blur(f, N, s, d) {
    if (d <= f || s <= f) return 0;
    return (f * f * Math.abs(d - s)) / (N * d * (s - f));
  }

  function fmtDist(mm) {
    if (!isFinite(mm)) return "бесконечность";
    if (mm < 1000) return Math.round(mm / 10) + " см";
    var m = mm / 1000;
    return (m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 1 : 2)) + " м";
  }

  window.PobubnimDof = {
    FORMATS: FORMATS, coc: coc, dof: dof, blur: blur, diag: diag, fmtDist: fmtDist
  };
})();
