# -*- coding: utf-8 -*-
"""Приёмка доски «петличка или пушка» (uroki/petlichka-ili-pushka.html).

Главное: доска должна СЧИТАТЬ. Критическое расстояние, уровень прямого звука и
отношение «голос / комната» пересчитываются здесь независимо по формулам
EDU_BASE §8о.1 и сверяются с тем, что показывает страница.

Запуск:  python tools/test_soundboard.py [url]
"""
import json
import math
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

from _chrome import CHROME  # Windows или облако — tools/_chrome.py
PORT = 9499
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/petlichka-ili-pushka.html"

DIST = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1, 1.5, 2, 3, 4, 5]
MICS = [1, 3, 3.9, 10]
ROOMS = [(40, 0.25), (60, 0.5), (60, 0.9), (600, 1.2), (3000, 2.5)]

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def rc_ref(room, mic):
    v, t = ROOMS[room]
    return 0.057 * math.sqrt(v / t) * math.sqrt(MICS[mic])


def direct_ref(dist):
    return -20 * math.log10(DIST[dist] / 0.2)


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
        self.cmd("Network.setCacheDisabled", cacheDisabled=True)
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
        obj = res.get("result", {})
        if "value" in obj:
            return obj["value"]
        # CDP не умеет сериализовать -0, NaN и бесконечности значением,
        # а ноль децибел на 20 см приходит именно как -0 (грабля 21.09)
        return {"-0": -0.0, "NaN": float("nan"),
                "Infinity": float("inf"), "-Infinity": float("-inf")
                }.get(obj.get("unserializableValue"))

    def dist(self, i):
        self.js("(()=>{const e=document.querySelector('[data-dist]');e.value=%d;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % i)

    def mic(self, i):
        self.js("document.querySelector('[data-mic=\"%d\"]').click()" % i)

    def room(self, i):
        self.js("document.querySelector('[data-room=\"%d\"]').click()" % i)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimSound") == "object":
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

        # 1. критическое расстояние сходится с независимым расчётом
        for room, mic in ((1, 0), (2, 0), (3, 0), (1, 3), (4, 2)):
            t.room(room)
            t.mic(mic)
            time.sleep(0.35)
            got = t.js("PobubnimSound.rc()")
            ref = rc_ref(room, mic)
            check(f"граница: комната {room}, микрофон {mic}", abs(got - ref) < 0.002,
                  f"{got:.3f} против {ref:.3f}")

        # 2. прямой звук падает по обратным квадратам
        t.room(1)
        t.mic(0)
        for i in (2, 5, 7, 10, 12):
            t.dist(i)
            time.sleep(0.3)
            got = t.js("PobubnimSound.directDb()")
            check(f"прямой звук на {DIST[i]} м", abs(got - direct_ref(i)) < 0.01,
                  f"{got:.2f} против {direct_ref(i):.2f}")

        # 3. удвоение расстояния стоит ровно шесть децибел
        t.dist(7)                       # 1 м
        time.sleep(0.3)
        one = t.js("PobubnimSound.directDb()")
        t.dist(9)                       # 2 м
        time.sleep(0.3)
        two = t.js("PobubnimSound.directDb()")
        check("вдвое дальше — минус 6 дБ", abs((one - two) - 6.0206) < 0.01, f"{one - two:.2f}")

        # 4. главное число базы: петличка 20 см против камеры в 3 м
        t.dist(10)
        time.sleep(0.3)
        check("камера в 3 м проигрывает петличке 23,5 дБ",
              abs(t.js("PobubnimSound.directDb()") + 23.52) < 0.05,
              t.js("PobubnimSound.directDb()"))

        # 5. отношение «голос / комната» = 20*lg(rc/d)
        for room, mic, i in ((1, 0, 10), (0, 3, 5), (4, 1, 8)):
            t.room(room); t.mic(mic); t.dist(i)
            time.sleep(0.35)
            got = t.js("PobubnimSound.dr()")
            ref = 20 * math.log10(rc_ref(room, mic) / DIST[i])
            check(f"голос/комната: комната {room}, микрофон {mic}, {DIST[i]} м",
                  abs(got - ref) < 0.02, f"{got:.2f} против {ref:.2f}")

        # 6. направленность двигает границу как корень из Q
        t.room(1); t.dist(10)
        t.mic(0)
        time.sleep(0.35)
        omni = t.js("PobubnimSound.rc()")
        t.mic(3)
        time.sleep(0.35)
        gun = t.js("PobubnimSound.rc()")
        check("пушка отодвигает границу в 3,16 раза",
              abs(gun / omni - math.sqrt(10)) < 0.01, f"{gun / omni:.3f}")

        # 7. пустая комната — граница ближе, чем в комнате с мебелью
        t.mic(0)
        t.room(1)
        time.sleep(0.35)
        furnished = t.js("PobubnimSound.rc()")
        t.room(2)
        time.sleep(0.35)
        empty = t.js("PobubnimSound.rc()")
        check("в пустой комнате граница ближе", empty < furnished, f"{empty:.2f} против {furnished:.2f}")

        # 8. контринтуитивный факт: в большом зале граница ДАЛЬШЕ, чем в маленькой комнате
        t.room(3)
        time.sleep(0.35)
        hall = t.js("PobubnimSound.rc()")
        check("в зале граница дальше, чем в пустой комнате", hall > empty,
              f"{hall:.2f} против {empty:.2f}")

        # 9. доля отражений растёт с расстоянием
        t.room(1)
        t.dist(2)                        # 20 см
        time.sleep(0.35)
        near = t.js("PobubnimSound.wet()")
        t.dist(12)                       # 5 м
        time.sleep(0.35)
        far = t.js("PobubnimSound.wet()")
        check("вблизи отражений меньше 20 %", near < 0.2, f"{near:.2f}")
        check("в пяти метрах отражений больше 90 %", far > 0.9, f"{far:.2f}")

        # 10. вердикт меняется от расстояния и называется по-человечески
        t.dist(0)                        # 10 см
        time.sleep(0.4)
        stat_near = t.js("document.getElementById('sb-stat').innerText")
        t.dist(12)
        time.sleep(0.4)
        stat_far = t.js("document.getElementById('sb-stat').innerText")
        check("вблизи — «сухо, как в студии»", "сухо" in (stat_near or ""), stat_near)
        check("издалека — «как из бочки»", "из бочки" in (stat_far or ""), stat_far)
        for probe in ("ПРЯМОЙ ЗВУК", "ГОЛОС / КОМНАТА", "ГРАНИЦА", "ОТРАЖЕНИЙ"):
            check("в подписи есть " + probe.lower(), probe in (stat_far or ""), stat_far)
        check("тревожная плашка на плохом отношении",
              t.js("document.querySelectorAll('#sb-stat .warn').length") >= 1, "")

        # 11. кадр рисуется, а не остаётся пустым
        ink = t.js("(()=>{const c=document.getElementById('sb-frame');"
                   "const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
                   "let s=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0)s++;return s;})()")
        check("доска нарисована", ink > 20000, ink)

        # 12. страница собрана по закону: один h1, FAQ на месте, нет чужих шрифтов
        check("ровно один h1", t.js("document.querySelectorAll('h1').length") == 1)
        check("пробел после запросного span в h1",
              t.js("document.querySelector('h1 .label').nextSibling.textContent.startsWith(' ')"))
        check("шесть вопросов в FAQ",
              t.js("document.querySelectorAll('details.svc-faq').length") == 6)
        check("оговорка про модель в подписи под доской",
              "одель" in (t.js("document.querySelector('.viz-cap').innerText") or ""))

        # 13. мобильная ширина: доска не рвёт страницу
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=2, mobile=True)
        time.sleep(0.6)
        over = t.js("(()=>{const w=document.documentElement.clientWidth;"
                    "return [...document.querySelectorAll('.board, .board *')]"
                    ".filter(e=>e.getBoundingClientRect().right>w+1).length;})()")
        check("на 375 px ничего не вылезает за экран", over == 0, over)

        check("консоль чистая", not t.errors, t.errors)
    finally:
        t.close()

    print()
    if fails:
        print(f"ПРОВАЛЕНО {len(fails)}:")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("Все проверки прошли.")


if __name__ == "__main__":
    main()
