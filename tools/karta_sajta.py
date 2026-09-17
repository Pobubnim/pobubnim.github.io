# -*- coding: utf-8 -*-
"""Карта сайта целиком: страницы, их звенья, тесты, индекс — и «зона работы» для агента.

Зачем (слово владельца 17.09.2026): агенты жгли контекст, вычитывая репозиторий целиком,
и всё равно не видели картины. Прибор собирает связи один раз и отдаёт:
  * человеку — обзор: сколько страниц каждого типа, что без тестов, что вне поиска, что сирота;
  * агенту — ЗОНУ: точный список файлов, которые нужны для конкретной правки, и ничего лишнего.

Запуск:
  python tools/karta_sajta.py                     обзор проекта
  python tools/karta_sajta.py --zona services/reklamnyj-rolik.html
                                                  зона работы по странице (вставлять в промпт агента)
  python tools/karta_sajta.py --json карта.json   вся карта машиной
  python tools/karta_sajta.py --index             добавить статус в поиске Яндекса (запрос к API)

Карта строится из файлов, ничего не выдумывает: связи берутся из самих страниц
(script/link/href), покрытие тестами — по упоминанию имени файла в tools/test_*.py.
"""
from __future__ import annotations

import glob
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = ("videos/", "promo/", "docs/", "tools/")
TYPES = [
    ("гео", lambda p: p.startswith("videograf-") or p == "videosemka-moskva.html"),
    ("услуга", lambda p: p.startswith("services/")),
    ("кейс", lambda p: p.startswith("cases/")),
    ("статья", lambda p: p.startswith("articles/") and p != "articles/index.html"),
    ("урок", lambda p: p.startswith("uroki/") and p != "uroki/index.html"),
    ("инструмент", lambda p: p.startswith("instrumenty/") and p != "instrumenty/index.html"),
    ("хаб", lambda p: p in ("articles/index.html", "uroki/index.html", "instrumenty/index.html",
                            "video-dlya-biznesa.html", "raboty.html")),
    ("деньги", lambda p: p in ("ceny.html", "education.html", "zakazy-sami.html", "konstruktor-dogovora.html")),
    ("служебная", lambda p: p in ("404.html", "admin.html", "privacy.html", "soglasie.html")
     or p.startswith(("google", "yandex_"))),
]


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace("\\", "/")


def kind(p: str) -> str:
    for name, test in TYPES:
        if test(p):
            return name
    return "главная" if p == "index.html" else "прочее"


def build() -> dict:
    pages = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        p = rel(f)
        if p.startswith(SKIP_DIRS):
            continue
        t = open(f, encoding="utf-8").read()
        if 'name="robots" content="noindex' in t:
            continue  # снятые страницы-заглушки (переезды) в карту не берём
        body = t.split("</header>", 1)[-1]
        pages[p] = {
            "тип": kind(p),
            "title": (re.search(r"<title>(.*?)</title>", t, re.S) or [None, ""])[1].strip(),
            "h1": re.sub(r"<[^>]+>", " ", (re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S) or [None, ""])[1]).strip(),
            "вес_кб": round(len(t.encode("utf-8")) / 1024, 1),
            "скрипты": sorted({m for m in re.findall(r'<script src="([^"]+)"', t) if not m.startswith("http")}),
            "стили": sorted({m for m in re.findall(r'<link rel="stylesheet" href="([^"]+)"', t) if not m.startswith("http")}),
            "разметка": sorted(set(re.findall(r'"@type"\s*:\s*"(\w+)"', t))),
            "ведёт_в_деньги": sorted({m for m in re.findall(
                r'href="([^"]*(?:services/[a-z-]+\.html|ceny\.html|videosemka-moskva\.html|video-dlya-biznesa\.html|education\.html))"', body)}),
            "тесты": [],
            "входящих_ссылок": 0,
        }

    # входящие ссылки: считаем по телу страниц (шапка и подвал у всех одинаковые — их не считаем)
    names = {p: os.path.basename(p) for p in pages}
    for src, t in ((p, open(os.path.join(ROOT, p), encoding="utf-8").read()) for p in pages):
        body = t.split("</header>", 1)[-1].split("<footer", 1)[0]
        for dst, name in names.items():
            if dst == src:
                continue
            if re.search(r'href="[^"]*' + re.escape(name) + r'(?:[#?][^"]*)?"', body):
                pages[dst]["входящих_ссылок"] += 1

    # покрытие тестами: имя файла упомянуто в приборе tools/test_*.py
    for t in sorted(glob.glob(os.path.join(ROOT, "tools", "test_*.py"))):
        src = open(t, encoding="utf-8").read()
        for p in pages:
            if os.path.basename(p) in src or p in src:
                pages[p]["тесты"].append(rel(t))

    data = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "assets", "data", "*.json")) +
                    glob.glob(os.path.join(ROOT, "data", "*.json"))):
        who = [p for p in pages if os.path.basename(f) in open(os.path.join(ROOT, p), encoding="utf-8").read()]
        gen = [rel(g) for g in glob.glob(os.path.join(ROOT, "tools", "*.py"))
               if os.path.basename(f) in open(g, encoding="utf-8").read()]
        data[rel(f)] = {"страницы": who, "скрипты": gen}

    tools = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "tools", "*.py"))):
        doc = (open(f, encoding="utf-8").read().split('"""')[1:2] or [""])[0].strip().split("\n")[0]
        tools[rel(f)] = doc
    return {"страницы": pages, "данные": data, "приборы": tools}


