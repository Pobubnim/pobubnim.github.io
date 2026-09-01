# -*- coding: utf-8 -*-
"""Сквозной аудит статики сайта ПОБУБНИМ.

Проверяет то, что ломается тихо и глазом не видно: теги по закону
docs/SEO_RULES.md, битые локальные ссылки и картинки, единую версию
analytics.js, покрытие sitemap, атрибуты <img> (скачки вёрстки),
валидность JSON-LD, иерархию заголовков.

Запуск:  python tools/audit_site.py   (из корня репо)
Код 1 — есть ОШИБКИ, 0 — чисто или только предупреждения.
"""
import json
import os
import re
import sys
from collections import defaultdict
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pobubnim.ru/"
SKIP_DIRS = {".git", "docs", "tools", "promo", "videos", "assets"}
# служебные страницы вне выдачи
NOINDEX_OK = {"404.html", "admin.html", "instrumenty/kalkulyator-stoimosti-semki.html"}

errors, warns = [], []


def err(page, msg):
    errors.append(f"{page}: {msg}")


def warn(page, msg):
    warns.append(f"{page}: {msg}")


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self._in_title = False
        self.meta = {}
        self.links = []          # (attr, value)
        self.headings = []       # (level, text)
        self._h = None
        self._htext = ""
        self.imgs = []
        self.jsonld = []
        self._in_ld = False
        self._ld = ""
        self.scripts = []
        self.fields = []        # input/select/textarea
        self.labels = []        # значения for=
        self.buttons = []       # (атрибуты, текст)
        self.ids = []
        self.mains = 0
        self._btn = None
        self._btntext = ""
        self._label_depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.mains += 1
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key.lower()] = a.get("content", "")
        elif tag == "link":
            if (a.get("rel") or "").lower() == "canonical":
                self.meta["canonical"] = a.get("href", "")
            if a.get("href"):
                self.links.append(("href", a["href"]))
        elif tag == "a" and a.get("href"):
            self.links.append(("href", a["href"]))
        elif tag == "img":
            self.imgs.append(a)
            if a.get("src"):
                self.links.append(("src", a["src"]))
        elif tag == "source" and a.get("srcset"):
            self.links.append(("src", a["srcset"].split()[0]))
        elif tag == "script":
            if a.get("src"):
                self.scripts.append(a["src"])
                self.links.append(("src", a["src"]))
            if (a.get("type") or "").lower() == "application/ld+json":
                self._in_ld = True
                self._ld = ""
        elif tag in ("input", "select", "textarea"):
            a["_in_label"] = self._label_depth > 0
            self.fields.append(a)
        elif tag == "label":
            self.labels.append(a.get("for"))
            self._label_depth += 1
        elif tag == "button":
            self._btn = a
            self._btntext = ""
        elif re.fullmatch(r"h[1-6]", tag):
            self._h = int(tag[1])
            self._htext = ""
        if a.get("id"):
            self.ids.append(a["id"])

    def handle_endtag(self, tag):
        if tag == "label" and self._label_depth:
            self._label_depth -= 1
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self.jsonld.append(self._ld)
            self._in_ld = False
        elif tag == "button" and self._btn is not None:
            self.buttons.append((self._btn, " ".join(self._btntext.split())))
            self._btn = None
        elif re.fullmatch(r"h[1-6]", tag) and self._h:
            self.headings.append((self._h, " ".join(self._htext.split())))
            self._h = None

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data
        if self._in_ld:
            self._ld += data
        if self._h:
            self._htext += data
        if self._btn is not None:
            self._btntext += data


def html_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for f in filenames:
            if f.endswith(".html"):
                rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace("\\", "/")
                out.append(rel)
    return sorted(out)


def page_url(rel):
    return SITE + ("" if rel == "index.html" else rel.replace("index.html", ""))


