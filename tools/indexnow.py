# -*- coding: utf-8 -*-
"""Пинг IndexNow: сообщает Яндексу об изменившихся страницах сайта.

Ключ лежит в корне репозитория файлом <key>.txt — он же и есть значение ключа
(так требует протокол). Только stdlib.

Запуск:
  python tools/indexnow.py                       страницы из последнего коммита
  python tools/indexnow.py instrumenty/shot-list.html /   конкретные адреса
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST = "pobubnim.github.io"
ENDPOINT = "https://yandex.com/indexnow"

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
    pages = sys.argv[1:] or changed_pages()
    if not pages:
        print("нечего пинговать: в последнем коммите нет страниц")
        return 0
    urls = [f"https://{HOST}{p if p.startswith('/') else '/' + p}" for p in pages]
    body = json.dumps({"host": HOST, "key": key(), "urlList": urls}).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"IndexNow ответил {r.status} · страниц отправлено: {len(urls)}")
    except urllib.error.HTTPError as e:
        print(f"IndexNow отказал {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
        return 1
    for u in urls:
        print(" ·", u)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
