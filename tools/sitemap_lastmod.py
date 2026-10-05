# -*- coding: utf-8 -*-
"""Даты lastmod в sitemap.xml — из git, а не из головы.

Зачем: разбор поиска 05.10.2026 нашёл, что у страниц услуг в карте стоит
2026-08-24 при правках 17–21.09, а у городов — 2026-09-01. Поисковик читает
lastmod как «страница не менялась» и не торопится её переобходить.

Дата страницы = дата последнего коммита её файла; у файла с незакоммиченной
правкой — сегодня. Скрипт парный к stamp_dates.py (тот ведёт даты в разметке).

Запуск:  python tools/sitemap_lastmod.py --check   показать расхождения (код 1, если есть)
         python tools/sitemap_lastmod.py           проставить
"""
from __future__ import annotations

import datetime
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pobubnim.ru/"
URL = re.compile(r"(<loc>" + re.escape(SITE) + r"([^<]*)</loc><lastmod>)(\d{4}-\d{2}-\d{2})(</lastmod>)")


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True, encoding="utf-8").stdout.strip()


def main() -> int:
    path = os.path.join(ROOT, "sitemap.xml")
    src = io.open(path, encoding="utf-8").read()
    dirty = set(line[3:].strip().strip('"') for line in git("status", "--porcelain").splitlines())
    today = datetime.date.today().isoformat()
    changed = []

    def fix(m: re.Match) -> str:
        rel = m.group(2) or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        if not os.path.exists(os.path.join(ROOT, rel)):
            return m.group(0)
        date = today if rel in dirty else git("log", "-1", "--format=%cs", "--", rel)
        if date and date != m.group(3):
            changed.append(f"{rel}: {m.group(3)} → {date}")
            return m.group(1) + date + m.group(4)
        return m.group(0)

    new = URL.sub(fix, src)
    for c in changed:
        print(c)
    print("адресов в карте:", len(URL.findall(src)), "· расходятся с git:", len(changed))
    if "--check" in sys.argv:
        return 1 if changed else 0
    if changed:
        io.open(path, "w", encoding="utf-8", newline="\n").write(new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
