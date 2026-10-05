# -*- coding: utf-8 -*-
"""Пинг IndexNow: сообщает Яндексу и Bing об изменившихся страницах сайта.

Ключ лежит в корне репозитория файлом <key>.txt — он же и есть значение ключа
(так требует протокол). Только stdlib.

Запуск:
  python tools/indexnow.py                       страницы из последнего коммита
  python tools/indexnow.py instrumenty/shot-list.html /   конкретные адреса
  python tools/indexnow.py --sitemap             все адреса карты сайта

Пинг уходит и Яндексу, и Bing. По протоколу участники делятся адресами между
собой, но 05.10.2026 в Bing не было ни одной страницы сайта при том, что Яндексу
пинги шли с августа, — поэтому шлём каждому напрямую. Индекс Bing кормит Copilot
и DuckDuckGo.
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "pobubnim.ru"
ENDPOINTS = ("https://yandex.com/indexnow", "https://www.bing.com/indexnow")

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def key() -> str:
    files = [p for p in ROOT.glob("*.txt") if len(p.stem) == 32]
    if not files:
        raise SystemExit("ключ IndexNow не найден: в корне нет файла <32 символа>.txt")
    return files[0].stem


def changed_pages() -> list[str]:
    out = subprocess.run(["git", "-C", str(ROOT), "show", "--name-only", "--format=", "HEAD"],
                         capture_output=True, text=True, encoding="utf-8").stdout
    pages = []
    for line in out.splitlines():
        if line.endswith(".html") and not line.startswith(("videos/", "cases/")):
            pages.append("/" if line == "index.html" else "/" + line)
    return pages


def main() -> int:
    given = sys.argv[1:]
    if given == ["--sitemap"]:
        import re
        given = re.findall(r"<loc>https://%s(/[^<]*)</loc>" % re.escape(HOST),
                           (ROOT / "sitemap.xml").read_text(encoding="utf-8"))
    pages = given or changed_pages()
    # Git Bash разворачивает ведущий "/" в путь установки Git: "/uroki/x.html"
    # приезжает сюда как "C:/Program Files/Git/uroki/x.html". Раньше такие
    # аргументы молча выбрасывались, и скрипт отвечал «нечего пинговать» —
    # выглядело как честный результат, а на деле пинга не было (грабля 21.09).
    mangled = [p for p in pages if p.startswith(("C:", "/c/", "D:"))]
    pages = ["/" if p in ("index.html", "/index.html") else p for p in pages
             if p not in mangled]
    if mangled:
        raise SystemExit(
            "Git Bash подменил пути на " + mangled[0] + "\n"
            "Пишите адреса БЕЗ ведущего слеша: uroki/urok.html uroki/ — скрипт "
            "добавит слеш сам.")
    if not pages:
        print("нечего пинговать: в последнем коммите нет страниц"
              if not given else "нечего пинговать: переданные адреса пусты")
        return 0
    urls = [f"https://{HOST}{p if p.startswith('/') else '/' + p}" for p in pages]
    body = json.dumps({"host": HOST, "key": key(), "urlList": urls}).encode("utf-8")
    failed = 0
    for endpoint in ENDPOINTS:
        req = urllib.request.Request(endpoint, data=body,
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        name = endpoint.split("/")[2]
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                print(f"IndexNow {name} ответил {r.status} · страниц отправлено: {len(urls)}")
        except urllib.error.HTTPError as e:
            print(f"IndexNow {name} отказал {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
            failed += 1
        except Exception as e:  # один недоступный приёмник не должен глушить второй
            print(f"IndexNow {name} недоступен: {e}")
            failed += 1
    if failed == len(ENDPOINTS):
        return 1
    for u in urls:
        print(" ·", u)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
