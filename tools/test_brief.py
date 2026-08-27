# -*- coding: utf-8 -*-
"""Приёмка брифа на съёмку (instrumenty/brif-na-semku.html).

Проверяет: наборы вопросов под тип съёмки, ответы и счётчик обязательных,
свои вопросы и пометку звёздочкой, перестановку, текст для мессенджера,
лист и Word, черновик, мобильную раскладку.

Запуск:  python tools/test_brief.py [url]
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9461
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/brif-na-semku.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbchrome-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             "--window-size=1280,900", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        tabs = None
        for _ in range(80):
            try:
                allt = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                tabs = [t for t in allt if t.get("type") == "page"]
                if tabs:
                    break
            except Exception:
                pass
            time.sleep(0.25)
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0
        self.errors = []
        self.cmd("Runtime.enable")
        self.cmd("Network.enable")
        self.cmd("Network.setBlockedURLs", urls=["*fonts.googleapis.com*", "*fonts.gstatic.com*"])

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg
            if msg.get("method") == "Runtime.exceptionThrown":
                self.errors.append(msg["params"]["exceptionDetails"].get("text", "JS error"))

    def js(self, expr):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            self.errors.append(str(res["exceptionDetails"].get("text")))
            return None
        return res.get("result", {}).get("value")

    def stats(self):
        return json.loads(self.js("JSON.stringify(PobubnimBrief.stats())"))

    def questions(self):
        return self.js("[...document.querySelectorAll('#questions .q')].map(e=>e.value).join('|')")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimBrief") == "object":
                return
        raise RuntimeError("страница не поднялась")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def main():
    t = Tab()
    try:
        t.goto(URL)
        t.js("localStorage.removeItem('pobubnim-brief-v1')")
        t.goto(URL)

        # 1. набор собрался, обязательные помечены
        st = t.stats()
        check("вопросов больше десяти", st["all"] >= 10, st)
        check("обязательные помечены", st["must"] >= 4, st)
        check("сначала ответов нет", st["done"] == 0, st)
        check("в листе есть вопросы",
              "1." in (t.js("document.getElementById('paper').innerText") or ""), "")

        # 2. тип съёмки меняет набор
        base = t.questions()
        t.js("document.querySelector('input[name=kind][value=svadba]').click()")
        time.sleep(0.6)
        svadba = t.questions()
        check("под свадьбу свои вопросы",
              "Дата свадьбы" in svadba and "Дата свадьбы" not in base, svadba[:60])
        t.js("document.querySelector('input[name=kind][value=reklama]').click()")
        time.sleep(0.6)

        # 3. ответ учитывается счётчиком
        t.js("(()=>{const a=document.querySelector('#questions .a');a.value='Продукт — батончики';"
             "a.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        st = t.stats()
        check("ответ учтён", st["done"] == 1, st)
        check("ответ попал в лист",
              "батончики" in t.js("document.getElementById('paper').innerText"), "")
        meter = t.js("document.querySelector('#meter .mtext').textContent")
        check("счётчик предупреждает про обязательные", "обязательных" in (meter or ""), meter)

        # 4. звёздочка снимается и ставится
        must_before = t.stats()["must"]
        t.js("document.querySelector('#questions .must-btn').click()")
        time.sleep(0.5)
        check("пометку обязательного можно снять", t.stats()["must"] == must_before - 1, t.stats())
        t.js("document.querySelector('#questions .must-btn').click()")
        time.sleep(0.5)
        check("и вернуть", t.stats()["must"] == must_before, t.stats())

        # 5. свой вопрос и перестановка
        t.js("document.getElementById('add-q').click()")
        time.sleep(0.4)
        t.js("(()=>{const qs=document.querySelectorAll('#questions .q');"
             "const last=qs[qs.length-1];last.value='Кто согласует финальную версию?';"
             "last.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        check("свой вопрос в листе",
              "Кто согласует финальную версию?" in t.js("document.getElementById('paper').innerText"), "")
        first, second = t.questions().split("|")[0], t.questions().split("|")[1]
        t.js("document.querySelector('#questions .down').click()")
        time.sleep(0.5)
        qs = t.questions().split("|")
        check("вопросы переставляются", qs[0] == second and qs[1] == first, qs[0][:40])

        # 6. текст для мессенджера
        msg = t.js("PobubnimBrief.messengerText()")
        check("текст для мессенджера пронумерован", "1. " in msg and "2. " in msg, msg[:60])
        check("в тексте отмечены обязательные", " *" in msg, "")
        check("в тексте есть пояснение звёздочки", msg.strip().endswith("сроки."), msg[-60:])

        # 7. Word
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 8. черновик
        time.sleep(0.9)
        t.goto(URL)
        check("черновик вернул ответ",
              "батончики" in (t.js("document.getElementById('paper').innerText") or ""), "")
        check("черновик вернул свой вопрос",
              "Кто согласует финальную версию?" in t.questions(), "")
        check("про черновик сказано пользователю",
              t.js("!document.getElementById('draft-note').hidden") is True, "")
        t.js("document.getElementById('btn-reset').click()")
        time.sleep(0.6)
        check("«собрать заново» вернул исходный набор",
              "Кто согласует финальную версию?" not in t.questions(), "")

        # 9. мобила
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        time.sleep(0.6)
        sw = t.js("document.documentElement.scrollWidth")
        cw = t.js("document.documentElement.clientWidth")
        check("мобила 375 без оверфлоу (и без веб-шрифтов)", sw <= cw + 1, f"{sw} > {cw}")

        check("без ошибок в консоли", not t.errors, t.errors[:2])
    finally:
        t.close()

    print(("\nПРОВАЛЕНО: " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
