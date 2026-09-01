/* Поведение карточек работ: наведение оживляет петлю, клик открывает плеер.
   Саму разметку карточек строит tools/build_films.py из data/films.json —
   раньше её рисовал JS, и в HTML не было ни одного названия работы.

   Петля лежит поверх постера и проявляется только с первым готовым кадром:
   раньше .playing вешался в момент наведения, и всё время загрузки (замер на
   канале 400 Кбит/с — до 7 секунд) поверх постера стоял пустой видеослой. */

(function () {
  const player = document.getElementById("player");
  if (!player) return;
  const pVideo = player.querySelector("video");

  const ready = () => player.removeAttribute("data-loading");
  ["loadeddata", "playing", "error"].forEach(n => pVideo.addEventListener(n, ready));

  function openPlayer(src, vert, poster) {
    if (vert) player.setAttribute("data-vert", ""); else player.removeAttribute("data-vert");
    /* постер карточки уже в кэше: даёт кадр и размер вместо чёрной полосы,
       пока тянется полный ролик */
    if (poster) pVideo.poster = poster; else pVideo.removeAttribute("poster");
    player.setAttribute("data-loading", "");
    pVideo.src = src;
    player.showModal();
    pVideo.play().catch(() => {});
  }
  /* выход один на все способы закрытия — крестик, фон и Esc: иначе ролик
     остаётся присоединённым к плееру и продолжает висеть в памяти и в сети */
  player.addEventListener("close", () => {
    pVideo.pause();
    pVideo.removeAttribute("src");
    pVideo.removeAttribute("poster");
    player.removeAttribute("data-loading");
    pVideo.load();
  });
  player.querySelector(".close").addEventListener("click", () => player.close());
  player.addEventListener("click", e => { if (e.target === player) player.close(); });

  const conn = navigator.connection || {};
  const spare = conn.saveData || /2g/.test(conn.effectiveType || "") ||
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* на тач-экранах наведения нет вовсе — петлю включает видимость карточки */
  const ctl = new WeakMap();
  const inView = matchMedia("(hover: none)").matches && !spare
    ? new IntersectionObserver(entries => {
        entries.forEach(en => {
          const c = ctl.get(en.target);
          if (!c) return;
          if (en.isIntersecting && en.intersectionRatio >= 0.6) c.start(); else c.stop();
        });
      }, { threshold: [0, 0.6] })
    : null;

  document.querySelectorAll(".film[data-src]").forEach(el => {
    const v = el.querySelector("video");
    const img = el.querySelector("img");
    const vert = el.hasAttribute("data-vert");
    if (img) {
      /* обложки работ живут на соседней площадке: если она недоступна, карточка
         должна остаться плашкой с названием, а не битой картинкой с alt-текстом */
      const noimg = () => el.classList.add("noimg");
      img.addEventListener("error", noimg);
      if (img.complete && img.naturalWidth === 0) noimg();
    }
    if (v) {
      let want = false;
      const show = () => { if (want) el.classList.add("playing"); };
      const start = () => {
        want = true;
        if (v.readyState >= 3) show();
        v.play().then(show).catch(() => {});
      };
      const stop = () => { want = false; el.classList.remove("playing"); v.pause(); };
      v.addEventListener("playing", show);
      el.addEventListener("mouseenter", start);
      el.addEventListener("mouseleave", stop);
      ctl.set(el, { start, stop });
      if (inView) inView.observe(el);
    }
    const open = () => openPlayer(el.dataset.src, vert, img && (img.currentSrc || img.src));
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
})();
