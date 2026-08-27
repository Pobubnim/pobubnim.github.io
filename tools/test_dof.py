# -*- coding: utf-8 -*-
"""Приёмка калькулятора ГРИП (instrumenty/kalkulyator-grip.html) на живой странице.

Формулы проверяет tools/verify_dof.py; здесь — что интерфейс считает то, что
показывает: реакция на формат и критерий резкости, бесконечность за
гиперфокалом, размытие фона, схема зоны, мобильная раскладка.

Запуск:  python tools/test_dof.py [url]
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9403
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/kalkulyator-grip.html"

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

    def set(self, el_id, value):
        self.js("(()=>{const e=document.getElementById('%s');e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));"
                "e.dispatchEvent(new Event('change',{bubbles:true}));})()" % (el_id, json.dumps(str(value))))

    def total(self):
        return self.js("(()=>{const s=PobubnimGrip.state();return s.d.total;})()")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimGrip") == "object":
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

        # 1. базовый расчёт виден в листе
        paper = t.js("document.getElementById('paper').innerText")
        check("в листе есть границы резкости", "Резкость от" in paper and "Резкость до" in paper, paper[:60])
        check("в листе есть гиперфокал", "Гиперфокал" in paper, "")
        base = t.total()
        check("глубина посчиталась", base and base > 0, base)

        # 2. чип фокусного подставляет значение и пересчитывает
        t.js("document.querySelectorAll('#chips-focal .chip')[4].click()")   # 85 мм
        time.sleep(0.4)
        focal = t.js("document.getElementById('f-focal').value")
        long_lens = t.total()
        check("чип поставил фокусное", focal == "85", focal)
        check("длинный объектив режет глубину", long_lens < base, f"{long_lens} против {base}")
        t.set("f-focal", 50)
        time.sleep(0.3)

        # 3. диафрагма и дистанция ведут себя по физике
        t.set("f-ap", 5.6)
        time.sleep(0.3)
        closed = t.total()
        check("закрытая диафрагма увеличивает глубину", closed > base, f"{closed} против {base}")
        t.set("f-ap", 2.8)
        t.set("f-dist", 1.5)
        time.sleep(0.4)
        near_shot = t.total()
        check("ближе к объекту — глубина меньше", near_shot < base, f"{near_shot} против {base}")
        t.set("f-dist", 3)
        time.sleep(0.3)

        # 4. строгий критерий сужает зону
        t.js("document.querySelector('input[name=strict][value=pixel]').click()")
        time.sleep(0.4)
        strict_total = t.total()
        c_pixel = t.js("PobubnimGrip.state().c")
        check("режим «по пикселям» строже", strict_total < base, f"{strict_total} против {base}")
        check("кружок нерезкости пересчитан", abs(c_pixel - 2 * 36 / 3840) < 1e-9, c_pixel)
        t.js("document.querySelector('input[name=strict][value=print]').click()")
        time.sleep(0.3)

        # 5. формат сенсора: физика, а не фольклор.
        # При ТОМ ЖЕ фокусном у меньшего сенсора кружок нерезкости меньше,
        # значит и глубина резкости меньше. Больше она становится только при
        # том же УГЛЕ ОБЗОРА, то есть на пропорционально коротком объективе.
        t.set("f-fmt", 4)      # Micro 4/3
        time.sleep(0.4)
        mft_same_focal = t.total()
        check("тот же объектив на M4/3 — глубина меньше (кружок строже)",
              mft_same_focal < base, f"{mft_same_focal} против {base}")
        t.set("f-focal", 24)   # тот же угол обзора, что 50 мм на полном кадре
        time.sleep(0.4)
        mft_same_view = t.total()
        check("тот же угол обзора на M4/3 — глубина больше",
              mft_same_view > base, f"{mft_same_view} против {base}")
        t.set("f-focal", 50)
        t.set("f-fmt", 0)
        time.sleep(0.3)

        # 6. за гиперфокалом резкость до бесконечности
        H = t.js("PobubnimGrip.state().d.H")
        t.set("f-dist", round(H / 1000 * 1.5, 1))
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        check("за гиперфокалом — до бесконечности", "бесконечность" in paper, paper[:80])
        t.set("f-dist", 3)
        time.sleep(0.3)

        # 7. фон: внутри зоны и размытый
        t.set("f-bg", 3.05)
        time.sleep(0.4)
        check("фон в зоне резкости отмечен",
              "внутри зоны резкости" in t.js("document.getElementById('paper').innerText"), "")
        t.set("f-bg", 12)
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        blur_px = t.js("PobubnimGrip.state().blurPx")
        check("размытие фона в пикселях", "px" in paper and blur_px > 1, f"{blur_px}")

        # 8. схема зоны резкости рисуется
        zone = t.js("document.querySelectorAll('#scene-bar .zone').length")
        marks = t.js("document.querySelectorAll('#scene-bar .mark').length")
        check("схема зоны нарисована", zone == 1 and marks == 2, f"zone={zone} marks={marks}")

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
