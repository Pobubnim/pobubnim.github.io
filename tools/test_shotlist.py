# -*- coding: utf-8 -*-
"""Приёмка шот-листа (instrumenty/shot-list.html) на живой странице.

Гоняет инструмент в headless Chrome как руками: набивает кадры пресетами,
проверяет нумерацию, счётчик смены, перебор, лист, сборку .docx и черновик
в localStorage. Падает с кодом 1 на первом расхождении.

Запуск:  python tools/test_shotlist.py [url]
         (по умолчанию http://localhost:8765/instrumenty/shot-list.html)
"""
import json
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9351
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/shot-list.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self, width=1280):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             f"--window-size={width},900", "about:blank"],
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
        if not tabs:
            raise RuntimeError("Chrome не поднялся")
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0
        self.errors = []
        self.cmd("Runtime.enable")
        # худший случай раскладки: системный шрифт вместо Inter (пока грузятся веб-шрифты)
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

    def js(self, expr, await_promise=False):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=await_promise)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            self.errors.append(str(res["exceptionDetails"].get("text")) + " " +
                               str(res["exceptionDetails"].get("exception", {}).get("description", "")))
            return None
        return res.get("result", {}).get("value")

    def goto(self, url, wait=2.2):
        self.cmd("Page.navigate", url=url)
        time.sleep(wait)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def main():
    t = Tab()
    try:
        t.goto(URL)

        # 1. чипы пресетов рисуются и меняются под тип съёмки
        n_svadba = t.js("document.querySelectorAll('#chips .chip').length")
        check("чипы свадьбы отрисованы", n_svadba and n_svadba >= 6, n_svadba)
        t.js("document.querySelector('input[name=kind][value=interv]').click()")
        time.sleep(0.3)
        first_interv = t.js("document.querySelector('#chips .chip').textContent")
        check("чипы сменились на интервью", "Герой" in (first_interv or ""), first_interv)
        t.js("document.querySelector('input[name=kind][value=svadba]').click()")
        time.sleep(0.3)

        # 2. «все кадры» набивают сцену, нумерация сквозная внутри сцены
        t.js("document.querySelector('#chips .chip.all').click()")
        time.sleep(0.4)
        shots = t.js("document.querySelectorAll('#scenes .shot').length")
        check("пресет набил кадры", shots == 7, shots)
        nums = t.js("[...document.querySelectorAll('#scenes .sn')].map(e=>e.textContent).join(',')")
        check("нумерация 1.1…1.7", nums == "1.1,1.2,1.3,1.4,1.5,1.6,1.7", nums)

        # 3. счётчик: 7 кадров × 15 мин + 60 мин запаса = 165 мин из 480
        d = t.js("JSON.stringify(window.PobubnimShotlist.calc())")
        d = json.loads(d) if d else {}
        check("счётчик: 7 кадров", d.get("shots") == 7, d)
        check("счётчик: 105 мин съёмки", d.get("mins") == 105, d)
        check("счётчик: занято 165 мин", d.get("busy") == 165, d)
        check("счётчик: в смену влезает", d.get("over") is False, d)
        mtext = t.js("document.querySelector('#meter .mtext').textContent")
        check("текст счётчика человеческий", "7 кадров" in (mtext or "") and "из 8 ч" in (mtext or ""), mtext)

        # 4. свои минуты у кадра перебивают дефолт
        t.js("(()=>{const i=document.querySelector('#scenes .shot .min');"
             "i.value=45;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        d2 = json.loads(t.js("JSON.stringify(window.PobubnimShotlist.calc())"))
        check("свои минуты учтены (105-15+45=135)", d2.get("mins") == 135, d2)

        # 5. перебор смены красит счётчик
        t.js("(()=>{const i=document.getElementById('f-shift');"
             "i.value=1;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        over = t.js("document.getElementById('meter').classList.contains('over')")
        over_txt = t.js("document.querySelector('#meter .mtext').textContent")
        check("перебор смены помечен", over is True, over)
        check("перебор объяснён словами", "не влезает" in (over_txt or ""), over_txt)
        t.js("(()=>{const i=document.getElementById('f-shift');"
             "i.value=8;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.3)

        # 6. лист собрался: заголовок сцены + таблица кадров + строка итога
        t.js("(()=>{const p=document.getElementById('f-proj');"
             "p.value='Свадьба Ани и Миши';p.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        check("в листе имя проекта", "Свадьба Ани и Миши" in (paper or ""), (paper or "")[:80])
        check("в листе есть сцена", "Сцена 1" in (paper or ""), "")
        check("в листе есть итог", "Итого: 7 кадров" in (paper or ""), "")
        rows = t.js("document.querySelectorAll('#paper table.shots tr').length")
        check("в таблице листа 7 кадров + шапка", rows == 8, rows)
        cols = t.js("document.querySelector('#paper table.shots').dataset.cols")
        check("ширины колонок для Word заданы (в сумме 100%)", cols == "6,38,15,17,14,10" and sum(map(int, cols.split(","))) == 100, cols)

        # 7. .docx реально собирается
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 8. черновик переживает перезагрузку
        time.sleep(0.8)
        t.goto(URL)
        proj = t.js("document.getElementById('f-proj').value")
        shots2 = t.js("document.querySelectorAll('#scenes .shot').length")
        note = t.js("!document.getElementById('draft-note').hidden")
        check("черновик восстановлен: проект", proj == "Свадьба Ани и Миши", proj)
        check("черновик восстановлен: кадры", shots2 == 7, shots2)
        check("про черновик сказано пользователю", note is True, note)

        # 9. кнопка очистки стирает всё
        t.js("document.getElementById('btn-clear').click()")
        time.sleep(0.5)
        after = t.js("document.querySelectorAll('#scenes .shot').length")
        stored = t.js("localStorage.getItem('pobubnim-shotlist-v1')")
        check("очистка вернула пустой лист", after == 1, after)
        check("очистка стёрла черновик", stored in (None, ""), stored)

        # 10. мобила: без горизонтального оверфлоу
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        t.js("document.querySelector('#chips .chip.all').click()")
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