def zona(karta: dict, target: str) -> None:
    """Точный список того, что нужно для правки одной страницы. Всё остальное агенту не читать."""
    p = target.replace("\\", "/").lstrip("./")
    page = karta["страницы"].get(p)
    if not page:
        sys.exit(f"нет такой страницы в карте: {p}\nсписок: python tools/karta_sajta.py")
    same = [q for q, v in karta["страницы"].items() if v["тип"] == page["тип"] and q != p]
    print(f"ЗОНА РАБОТЫ: {p} ({page['тип']})")
    print(f"  title: {page['title']}")
    print(f"  H1: {page['h1']}")
    print(f"  вес: {page['вес_кб']} КБ · входящих ссылок: {page['входящих_ссылок']} · разметка: {', '.join(page['разметка']) or '—'}")
    print(f"  скрипты: {', '.join(page['скрипты']) or '—'}")
    print(f"  стили: {', '.join(page['стили']) or '—'}")
    print(f"  ведёт в деньги: {', '.join(page['ведёт_в_деньги']) or '— (дыра, если страница контентная)'}")
    print(f"  тесты: {', '.join(page['тесты']) or '— (не покрыта)'}")
    data = [d for d, v in karta["данные"].items() if p in v["страницы"]]
    print(f"  данные: {', '.join(data) or '—'}")
    print(f"  соседи того же типа ({len(same)}): {', '.join(same[:6])}{' …' if len(same) > 6 else ''}")
    print("  законы: docs/SEO_RULES.md (закон страницы), docs/GROWTH_PLAN.md §12 (что сделано и отклонено),")
    print("          assets/data/prices.json (единственный источник цен)")
    print("  приёмка: python tools/audit_site.py · tools/check_prices.py · tools/sync_faq.py --check · "
          + (" · ".join("python " + t for t in page["тесты"]) if page["тесты"] else "тестов нет")
          + f" · python tools/check_live.py http://localhost:8765/{p}")
    print("\nЧитать только перечисленное. Всё, чего нет в зоне, — по прямой ссылке отсюда и не целиком.")


def obzor(karta: dict, with_index: bool) -> None:
    pages = karta["страницы"]
    by_kind = {}
    for p, v in pages.items():
        by_kind.setdefault(v["тип"], []).append(p)
    print("КАРТА САЙТА")
    print(f"страниц: {len(pages)} · приборов: {len(karta['приборы'])} · источников данных: {len(karta['данные'])}\n")
    for k in sorted(by_kind, key=lambda k: -len(by_kind[k])):
        items = by_kind[k]
        no_test = [p for p in items if not pages[p]["тесты"]]
        print(f"{k:<12} {len(items):>3} · без тестов: {len(no_test):>2} · средний вес: "
              f"{round(sum(pages[p]['вес_кб'] for p in items) / len(items), 1)} КБ")
    weak = sorted((v["входящих_ссылок"], p) for p, v in pages.items() if v["тип"] not in ("служебная", "прочее"))[:8]
    print("\nСлабая перелинковка — входящие ссылки ИЗ ТЕКСТА страниц;")
    print("шапка и подвал не считаются, они одинаковы у всех (хабы живут в меню):")
    for n, p in weak:
        print(f"  {n:>2}  {p}")
    holes = [p for p, v in pages.items()
             if v["тип"] in ("статья", "урок", "инструмент", "хаб") and not v["ведёт_в_деньги"]]
    print(f"\nКонтент без выхода на услуги: {len(holes)}" + ("".join("\n  " + p for p in holes) if holes else " — нет"))
    if with_index:
        sys.path.insert(0, os.path.join(ROOT, "tools"))
        import daily_stats as d  # noqa: E402
        uid = d.api("https://api.webmaster.yandex.net/v4/user")["user_id"]
        base = f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{d.HOST_NEW}"
        got, off = set(), 0
        while True:
            rows = d.api(base + "/search-urls/in-search/samples", {"limit": 100, "offset": off}).get("samples") or []
            got |= {x["url"].replace("https://pobubnim.ru/", "") or "index.html" for x in rows}
            if len(rows) < 100:
                break
            off += 100
        out = [p for p in pages if p not in got and pages[p]["тип"] not in ("служебная", "прочее")]
        print(f"\nВ поиске Яндекса: {len(pages) - len(out)} из {len(pages)} · вне поиска: {len(out)}")
        for p in out[:12]:
            print("  " + p)


def main() -> None:
    karta = build()
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        json.dump(karta, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("карта записана:", out)
    elif "--zona" in sys.argv:
        zona(karta, sys.argv[sys.argv.index("--zona") + 1])
    else:
        obzor(karta, "--index" in sys.argv)


if __name__ == "__main__":
    main()
