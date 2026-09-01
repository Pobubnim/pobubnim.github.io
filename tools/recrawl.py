# -*- coding: utf-8 -*-
"""Переобход страниц в Яндекс.Вебмастере.

IndexNow говорит «страница изменилась», но робот приходит по своему графику.
Переобход ставит URL в очередь принудительно — им лечится случай, когда
страница обойдена (HTTP 200), а в поиск не взята.

Запуск:
  python tools/recrawl.py                 очередь по умолчанию: коммерческое ядро
  python tools/recrawl.py URL [URL ...]   свои адреса (полные, с https://)
  python tools/recrawl.py --sitemap       всё из sitemap.xml (в пределах квоты)

Токен — тот же, что у daily_stats.py: ~/.pobubnim/yandex_oauth.txt.
Квота Вебмастера — 150 адресов в сутки, скрипт её печатает и не превышает.
"""
from __future__ import annotations

import io
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# см. daily_stats.py: пока Вебмастер не поднял новый хост, работаем со старым
HOST_NEW = "https:pobubnim.ru:443"
HOST_OLD = "https:pobubnim.github.io:443"
SITE_NEW = "https://pobubnim.ru"
SITE_OLD = "https://pobubnim.github.io"
TOKEN_FILE = Path.home() / ".pobubnim" / "yandex_oauth.txt"
ROOT = Path(__file__).resolve().parent.parent

# коммерческое ядро: страницы, ради которых сайт существует. Уроки и
# инструменты в поиск вошли сами — им переобход не нужен.
CORE = [
    "/", "/raboty.html", "/education.html",
    "/services/reklamnyj-rolik.html", "/services/imidzhevyj-film.html",
    "/services/svadebnoe-kino.html", "/services/muzykalnyj-klip.html",
    "/services/cvetokorrekciya.html", "/services/semka-meropriyatij.html",
    "/services/sozdanie-sajtov.html", "/services/boty-avtomatizaciya.html",
    "/videograf-naro-fominsk.html", "/videograf-aprelevka.html",
    "/videograf-obninsk.html",
    "/cases/monolith.html", "/cases/seversvet.html",
    "/articles/skolko-stoit-reklamnyj-rolik.html",
    "/articles/skolko-stoit-svadebnyj-videograf.html",
    "/articles/kak-vybrat-svadebnogo-videografa.html",
    "/articles/cvetokorrekciya-video-kak-sdelat.html",
    "/articles/kak-snyat-reklamnyj-rolik.html",
    "/articles/obuchenie-videosemke-s-nulya.html",
    "/articles/kak-snimat-video-na-telefon.html",
]


def api(url: str, data: dict | None = None) -> dict:
    token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body,
        headers={"Authorization": "OAuth " + token,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8") or "{}")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--sitemap" in sys.argv:
        sm = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        urls = re.findall(r"<loc>(.*?)</loc>", sm)
    elif args:
        urls = args
    else:
        urls = []  # заполнится после выбора хоста

    uid = api("https://api.webmaster.yandex.net/v4/user")["user_id"]
    try:
        api(f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{HOST_NEW}/summary/")
        host, site = HOST_NEW, SITE_NEW
    except Exception:
        host, site = HOST_OLD, SITE_OLD
        print("Новый хост в Вебмастере ещё не загружен — работаем по зеркалу")
    if not args and "--sitemap" not in sys.argv:
        urls = [site + p for p in CORE]
    base = f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{host}"
    quota = api(base + "/recrawl/quota")
    left = quota.get("quota_remainder", 0)
    print(f"Квота переобхода: {left} из {quota.get('daily_quota')} на сутки")

    sent = skipped = 0
    for u in urls:
        if sent >= left:
            skipped = len(urls) - sent
            break
        try:
            api(base + "/recrawl/queue", {"url": u})
            sent += 1
            print(f"  → {u}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:200]
            print(f"  ! {u} — {e.code} {detail}")
    print(f"Отправлено на переобход: {sent}"
          + (f" · не влезло в квоту: {skipped}" if skipped else ""))


if __name__ == "__main__":
    main()
