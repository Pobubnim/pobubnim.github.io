/* Проверка превью работ: карточка не должна показывать пустой видеослой,
   на телефоне петля обязана оживать сама, плеер — открываться с постером.
   Запуск (Chrome ставится системный, puppeteer-core берётся глобальный):

     node tools/check_film_preview.mjs [http://127.0.0.1:8901/raboty.html]

   Ноль на выходе — всё сошлось, единица — что-то из этого сломано снова. */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

/* puppeteer-core стоит глобально (npm i -g puppeteer-core) — берём его оттуда,
   чтобы в статическом репо сайта не заводить node_modules */
const globalRoot = execSync("npm root -g").toString().trim();
const entry = path.join(globalRoot, "puppeteer-core", "lib", "puppeteer", "puppeteer-core.js");
const { default: puppeteer } = await import(pathToFileURL(entry).href);

const URL_ = process.argv[2] || "http://127.0.0.1:8901/raboty.html";
const CHROME = process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SLOW = { offline: false, latency: 300, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 200 * 1024 / 8 };

const fails = [];
const ok = (name, cond, detail) => {
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--autoplay-policy=no-user-gesture-required"] });

/* 1. Десктоп на медленном канале: пока петля не готова, виден постер */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.goto(URL_, { waitUntil: "domcontentloaded" });

  const res = await page.evaluate(async () => {
    const rows = [];
    for (const f of [...document.querySelectorAll(".film[data-src]")].slice(1, 4)) {
      const v = f.querySelector("video");
      f.classList.remove("playing");
      const t0 = performance.now();
      let classAt = null;
      const mo = new MutationObserver(() => {
        if (classAt === null && f.classList.contains("playing")) classAt = Math.round(performance.now() - t0);
      });
      mo.observe(f, { attributes: true, attributeFilter: ["class"] });
      const frameAt = await new Promise(r => {
        v.addEventListener("playing", () => r(Math.round(performance.now() - t0)), { once: true });
        setTimeout(() => r(null), 25000);
        f.dispatchEvent(new MouseEvent("mouseenter"));
      });
      mo.disconnect();
      rows.push({ clip: v.src.split("/").pop(), classAt, frameAt, black: classAt !== null && frameAt !== null ? frameAt - classAt : null });
      f.dispatchEvent(new MouseEvent("mouseleave"));
    }
    return rows;
  });
  const black = res.filter(r => r.black === null || r.black > 60);
  ok("петля не показывается раньше первого кадра", black.length === 0,
    res.map(r => `${r.clip}: кадр ${r.frameAt}мс, чернота ${r.black}мс`).join("; "));
  await page.close();
}

/* 2. Телефон: наведения нет, петля видимой карточки должна стартовать сама */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  const res = await page.evaluate(async () => {
    const card = [...document.querySelectorAll(".film[data-src]")][1];
    card.scrollIntoView({ block: "center" });
    const v = card.querySelector("video");
    await new Promise(r => {
      if (v.readyState >= 3) return r();
      v.addEventListener("playing", r, { once: true });
      setTimeout(r, 20000);
    });
    return { touch: matchMedia("(hover: none)").matches, playing: card.classList.contains("playing"), paused: v.paused, t: v.currentTime };
  });
  ok("на телефоне петля оживает сама", res.touch && res.playing && !res.paused,
    `touch=${res.touch} playing=${res.playing} t=${res.t.toFixed(2)}`);
  await page.close();
}

/* 3. Плеер: постер карточки вместо чёрной полосы + индикатор до готовности */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", SLOW);
  await page.goto(URL_, { waitUntil: "domcontentloaded" });
  const res = await page.evaluate(async () => {
    const card = [...document.querySelectorAll(".film[data-src]")][1];
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    const p = document.getElementById("player"), v = p.querySelector("video");
    const spin = getComputedStyle(p, "::after").animationName;
    return { open: p.open, loading: p.hasAttribute("data-loading"), poster: !!v.poster, spin, h: Math.round(v.getBoundingClientRect().height) };
  });
  ok("плеер открывается с постером и индикатором", res.open && res.poster && res.loading && res.spin === "player-spin" && res.h > 200,
    `poster=${res.poster} loading=${res.loading} spin=${res.spin} высота=${res.h}`);

  /* закрытие с клавиатуры должно отцеплять ролик так же, как крестик */
  const esc = await page.evaluate(async () => {
    const p = document.getElementById("player"), v = p.querySelector("video");
    p.close();
    await new Promise(r => setTimeout(r, 250));
    return { open: p.open, src: v.getAttribute("src"), poster: v.getAttribute("poster") };
  });
  ok("Esc отцепляет ролик от плеера", !esc.open && !esc.src && !esc.poster,
    `src=${esc.src} poster=${esc.poster}`);
  await page.close();
}

await browser.close();
if (fails.length) { console.error("\nПРОВАЛ: " + fails.join(", ")); process.exit(1); }
console.log("\nВсё сошлось.");
