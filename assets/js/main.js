/* ПОБУБНИМ — поведение главной. Карточки работ строит tools/build_films.py,
   их поведение — assets/js/films.js. Без библиотек. */

/* ---------- лид-форма: сборка заявки в телеграм ---------- */

const lead = document.getElementById("lead");
document.querySelectorAll("[data-lead]").forEach(b => b.addEventListener("click", () => lead.showModal()));
if (location.hash === "#zayavka") lead.showModal();
addEventListener("hashchange", () => { if (location.hash === "#zayavka") lead.showModal(); });
const LEAD_RPC = "https://jkdrnaagjplpyhlsmxii.supabase.co/rest/v1/rpc/site_lead_create";
const LEAD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZHJuYWFnanBscHlobHNteGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDM1NzksImV4cCI6MjA5ODU3OTU3OX0.LP0aO74dEjIYr5oGFXCRz4js-GxZTx2jrCZxVqrTWAo";
const lfSend = document.getElementById("lf-send");
lfSend.addEventListener("click", async () => {
  const name = document.getElementById("lf-name").value.trim();
  const contact = document.getElementById("lf-contact").value.trim();
  const what = document.getElementById("lf-what").value;
  const desc = document.getElementById("lf-desc").value.trim();
  const status = document.getElementById("lf-status");
  if (!contact) {
    document.getElementById("lf-contact").focus();
    status.textContent = "Оставьте телефон или телеграм — иначе мне некуда ответить.";
    return;
  }
  lfSend.disabled = true;
  lfSend.textContent = "Отправляю…";
  try {
    const r = await fetch(LEAD_RPC, {
      method: "POST",
      headers: { apikey: LEAD_KEY, Authorization: "Bearer " + LEAD_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p: {
        name, contact, service: what, message: desc,
        page: location.pathname + location.hash,
        website: document.getElementById("lf-website").value,
      } }),
    });
    const res = await r.json();
    if (!res.ok) throw new Error(res.error || "fail");
    lfSend.textContent = "Заявка у меня — отвечу в тот же день";
    status.textContent = "Готово. Если удобнее мессенджер — я и там на связи: @sbphotoshoter.";
    setTimeout(() => {
      lead.close();
      lfSend.disabled = false;
      lfSend.textContent = "Отправить заявку";
    }, 2600);
  } catch (_) {
    // сеть или бэкенд легли: не теряем человека, открываем чат с готовым текстом
    const text = `Привет! Заявка с сайта ПОБУБНИМ.

Имя: ${name || "—"}
Контакт: ${contact}
Нужно: ${what}
Задача: ${desc || "—"}`;
    open(`https://t.me/sbphotoshoter?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    lfSend.disabled = false;
    lfSend.textContent = "Отправить заявку";
    lead.close();
  }
});

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
