/* Поведение карточек работ: наведение оживляет петлю, клик открывает плеер.
   Саму разметку карточек строит tools/build_films.py из data/films.json —
   раньше её рисовал JS, и в HTML не было ни одного названия работы. */

(function () {
  const player = document.getElementById("player");
  if (!player) return;
  const pVideo = player.querySelector("video");

  function openPlayer(src, vert) {
    if (vert) player.setAttribute("data-vert", ""); else player.removeAttribute("data-vert");
    pVideo.src = src;
    player.showModal();
    pVideo.play().catch(() => {});
  }
  function closePlayer() {
    pVideo.pause();
    pVideo.removeAttribute("src");
    pVideo.load();
    player.close();
  }
  player.querySelector(".close").addEventListener("click", closePlayer);
  player.addEventListener("click", e => { if (e.target === player) closePlayer(); });
  player.addEventListener("close", () => pVideo.pause());

  document.querySelectorAll(".film[data-src]").forEach(el => {
    const v = el.querySelector("video");
    const vert = el.hasAttribute("data-vert");
    if (v) {
      el.addEventListener("mouseenter", () => { v.play().catch(() => {}); el.classList.add("playing"); });
      el.addEventListener("mouseleave", () => { v.pause(); el.classList.remove("playing"); });
    }
    const open = () => openPlayer(el.dataset.src, vert);
    el.addEventListener("click", open);
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
})();
