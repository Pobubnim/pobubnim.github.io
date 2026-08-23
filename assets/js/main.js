/* ПОБУБНИМ — каталог работ + поведение страницы. Без библиотек. */

const LIB = "https://seversvet.github.io/assets/film/";

/* Видеоработы на главной: id из фильмотеки СЕВЕРСВЕТ (снято и покрашено мной). */
const FILMS = [
  { id: "fabrik",     t: "FABRIK",              s: "Имиджевый ролик · ГК OSTOV",  len: "1:08" },
  { id: "ostov",      t: "ГК ОСТОВ",            s: "Имиджевый ролик",             len: "1:22" },
  { id: "abilympics", t: "Абилимпикс 2025",     s: "Отчётный ролик чемпионата",   len: "2:59" },
  { id: "principled", t: "«Принципиальный»",    s: "Короткий метр",               len: "10:47" },
  { id: "wedding-de", t: "Дмитрий и Евгения",   s: "Свадебное кино · 2.67:1",     len: "2:37" },
  { id: "polya",      t: "«Поля»",              s: "Fashion-муд · натура",        len: "1:59", local: true },
  { id: "teaser-soon",t: "«Скоро»",             s: "Тизер проекта · ночь и огонь",len: "0:31" },
  { id: "banshee",    t: "Vo Devil × Stokes",   s: "Музыкальный клип",            len: "4:11" },
  { id: "evergo",     t: "EverGO",              s: "Реклама батончиков",          len: "0:19" },
  { id: "box",        t: "Бокс",                s: "Спортивный ролик",            len: "0:54" },
  { id: "ftx",        t: "FTX",                 s: "Мотофристайл · фестиваль",    len: "1:16", local: true },
];

const FILMS_VERT = [
  { id: "v-patek", t: "Patek Philippe × DiW", s: "Реклама часов · 9:16", len: "0:16" },
  { id: "v-rolex", t: "Rolex Daytona × DiW",  s: "Реклама часов · 9:16", len: "0:15" },
  { id: "v-cult",  t: "CULT",                 s: "Лукбук · стоп-моушен", len: "0:45" },
  { id: "v-gym",   t: "Зал",                  s: "Спорт · 9:16",         len: "1:00" },
];

/* Лента тройников: файл assets/img/<img>.webp, подпись. Коллажи целиком, не резать. */
const STRIP = [
  { img: "tri-race-1",        cap: "Автоспорт · трек-день" },
  { img: "tri-ballet",        cap: "Клип · балет в контровом" },
  { img: "tri-factory-4",     cap: "Промо завода · смена" },
  { img: "tri-wedding-2",     cap: "Свадебное кино" },
  { img: "tri-music",         cap: "Клип · оркестр и вокал" },
  { img: "tri-bar",           cap: "Фуд и бар · подача" },
  { img: "tri-art-red-coat",  cap: "Арт · красное на ч/б" },
  { img: "tri-phone-1",       cap: "Предметка · смартфоны" },
  { img: "tri-field-1",       cap: "«Поля» · натура" },
  { img: "tri-cabaret",       cap: "Кабаре · гримёрка" },
  { img: "tri-boxing",        cap: "Спорт · ринг" },
  { img: "tri-cine-portraits",cap: "Кино-портреты" },
  { img: "tri-city-2",        cap: "Город · фактуры" },
  { img: "tri-concert",       cap: "Концерт · сцена" },
  { img: "still-street",      cap: "Портрет · панелька" },
];

/* ---------- рендер карточек ---------- */

function filmCard(f, vert) {
  const poster = f.local ? `assets/img/${f.id}-poster.webp` : `${LIB}${f.id}.webp`;
  const base = f.local ? "assets/video/" : LIB;
  const el = document.createElement("article");
  el.className = "film";
  el.innerHTML =
    `<img loading="lazy" src="${poster}" alt="${f.t} — ${f.s}">` +
    `<video muted loop playsinline preload="none" src="${base}${f.id}-loop.mp4"></video>` +
    `<span class="film-len">${f.len}</span>` +
    `<div class="film-cap"><b>${f.t}</b><span>${f.s}</span></div>`;
  const v = el.querySelector("video");
  el.addEventListener("mouseenter", () => { v.play().catch(() => {}); el.classList.add("playing"); });
  el.addEventListener("mouseleave", () => { v.pause(); el.classList.remove("playing"); });
  el.addEventListener("click", () => openPlayer((f.local ? "assets/video/" : LIB) + f.id + ".mp4", vert));
  return el;
}

const grid = document.getElementById("films-grid");
FILMS.forEach(f => grid.appendChild(filmCard(f, false)));
const more = document.createElement("a");
more.className = "film film-more";
more.href = "https://t.me/pobubnimzavideo";
more.target = "_blank"; more.rel = "noopener";
more.innerHTML = `<div class="film-more-in"><b>Больше — в канале</b><span>разборы, бекстейджи, свежие работы →</span></div>`;
grid.appendChild(more);
const gridV = document.getElementById("films-vert");
FILMS_VERT.forEach(f => gridV.appendChild(filmCard(f, true)));

const strip = document.getElementById("strip");
STRIP.forEach(s => {
  const fig = document.createElement("figure");
  fig.innerHTML = `<img loading="lazy" src="assets/img/${s.img}.webp" alt="${s.cap}"><figcaption>${s.cap}</figcaption>`;
  strip.appendChild(fig);
});

/* ---------- модальный плеер ---------- */

const player = document.getElementById("player");
const pVideo = player.querySelector("video");

function openPlayer(src, vert) {
  if (vert) player.setAttribute("data-vert", ""); else player.removeAttribute("data-vert");
  pVideo.src = src;
  player.showModal();
  pVideo.play().catch(() => {});
}
function closePlayer() { pVideo.pause(); pVideo.removeAttribute("src"); pVideo.load(); player.close(); }
player.querySelector(".close").addEventListener("click", closePlayer);
player.addEventListener("click", e => { if (e.target === player) closePlayer(); });
player.addEventListener("close", () => { pVideo.pause(); });

/* ---------- лид-форма: сборка заявки в телеграм ---------- */

const lead = document.getElementById("lead");
document.querySelectorAll("[data-lead]").forEach(b => b.addEventListener("click", () => lead.showModal()));
if (location.hash === "#zayavka") lead.showModal();
addEventListener("hashchange", () => { if (location.hash === "#zayavka") lead.showModal(); });
document.getElementById("lf-send").addEventListener("click", () => {
  const name = document.getElementById("lf-name").value.trim();
  const what = document.getElementById("lf-what").value;
  const desc = document.getElementById("lf-desc").value.trim();
  const text = `Привет! Заявка с сайта ПОБУБНИМ.

Имя: ${name || "—"}
Нужно: ${what}
Задача: ${desc || "—"}`;
  open(`https://t.me/sbphotoshoter?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  lead.close();
});

/* ---------- hero: HD-версия для больших экранов ---------- */

const heroVideo = document.querySelector(".hero video");
if (heroVideo && innerWidth >= 1024 && !(navigator.connection && navigator.connection.saveData)) {
  heroVideo.src = "assets/video/hero-loop-hd.mp4";
}

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
