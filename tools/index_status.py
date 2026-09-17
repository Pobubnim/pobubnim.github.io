# -*- coding: utf-8 -*-
"""Кто из страниц сайта в поиске Яндекса, а кто выброшен и почему.

Зачем: 17.09.2026 оказалось, что на новом домене в поиске 19 страниц из 56 —
коммерческие (услуги, гео, кейсы, часть статей) Яндекс пометил LOW_QUALITY
(«малоценная или маловостребованная»), и понять это по сводке нельзя: она
показывает только общее число. Этот прибор раскладывает карту сайта по статусам.

Закон волны роста (GROWTH_PLAN §12): пока в поиске меньше 35 страниц из карты,
новые адреса не заводим — чиним и переобходим то, что уже есть.

Запуск:  python tools/index_status.py            # таблица по всем адресам
         python tools/index_status.py --short     # только итог и список выпавших
Токен — тот же, что у daily_stats (~/.pobubnim/yandex_oauth.txt), только чтение.
"""
from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import daily_stats as d  # noqa: E402  общий api(), токен и вывод в utf-8

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pobubnim.ru"
POROG = 35  # ниже этого числа страниц в поиске новые адреса не заводим


def pages(base: str, path: str) -> list:
    """Все записи выборки (API отдаёт порциями по 100)."""
    out, offset = [], 0
    while True:
        rows = d.api(f"{base}/{path}", {"limit": 100, "offset": offset}).get("samples") or []
        out += rows
        if len(rows) < 100:
            return out
        offset += 100


def last_by_url(rows: list, date_key: str) -> dict:
    """Последняя запись по каждому адресу: у выборки событий их несколько на URL."""
    out = {}
    for x in sorted(rows, key=lambda r: r.get(date_key) or ""):
        out[x["url"]] = x
    return out


def main() -> None:
    sitemap = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    urls = re.findall(r"<loc>(.*?)</loc>", sitemap)

    uid = d.api("https://api.webmaster.yandex.net/v4/user")["user_id"]
    base = f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{d.HOST_NEW}"
    in_search = {x["url"] for x in pages(base, "search-urls/in-search/samples")}
    events = last_by_url(pages(base, "search-urls/events/samples"), "event_date")
    crawl = last_by_url(pages(base, "indexing/samples"), "access_date")
    quota = d.api(base + "/recrawl/quota")

    est, lost = [], []
    for u in urls:
        if u in in_search:
            est.append(u)
        else:
            ev = events.get(u, {})
            why = ev.get("excluded_url_status") or ev.get("event") or ""
            if why == "LOW_QUALITY":
                why = "LOW_QUALITY (малоценная или маловостребованная)"
            if not why:
                why = "робот не обходил" if u not in crawl else "обойдена, в поиск не взята"
            when = (ev.get("event_date") or crawl.get(u, {}).get("access_date") or "")[:10]
            lost.append((u, f"{why}{' · ' + when if when else ''}"))

    if "--short" not in sys.argv:
        for u in urls:
            mark = "в поиске " if u in in_search else "ВЫПАЛА  "
            why = dict(lost).get(u, "")
            print(f"{mark} {u.replace(SITE, '')}  {why}")
        print()
    print(f"В поиске: {len(est)} из {len(urls)} · вне поиска: {len(lost)}")
    if lost:
        print("Вне поиска:")
        for u, why in lost:
            print(f"  · {u.replace(SITE, '')} — {why}")
    print(f"Квота переобхода: {quota.get('quota_remainder')} из {quota.get('daily_quota')}")
    print("Новые адреса " + ("МОЖНО заводить." if len(est) >= POROG
                             else f"НЕ заводим: порог {POROG} страниц в поиске не взят."))


if __name__ == "__main__":
    main()
