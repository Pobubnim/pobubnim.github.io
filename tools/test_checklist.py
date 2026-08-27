# -*- coding: utf-8 -*-
"""Приёмка чек-листа съёмочного дня (instrumenty/chek-list-semki.html).

Проверяет: набор под тип съёмки, отметки со счётчиком, свои пункты и разделы,
перестановку, «снять галочки» и «собрать заново», лист и Word, черновик с
галочками, прикидку по батареям, мобильную раскладку.

Запуск:  python tools/test_checklist.py [url]
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9431
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/chek-list-semki.html"

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
        return json.loads(self.js("JSON.stringify(PobubnimChecklist.stats())"))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimChecklist") == "object":
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
        t.js("localStorage.removeItem('pobubnim-checklist-v1')")
        t.goto(URL)

        # 1. набор собрался
        st = t.stats()
        groups = t.js("document.querySelectorAll('#groups .group').length")
        check("разделы собраны", groups >= 8, groups)
        check("пунктов больше сорока", st["all"] >= 40, st["all"])
        check("сначала ничего не отмечено", st["done"] == 0, st)

        # 2. тип съёмки меняет набор
        base_all = st["all"]
        base_text = t.js("[...document.querySelectorAll('#groups .txt')].map(e=>e.value).join('|')")
        t.js("document.querySelector('input[name=kind][value=meropr]').click()")
        time.sleep(0.6)
        meropr_text = t.js("[...document.querySelectorAll('#groups .txt')].map(e=>e.value).join('|')")
        check("под мероприятие появились свои пункты",
              "Аккредитация" in meropr_text and "Аккредитация" not in base_text, "")
        t.js("document.querySelector('input[name=kind][value=svadba]').click()")
        time.sleep(0.6)
        check("вернулся свадебный набор", t.stats()["all"] == base_all, t.stats())

        # 3. галочка отмечается и считается
        t.js("(()=>{const c=document.querySelector('#groups .tick input');c.click();})()")
        time.sleep(0.5)
        st = t.stats()
        check("галочка учтена счётчиком", st["done"] == 1, st)
        meter = t.js("document.querySelector('#meter .mtext').textContent")
        check("счётчик написан по-человечески", "Собрано 1 из" in (meter or ""), meter)
        check("отмеченный пункт зачёркнут",
              t.js("document.querySelector('#groups .txt').classList.contains('done')") is True, "")
        check("галочка попала в лист",
              "☑" in (t.js("document.getElementById('paper').innerText") or ""), "")

        # 4. свой пункт и свой раздел
        t.js("document.querySelector('#groups .add-item').click()")
        time.sleep(0.4)
        t.js("(()=>{const rows=document.querySelectorAll('#groups .group')[0].querySelectorAll('.item');"
             "const last=rows[rows.length-1].querySelector('.txt');last.value='Клаппер';"
             "last.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        check("свой пункт в листе", "Клаппер" in t.js("document.getElementById('paper').innerText"), "")
        t.js("document.getElementById('add-group').click()")
        time.sleep(0.5)
        check("свой раздел добавлен",
              t.js("document.querySelectorAll('#groups .group').length") == groups + 1, "")
        t.js("(()=>{const gs=document.querySelectorAll('#groups .group');"
             "gs[gs.length-1].querySelector('.del-g').click();})()")
        time.sleep(0.5)

        # 5. перестановка пунктов и разделов
        first = t.js("document.querySelector('#groups .txt').value")
        second = t.js("document.querySelectorAll('#groups .txt')[1].value")
        t.js("document.querySelector('#groups .item .down').click()")
        time.sleep(0.5)
        check("пункты переставляются",
              t.js("document.querySelector('#groups .txt').value") == second and
              t.js("document.querySelectorAll('#groups .txt')[1].value") == first,
              t.js("document.querySelector('#groups .txt').value"))
        g1 = t.js("document.querySelector('#groups .g-name').value")
        t.js("document.querySelector('#groups .down-g').click()")
        time.sleep(0.5)
        check("разделы переставляются",
              t.js("document.querySelectorAll('#groups .g-name')[1].value") == g1, "")

        # 6. батареи считаются по своей цифре
        t.js("(()=>{const e=document.getElementById('f-shift');e.value=12;"
             "e.dispatchEvent(new Event('input',{bubbles:true}));})()")
        t.js("(()=>{const e=document.getElementById('f-bat');e.value=2;"
             "e.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        st = t.stats()
        check("батареи посчитаны (12 ч / 2 ч = 6)", st["batteries"] == 6, st)
        check("прикидка в листе",
              "батарей примерно 6" in t.js("document.getElementById('paper').innerText"), "")

        # 7. .docx собирается и содержит пункты
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 8. черновик с галочками переживает перезагрузку
        time.sleep(0.9)
        t.goto(URL)
        st = t.stats()
        check("черновик вернул отметки", st["done"] >= 1, st)
        check("черновик вернул свой пункт",
              "Клаппер" in t.js("[...document.querySelectorAll('#groups .txt')].map(e=>e.value).join('|')"), "")
        check("про черновик сказано пользователю",
              t.js("!document.getElementById('draft-note').hidden") is True, "")

        # 9. снять галочки и собрать заново
        t.js("document.getElementById('btn-uncheck').click()")
        time.sleep(0.5)
        check("галочки сняты", t.stats()["done"] == 0, t.stats())
        t.js("document.getElementById('btn-reset').click()")
        time.sleep(0.6)
        check("собран заново — свой пункт исчез",
              "Клаппер" not in t.js("[...document.querySelectorAll('#groups .txt')].map(e=>e.value).join('|')"), "")

        # 10. мобила
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
