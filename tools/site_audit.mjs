/* Обход сайта живым браузером: ошибки в консоли, битые ресурсы и ссылки,
   горизонтальный вылет вёрстки на телефоне, вес страницы.

     node tools/site_audit.mjs [http://127.0.0.1:8901] [--all]

   Без --all берутся ключевые страницы, с ним — все .html из sitemap.xml.
   Ноль на выходе — чисто, единица — есть находки (они печатаются списком). */

import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const globalRoot = execSync("npm root -g").toString().trim();
const { default: puppeteer } = await import(
  pathToFileURL(path.join(globalRoot, "puppeteer-core", "lib", "puppeteer", "puppeteer-core.js")).href
);

const BASE = (process.argv[2] || "http://127.0.0.1:8901").replace(/\/$/, "");
const ALL = process.argv.includes("--all");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const KEY = ["/", "/raboty.html", "/zakazy-sami.html", "/education.html", "/instrumenty/",
  "/articles/", "/konstruktor-dogovora.html", "/videograf-naro-fominsk.html"];

const pages = ALL
  ? [...fs.readFileSync("sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(m => m[1].replace(/^https?:\/\/[^/]+/, "")).filter((v, i, a) => a.indexOf(v) === i)
  : KEY;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const findings = [];

for (const rel of pages) {
  const url = BASE + rel;
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [], bad = [];
  let bytes = 0;
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", e => errors.push("JS: " + String(e).slice(0, 160)));
  page.on("requestfailed", r => bad.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on("response", async r => {
    const len = Number(r.headers()["content-length"] || 0);
    bytes += len;
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
  } catch (e) {
    findings.push(`${rel}: страница не открылась — ${String(e).slice(0, 120)}`);
    await page.close();
    continue;
  }

  /* горизонтальный вылет: что именно шире экрана */
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll("body *").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || getComputedStyle(el).position === "fixed") return;
      if (r.right > w + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} → ${Math.round(r.left)}..${Math.round(r.right)} при ширине ${w}`);
      }
    });
    return { docW: document.documentElement.scrollWidth, viewW: w, out: out.slice(0, 6) };
  });

  /* внутренние ссылки, ведущие в никуда */
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map(a => a.getAttribute("href"))
      .filter(h => h && !/^(https?:|mailto:|tel:|#)/.test(h))
      .filter((v, i, a) => a.indexOf(v) === i));

  if (errors.length) findings.push(`${rel}: ошибки в консоли — ${[...new Set(errors)].join(" | ")}`);
  if (bad.length) findings.push(`${rel}: ресурсы не отдались — ${[...new Set(bad)].slice(0, 5).join(" | ")}`);
  if (over.docW > over.viewW + 1) findings.push(`${rel}: вылет по горизонтали ${over.docW}px при экране ${over.viewW}px — ${over.out.join(" ; ")}`);

  console.log(`${rel.padEnd(34)} вес ${(bytes / 1024 / 1024).toFixed(2)} МБ · ссылок ${links.length} · ошибок ${errors.length} · вылет ${over.docW > over.viewW + 1 ? "ДА" : "нет"}`);
  await page.close();
}

await browser.close();

if (findings.length) {
  console.error("\nНАХОДКИ:\n" + findings.map(f => " · " + f).join("\n"));
  process.exit(1);
}
console.log("\nЧисто.");
