# -*- coding: utf-8 -*-
"""lastmod в sitemap.xml — по дате последней правки СОДЕРЖАНИЯ страницы.

Зачем (аудит 25.09.2026): даты в карте ставились руками и отстали. Страницы,
переписанные 21.09 ради выхода из «малоценных», сообщали роботу, что не
менялись с августа, — и переобход по карте их не торопил.

Что считается правкой содержания: видимый текст внутри <main>, <title>,
meta description и разметка JSON-LD (без самих дат). Шапка, подвал, стили и
скрипты — нет: разнос навигации по 78 страницам не повод объявлять их все
обновлёнными.

Источник правды — история git: идём по коммитам файла вдоль первых родителей
(ветка выкладки) от новых к старым и берём дату первого коммита, где отпечаток
содержания отличается от его родителя. Неcкоммиченная правка содержания —
сегодняшняя дата. Адрес без <lastmod> получает дату; в --check это расхождение.
В неглубоком клоне (shallow) история обрезана — скрипт отказывается работать.

Запуск:
  python tools/stamp_sitemap.py --check   показать расхождения (код 1, если есть)
  python tools/stamp_sitemap.py           проставить
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
HOST = "https://pobubnim.ru/"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8").stdout


def fingerprint(html: str) -> str:
    if not html:
        return ""
    main = re.search(r"<main\b.*?</main>", html, re.S)
    body = main.group(0) if main else ""
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<time\b[^>]*>.*?</time>", " ", body, flags=re.S)  # штамп даты — не правка
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).strip()
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    # разметка — тоже содержание (VideoObject, FAQ), но без дат: их ставит stamp_dates
    ld = re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)
    ld = [re.sub(r'"date(?:Published|Modified)":\s*"[^"]*",?\s*', "", x) for x in ld]
    head = (title.group(1) if title else "") + "|" + (desc.group(1) if desc else "") + "|" + "|".join(ld)
    return hashlib.sha1((head + "|" + text).encode("utf-8")).hexdigest()


def content_date(rel: str, today: str) -> str | None:
    path = ROOT / rel
    if not path.exists():
        return None
    if fingerprint(path.read_text(encoding="utf-8")) != fingerprint(git("show", f"HEAD:{rel}")):
        return today
    log = [line.split() for line in git("log", "--first-parent", "--format=%H %ad", "--date=short",
                                          "--", rel).splitlines() if line]
    for sha, date in log:
        # родитель, а не соседняя строка лога: слияние одной навигации — не правка
        if fingerprint(git("show", f"{sha}:{rel}")) != fingerprint(git("show", f"{sha}^:{rel}")):
            return date
    return None


def rel_of(loc: str) -> str:
    rel = loc[len(HOST):] if loc.startswith(HOST) else loc
    return rel + "index.html" if rel == "" or rel.endswith("/") else rel


def main() -> None:
    fix = "--check" not in sys.argv
    if git("rev-parse", "--is-shallow-repository").strip() == "true":
        print("История git неполная (shallow clone): даты вышли бы по граничному коммиту.\n"
              "Сначала: git fetch --unshallow")
        sys.exit(2)
    today = dt.date.today().isoformat()
    sm = ROOT / "sitemap.xml"
    src = sm.read_text(encoding="utf-8")
    diffs = []

    def repl(m: re.Match) -> str:
        block = m.group(1)
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        if not loc:
            return m.group(0)
        old = re.search(r"<lastmod>([\d-]+)</lastmod>", block)
        new = content_date(rel_of(loc.group(1)), today) or (old.group(1) if old else None)
        if not new or (old and new == old.group(1)):
            return m.group(0)
        diffs.append(f"  {loc.group(1)}: {old.group(1) if old else 'нет даты'} → {new}")
        if old:
            block = block.replace(old.group(0), f"<lastmod>{new}</lastmod>", 1)
        else:
            block = block.replace("</loc>", f"</loc><lastmod>{new}</lastmod>", 1)
        return f"<url>{block}</url>"

    out = re.sub(r"<url>(.*?)</url>", repl, src, flags=re.S)
    print("\n".join(diffs) if diffs else "lastmod в карте совпадают с правками содержания")
    if fix and out != src:
        sm.write_text(out, encoding="utf-8")
        print(f"\nПроставлено: {len(diffs)}")
    elif diffs:
        print(f"\nРасхождений: {len(diffs)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
