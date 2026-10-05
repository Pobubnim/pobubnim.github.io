# -*- coding: utf-8 -*-
"""Печать инструментов: сколько страниц уходит в PDF с каждого листа.

Зачем: 05.10.2026 оказалось, что кнопка «Распечатать / в PDF» на всех инструментах
отдаёт лишние чистые листы — страница пряталась через visibility, но её высота
оставалась в потоке. Смета на полстраницы печаталась на четырёх листах, договор на
одиннадцати вместо четырёх. Глазами это не ловится: превью печати никто не листает.

Прибор печатает каждый лист в PDF тем же Chrome и сравнивает число страниц с объёмом
текста листа: на страницу А4 кладём не меньше 1500 знаков, плюс один лист запаса.

Запуск:  python tools/check_print.py            (сервер на http://localhost:8765)
Код 1 — есть лист, который печатается длиннее, чем должен.
"""
import base64
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9478
LOCAL = os.environ.get("POBUBNIM_URL", "http://localhost:8765/")
PAGES = ["konstruktor-dogovora.html"] + ["instrumenty/" + n for n in (
    "smeta-i-schet.html", "modelnyj-reliz.html", "tajming-svadby.html", "shot-list.html", "vyzyvnoj-list.html",
    "chek-list-semki.html", "brif-na-semku.html", "soglasie-na-semku-rebenka.html", "dogovor-arendy-tehniki.html",
    "stavka-frilansera.html", "kalkulyator-grip.html", "kalkulyator-nd-filtra.html", "kalkulyator-karty-pamyati.html")]


def main() -> int:
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--user-data-dir=" + tempfile.mkdtemp(prefix="pbprint-"),
         f"--remote-debugging-port={PORT}", "--remote-allow-origins=*", "--window-size=1280,900", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bad = 0
    try:
        tabs = None
        for _ in range(80):
            try:
                tabs = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t.get("type") == "page"]
                if tabs:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        if not tabs:
            raise RuntimeError("Chrome не поднялся")
        ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        mid = [0]

        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == mid[0]:
                    return m

        cmd("Page.enable")
        cmd("Runtime.enable")
        for p in PAGES:
            cmd("Page.navigate", url=LOCAL + p)
            time.sleep(1.6)
            pdf = base64.b64decode(cmd("Page.printToPDF", printBackground=True, preferCSSPageSize=True)["result"]["data"])
            pages = len(re.findall(rb"/Type\s*/Page\b", pdf))
            chars = cmd("Runtime.evaluate", returnByValue=True,
                        expression="(document.querySelector('.paper:not([hidden])')||{innerText:''}).innerText.length"
                        )["result"]["result"].get("value") or 0
            limit = math.ceil(chars / 1500) + 1
            ok = 1 <= pages <= limit and chars > 0
            bad += not ok
            print(("ok   " if ok else "ФЕЙЛ ") + f"{pages} стр. при {chars} знаках (потолок {limit}) · {p}")
    finally:
        proc.kill()
    print("\nЛишних листов нет" if not bad else f"\nПечатается длиннее, чем должно: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