def main():
    files = html_files()
    titles, descs = defaultdict(list), defaultdict(list)
    analytics_versions = defaultdict(list)
    page_ids, page_links = {}, {}

    for rel in files:
        raw = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        if len(raw) < 400 and "verification" in raw.lower():
            continue  # файл подтверждения поисковика, не страница
        p = Page()
        p.feed(raw)
        noindex = "noindex" in (p.meta.get("robots") or "").lower()
        service = rel in NOINDEX_OK or noindex

        title = (p.title or "").strip()
        desc = (p.meta.get("description") or "").strip()
        if not service:
            if not title:
                err(rel, "нет <title>")
            elif not 40 <= len(title) <= 70:
                warn(rel, f"title {len(title)} симв. (закон 50-65): {title[:70]}")
            if not desc:
                err(rel, "нет description")
            elif not 140 <= len(desc) <= 200:
                warn(rel, f"description {len(desc)} симв. (закон 150-190)")
            if title:
                titles[title].append(rel)
            if desc:
                descs[desc].append(rel)
            if not p.meta.get("author"):
                warn(rel, "нет meta author")
            can = p.meta.get("canonical", "")
            if not can:
                err(rel, "нет canonical")
            elif can.rstrip("/") != page_url(rel).rstrip("/"):
                warn(rel, f"canonical {can} != {page_url(rel)}")
            for og in ("og:title", "og:description", "og:image"):
                if not p.meta.get(og):
                    warn(rel, f"нет {og}")

        h1 = [t for lvl, t in p.headings if lvl == 1]
        if not service:
            if len(h1) != 1:
                err(rel, f"H1 должен быть один, найдено {len(h1)}: {h1}")
            prev = 0
            for lvl, _ in p.headings:
                if prev and lvl > prev + 1:
                    warn(rel, f"прыжок заголовков H{prev} -> H{lvl}")
                prev = lvl

        for s in p.scripts:
            if "analytics.js" in s:
                analytics_versions[s.split("analytics.js")[-1]].append(rel)
        if not service and not any("analytics.js" in s for s in p.scripts):
            err(rel, "не подключён analytics.js")

        for ld in p.jsonld:
            try:
                json.loads(ld)
            except Exception as e:
                err(rel, f"битый JSON-LD: {e}")

        for a in p.imgs:
            src = a.get("src", "?")
            if a.get("alt") is None:
                warn(rel, f"<img> без alt: {src}")
            if not (a.get("width") and a.get("height")):
                warn(rel, f"<img> без width/height (скачет вёрстка): {src}")

        # доступность форм: у каждого поля должна быть подпись, у кнопки — имя
        label_for = set(x for x in p.labels if x)
        for a in p.fields:
            if (a.get("type") or "").lower() in ("hidden", "submit", "button", "radio", "checkbox"):
                continue
            if (a.get("aria-hidden") or "").lower() == "true":
                continue          # ловушка для ботов, не для людей
            named = (a.get("aria-label") or a.get("title") or a.get("_in_label")
                     or (a.get("id") in label_for))
            if not named:
                warn(rel, "поле без подписи: " +
                     (a.get("id") or a.get("class") or a.get("placeholder") or a.get("type") or "?"))
        for a, text in p.buttons:
            if not (text.strip() or a.get("aria-label") or a.get("title")):
                warn(rel, "кнопка без доступного имени: " + (a.get("id") or a.get("class") or "?"))
        seen_ids = set()
        for i in p.ids:
            if i in seen_ids:
                err(rel, f"повтор id={i}")
            seen_ids.add(i)

        # экранный диктор прыгает к содержимому по <main>; на служебных
        # страницах он не нужен
        if not service and p.mains != 1:
            err(rel, f"<main> на странице: {p.mains} (нужен ровно один)")
        page_ids[rel] = set(p.ids)
        page_links[rel] = list(p.links)

        base = os.path.dirname(os.path.join(ROOT, rel))
        for attr, href in p.links:
            if re.match(r"^(https?:|mailto:|tel:|data:|#|//)", href):
                continue
            path = href.split("#")[0].split("?")[0]
            if not path:
                continue
            target = os.path.normpath(os.path.join(ROOT if path.startswith("/") else base,
                                                    path.lstrip("/")))
            if os.path.isdir(target):
                target = os.path.join(target, "index.html")
            if not os.path.exists(target):
                err(rel, f"битая ссылка {attr}={href}")

    # якорь без цели уводит человека на пустое место — так «Оставить заявку»
    # с внутренних страниц полгода вела на верх главной вместо контактов
    for rel, links in page_links.items():
        base = os.path.dirname(rel)
        for attr, href in links:
            if re.match(r"^(https?:|mailto:|tel:|data:|//)", href) or "#" not in href:
                continue
            path, _, frag = href.partition("#")
            if not frag:
                continue
            if not path:
                target = rel
            elif path.startswith("/"):
                target = path.lstrip("/") or "index.html"
            else:
                target = os.path.normpath(os.path.join(base, path)).replace(os.sep, "/")
            if target.endswith("/"):
                target += "index.html"
            if not target.endswith(".html"):
                target = target.rstrip("/") + "/index.html"
            if target in page_ids and frag not in page_ids[target]:
                err(rel, f"якорь {href} — на целевой странице нет id={frag}")

    for t, pages in titles.items():
        if len(pages) > 1:
            err("дубль title", f"{t[:50]}... -> {pages}")
    for d, pages in descs.items():
        if len(pages) > 1:
            err("дубль description", f"{d[:50]}... -> {pages}")
    if len(analytics_versions) > 1:
        err("аналитика", "разные версии analytics.js: " +
            "; ".join(f"{v or '(без ?v)'} на {len(p)} стр." for v, p in analytics_versions.items()))

    sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    locs = set(re.findall(r"<loc>(.*?)</loc>", sm))
    for rel in files:
        if rel in NOINDEX_OK or rel == "404.html":
            continue
        raw = open(os.path.join(ROOT, rel), encoding="utf-8").read()
        if "noindex" in raw or ("verification" in raw.lower() and len(raw) < 400):
            continue
        url = page_url(rel)
        if url not in locs and url.rstrip("/") + "/" not in locs:
            err("sitemap", f"страница вне sitemap: {rel}")
    for loc in sorted(locs):
        rel = loc.replace(SITE, "")
        cand = rel if rel.endswith(".html") else (rel + "index.html" if rel else "index.html")
        if not os.path.exists(os.path.join(ROOT, cand)):
            err("sitemap", f"в sitemap URL без файла: {loc}")

    print(f"Страниц проверено: {len(files)}")
    print(f"\nОШИБКИ ({len(errors)}):")
    for e in errors:
        print("  X", e)
    print(f"\nПРЕДУПРЕЖДЕНИЯ ({len(warns)}):")
    for w in warns:
        print("  .", w)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
