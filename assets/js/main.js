/* ПОБУБНИМ — поведение главной. Карточки работ строит tools/build_films.py,
   их поведение — assets/js/films.js. Форма заявки — assets/js/lead.js
   (общая для всех страниц). Без библиотек. */

/* ---------- навигация: фон после первого экрана ---------- */

const nav = document.getElementById("nav");
addEventListener("scroll", () => {
  nav.classList.toggle("solid", scrollY > innerHeight * 0.6);
}, { passive: true });

/* ---------- появление секций ---------- */

const io = new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("on"); io.unobserve(en.target); } });
}, { threshold: 0.12 });
document.querySelectorAll(".rv").forEach(el => io.observe(el));
