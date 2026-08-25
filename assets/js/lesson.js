/* ПОБУБНИМ — поведение виз-блоков уроков и статей (пара к lesson.css).
   Появление .lv при скролле, интерактивный вайп до/после, лаборатории-ползунки. */

(function () {
  /* появление при скролле */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("on"); io.unobserve(en.target); }
    });
  }, { threshold: 0.18 });
  document.querySelectorAll(".lv").forEach(function (el) { io.observe(el); });

  /* вайп до/после: range двигает clip-path и линию */
  document.querySelectorAll(".wipe").forEach(function (w) {
    var graded = w.querySelector(".wipe-graded");
    var line = w.querySelector(".wipe-line");
    var range = w.querySelector(".wipe-range");
    if (!graded || !range) return;
    function set(v) {
      graded.style.clipPath = "inset(0 " + (100 - v) + "% 0 0)";
      if (line) line.style.left = v + "%";
    }
    range.addEventListener("input", function () { set(+range.value); });
    set(+range.value);
  });

  /* лаборатория: ползунок крутит CSS-фильтр на кадре.
     data-lab-target = селектор img; data-lab-filter = имя фильтра (saturate|contrast|brightness);
     значение = value/100. Подпись .sv показывает проценты. */
  document.querySelectorAll("input.lab-range[data-lab-target]").forEach(function (r) {
    var img = document.querySelector(r.getAttribute("data-lab-target"));
    var sv = r.closest(".lab-row") && r.closest(".lab-row").querySelector(".sv");
    if (!img) return;
    var base = img.getAttribute("data-lab-base") || "";
    var fn = r.getAttribute("data-lab-filter") || "saturate";
    function apply() {
      img.style.filter = base + " " + fn + "(" + (+r.value / 100) + ")";
      if (sv) sv.textContent = r.value + "%";
    }
    r.addEventListener("input", apply);
    apply();
  });
})();
