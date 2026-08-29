# -*- coding: utf-8 -*-
"""Приёмка доски глубины резкости (uroki/glubina-rezkosti.html).

Проверяет, что доска не просто рисует картинку, а считает: диаметры кружков
берутся из формулы (сверяются с независимым расчётом на питоне), ползунки и
переключатель сенсора меняют числа по физике, линейка резкости двигается.

Запуск:  python tools/test_dofboard.py [url]
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9493
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/glubina-rezkosti.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def spot_ref(f, N, s_m, d_m, sensor_w, canvas_w):
    """Диаметр пятна в пикселях канваса — независимый расчёт."""
    s, d = s_m * 1000.0, d_m * 1000.0
    mm = (f * f * abs(d - s)) / (N * d * (s - f))
    return mm * (canvas_w / sensor_w)


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
            self.errors.append(str(res["exceptionDetails"].get("text")) + " " +
                               str(res["exceptionDetails"].get("exception", {}).get("description", ""))[:120])
            return None
        return res.get("result", {}).get("value")

    def slider(self, attr, value):
        self.js("(()=>{const e=document.querySelector('[data-%s]');e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (attr, value))

    def state(self):
        return json.loads(self.js("JSON.stringify(PobubnimDofBoard.state)"))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimDofBoard") == "object":
                return
        raise RuntimeError("доска не поднялась")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def main():
    t = Tab()
    try:
        t.goto(URL)

        # 1. доска нарисовала числа
        stat = t.js("document.getElementById('db-stat').innerText")
        check("в подписи есть зона резкости", "РЕЗКОСТЬ" in (stat or ""), stat)
        check("в подписи есть гиперфокал", "ГИПЕРФОКАЛ" in (stat or ""), stat)
        check("в подписи есть размер кружка", "ОГОНЬ НА 30 М" in (stat or ""), stat)

        # 2. диаметр кружка совпадает с независимым расчётом
        st = t.state()
        cw = t.js("document.getElementById('db-frame').width")
        sensor = t.js("PobubnimDofBoard.calc().sensorW")
        got = t.js("PobubnimDofBoard.spotPx(30)")
        # слайдер задаёт ЭКВИВАЛЕНТНОЕ фокусное — в формулу идёт реальное
        real_f = t.js("PobubnimDofBoard.realF()")
        ref = spot_ref(real_f, st["N"], st["s"], 30, sensor, cw)
        check("кружок на 30 м считается формулой", abs(got - ref) < 0.01, f"{got:.3f} против {ref:.3f}")

        # 3. физика: открыли дырку — кружок больше, зона уже
        base_spot = t.js("PobubnimDofBoard.spotPx(30)")
        base_dof = t.js("PobubnimDofBoard.calc().dof.total")
        t.slider("ap", 2)          # f/1.8
        time.sleep(0.4)
        check("открытая диафрагма — кружок крупнее", t.js("PobubnimDofBoard.spotPx(30)") > base_spot,
              t.js("PobubnimDofBoard.spotPx(30)"))
        check("открытая диафрагма — глубина меньше", t.js("PobubnimDofBoard.calc().dof.total") < base_dof,
              t.js("PobubnimDofBoard.calc().dof.total"))

        # 4. подошли ближе — глубина падает; отошли — растёт
        t.slider("ap", 4)          # обратно f/2.8
        t.slider("dist", 15)       # 1,5 м
        time.sleep(0.4)
        near_dof = t.js("PobubnimDofBoard.calc().dof.total")
        t.slider("dist", 60)       # 6 м
        time.sleep(0.4)
        far_dof = t.js("PobubnimDofBoard.calc().dof.total")
        check("ближе к герою — глубина меньше", near_dof < far_dof, f"{near_dof:.0f} против {far_dof:.0f}")

        # 5. длинный объектив режет глубину
        t.slider("dist", 30)
        t.slider("focal", 50)
        time.sleep(0.4)
        d50 = t.js("PobubnimDofBoard.calc().dof.total")
        t.slider("focal", 135)
        time.sleep(0.4)
        d135 = t.js("PobubnimDofBoard.calc().dof.total")
        check("135 мм режет глубину сильнее 50 мм", d135 < d50, f"{d135:.0f} против {d50:.0f}")
        t.slider("focal", 50)
        time.sleep(0.3)

        # 6. сенсор переключается — крупность держится, физика формата верна
        ff = t.js("PobubnimDofBoard.calc().sensorW")
        ff_spot = t.js("PobubnimDofBoard.spotPx(30)")
        ff_dof = t.js("PobubnimDofBoard.calc().dof.total")
        ff_lens = t.js("PobubnimDofBoard.realF()")
        check("на полном кадре объектив равен эквивалентному", abs(ff_lens - 50) < 0.01, ff_lens)
        t.js("document.querySelectorAll('#db .vbtn')[4].click()")   # телефон
        time.sleep(0.5)
        phone = t.js("PobubnimDofBoard.calc().sensorW")
        phone_spot = t.js("PobubnimDofBoard.spotPx(30)")
        phone_dof = t.js("PobubnimDofBoard.calc().dof.total")
        phone_lens = t.js("PobubnimDofBoard.realF()")
        crop = t.js("PobubnimDofBoard.cropFactor()")
        check("сенсор переключился", phone < ff, f"{phone} против {ff}")
        check("кроп-фактор телефона ≈ 4,7", abs(crop - 36 / 7.6) < 0.01, crop)
        check("крупность держится: объектив пересчитан под формат (50 мм → 10,6 мм)",
              abs(phone_lens - 50 * 7.6 / 36) < 0.01, phone_lens)
        # главная проверка урока: при равной крупности большой сенсор мылит сильнее
        check("телефон размывает фон СЛАБЕЕ полного кадра (примерно в кроп-фактор раз)",
              phone_spot < ff_spot and abs(ff_spot / phone_spot - crop) < 0.3,
              f"ФК {ff_spot:.2f} px, телефон {phone_spot:.2f} px, отношение {ff_spot / phone_spot:.2f}")
        check("у телефона глубина резкости БОЛЬШЕ, чем у полного кадра",
              phone_dof > ff_dof * 3, f"телефон {phone_dof:.0f} мм против {ff_dof:.0f} мм")
        check("в подписи виден реальный объектив и кроп-фактор",
              "ОБЪЕКТИВ" in (t.js("document.getElementById('db-stat').innerText") or "") and
              "кроп" in (t.js("document.getElementById('db-stat').innerText") or ""),
              t.js("document.getElementById('db-stat').innerText"))
        t.js("document.querySelectorAll('#db .vbtn')[0].click()")
        time.sleep(0.4)

        # 7. линейка резкости живая
        w1 = t.js("document.querySelector('#db-ruler .zone').style.width")
        t.slider("ap", 9)          # f/16
        time.sleep(0.5)
        w2 = t.js("document.querySelector('#db-ruler .zone').style.width")
        check("зона на линейке расширилась при f/16",
              float(w2.replace("%", "")) > float(w1.replace("%", "")), f"{w1} -> {w2}")
        check("метка фокуса на линейке есть",
              t.js("document.querySelectorAll('#db-ruler .mark').length") == 1, "")

        # 8. холст реально что-то рисует (не пустой чёрный)
        nonblank = t.js("(()=>{const c=document.getElementById('db-frame');"
                        "const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
                        "let n=0;for(let i=0;i<d.length;i+=4){if(d[i]+d[i+1]+d[i+2]>90)n++;}"
                        "return Math.round(n/(c.width*c.height)*100);})()")
        check("на кадре есть свет (не чёрный прямоугольник)", nonblank and nonblank >= 1, f"{nonblank}%")

        # 9. мобила
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        time.sleep(0.6)
        sw = t.js("document.documentElement.scrollWidth")
        cw2 = t.js("document.documentElement.clientWidth")
        check("мобила 375 без оверфлоу (и без веб-шрифтов)", sw <= cw2 + 1, f"{sw} > {cw2}")

        check("без ошибок в консоли", not t.errors, t.errors[:2])
    finally:
        t.close()

    print(("\nПРОВАЛЕНО: " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
