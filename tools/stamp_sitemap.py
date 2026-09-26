# -*- coding: utf-8 -*-
"""lastmod в sitemap.xml — по дате последней правки СОДЕРЖАНИЯ страницы.

Зачем (аудит 25.09.2026): даты в карте ставились руками и отстали. Страницы,
переписанные 21.09 ради выхода из «малоценных», сообщали роботу, что не
менялись с августа, — и переобход по карте их не торопил.

Что считается правкой содержания: видимый текст внутри <main>, <title> и
meta description. Шапка, подвал, стили и скрипты — нет: разнос навигации по
78 страницам не повод объявлять их все обновлёнными.

Источник правды — история git: идём по коммитам файла от новых к старым и
берём дату первого коммита, где отпечаток содержания отличается от родителя.
Неcкоммиченная правка содержания — сегодняшняя дата.

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
    main = re.search(r"<main\b.*?</main>", html, re.S)
    body = main.group(0) if main else ""
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<time\b[^>]*>.*?</time>", " ", body, flags=re.S)  # штамп даты — не правка
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).strip()
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    desc = re.search(r'<meta name="description" content="([^"]*)"', html)
    head = (title.group(1) if title else "") + "|" + (desc.group(1) if desc else "")
    return hashlib.sha1((head + "|" + text).encode("utf-8")).hexdigest()


def content_date(rel: str, today: str) -> str | None:
    path = ROOT / rel
    if not path.exists():
        return None
    head = git("show", f"HEAD:{rel}")
    if fingerprint(path.read_text(encoding="utf-8")) != fingerprint(head):
        return today
    log = [line.split() for line in git("log", "--format=%H %ad", "--date=short", "--", rel).splitlines() if line]
    for i, (sha, date) in enumerate(log):
        cur = fingerprint(git("show", f"{sha}:{rel}"))
        prev = fingerprint(git("show", f"{log[i + 1][0]}:{rel}")) if i + 1 < len(log) else None
        if cur != prev:
            return date
    return None


def rel_of(loc: str) -> str:
    rel = loc[len(HOST):] if loc.startswith(HOST) else loc
    return rel + "index.html" if rel == "" or rel.endswith("/") else rel


def main() -> None:
    fix = "--check" not in sys.argv
    today = dt.date.today().isoformat()
    sm = ROOT / "sitemap.xml"
    src = sm.read_text(encoding="utf-8")
    diffs = []

    def repl(m: re.Match) -> str:
        loc, old = m.group(2), m.group(4)
        new = content_date(rel_of(loc), today) or old
        if new != old:
            diffs.append(f"  {loc}: {old} → {new}")
        return f"{m.group(1)}{loc}{m.group(3)}{new}{m.group(5)}"

    out = re.sub(r"(<loc>)([^<]+)(</loc><lastmod>)([\d-]+)(</lastmod>)", repl, src)
    print("\n".join(diffs) if diffs else "lastmod в карте совпадают с правками содержания")
    if fix and out != src:
        sm.write_text(out, encoding="utf-8")
        print(f"\nПроставлено: {len(diffs)}")
    elif diffs:
        print(f"\nРасхождений: {len(diffs)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
