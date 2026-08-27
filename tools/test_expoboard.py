# -*- coding: utf-8 -*-
"""Приёмка доски экспозиционного треугольника (uroki/ekspozicionnyj-treugolnik.html).

Главное: доска должна СЧИТАТЬ, а не изображать. Отклонение экспозиции
сверяется с независимым расчётом (EV = log2(N²/t) − log2(ISO/100)), а три
платы — глубина резкости, смаз и шум — должны вести себя по физике.

Запуск:  python tools/test_expoboard.py [url]
"""
import json
import math
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9497
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/ekspozicionnyj-treugolnik.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def offset_ref(ev_scene, N, t, iso):
    return ev_scene - (math.log2(N * N / t) - math.log2(iso / 100))


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

    def slider(self, attr, value):
        self.js("(()=>{const e=document.querySelector('[data-%s]');e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (attr, value))

    def scene(self, i):
        self.js("document.querySelectorAll('#eb .vbtn')[%d].click()" % i)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimExpo") == "object":
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

        # 1. отклонение экспозиции сходится с независимым расчётом
        EV = [15, 13, 11, 7, 4]
        for scene, ap, shut, iso in ((1, 2, 4, 2), (0, 5, 1, 0), (4, 0, 4, 6)):
            t.scene(scene)
            t.slider("ap", ap)
            t.slider("shut", shut)
            t.slider("iso", iso)
            time.sleep(0.45)
            got = t.js("PobubnimExpo.offset()")
            N = t.js("PobubnimExpo.N()")
            tt = t.js("PobubnimExpo.t()")
            iso_v = t.js("PobubnimExpo.iso()")
            ref = offset_ref(EV[scene], N, tt, iso_v)
            check(f"экспозиция: сцена EV{EV[scene]}, f/{N}, ISO {iso_v}",
                  abs(got - ref) < 0.02, f"{got:.2f} против {ref:.2f}")

        # 2. стоп есть стоп: шаг любой ручки меняет экспозицию на один стоп
        t.scene(1); t.slider("ap", 3); t.slider("shut", 4); t.slider("iso", 2)
        time.sleep(0.4)
        base = t.js("PobubnimExpo.offset()")
        t.slider("ap", 2)          # открыли на стоп
        time.sleep(0.35)
        by_ap = t.js("PobubnimExpo.offset()")
        t.slider("ap", 3); t.slider("iso", 3)   # ISO вдвое
        time.sleep(0.35)
        by_iso = t.js("PobubnimExpo.offset()")
        # открыли дырку или подняли ISO — света больше, значит «пересвет» растёт на стоп
        # (ряд диафрагм округлён: 2,8 вместо 2,83 — отсюда допуск чуть шире)
        check("диафрагма даёт стоп", abs((by_ap - base) - 1) < 0.06, f"{by_ap - base:.2f}")
        check("ISO даёт стоп", abs((by_iso - base) - 1) < 0.02, f"{by_iso - base:.2f}")

        # 3. три платы ведут себя по физике
        t.slider("iso", 2)
        time.sleep(0.3)
        dof_open = t.js("PobubnimExpo.dof().total")
        t.slider("ap", 6)          # f/11
        time.sleep(0.4)
        check("закрытая диафрагма — глубина больше", t.js("PobubnimExpo.dof().total") > dof_open,
              t.js("PobubnimExpo.dof().total"))
        t.slider("ap", 2)
        t.slider("shut", 0)        # 1/500
        time.sleep(0.4)
        smear_fast = t.js("PobubnimExpo.blurPx()")
        t.slider("shut", 6)        # 1/12
        time.sleep(0.4)
        smear_slow = t.js("PobubnimExpo.blurPx()")
        check("длинная выдержка — смаз больше", smear_slow > smear_fast * 5,
              f"{smear_slow:.1f} против {smear_fast:.1f}")
        t.slider("shut", 4)
        n_low = t.js("PobubnimExpo.noise()")
        t.slider("iso", 7)         # ISO 12800
        time.sleep(0.4)
        check("высокое ISO — шум больше", t.js("PobubnimExpo.noise()") > n_low * 3,
              t.js("PobubnimExpo.noise()"))
        t.slider("iso", 2)
        time.sleep(0.3)

        # 4. подписи под доской говорят по-человечески
        stat = t.js("document.getElementById('eb-stat').innerText")
        for probe in ("ЭКСПОЗИЦИЯ", "ГЛУБИНА", "СМАЗ", "ШУМ"):
            check("в подписи есть " + probe.lower(), probe in (stat or ""), stat)
        t.slider("shut", 4)
        time.sleep(0.35)
        check("выдержка по правилу 180° названа «как в кино»",
              "как в кино" in t.js("document.getElementById('eb-stat').innerText"), "")
        t.slider("shut", 0)
        time.sleep(0.35)
        check("короткая выдержка названа рваной",
              "рваное" in t.js("document.getElementById('eb-stat').innerText"), "")

        # 5. смена сцены меняет экспозицию
        t.slider("shut", 4)
        t.scene(0)
        time.sleep(0.4)
        sun = t.js("PobubnimExpo.offset()")
        t.scene(4)
        time.sleep(0.4)
        night = t.js("PobubnimExpo.offset()")
        check("ночью света меньше на 11 стопов", abs((sun - night) - 11) < 0.02, f"{sun - night:.2f}")

        # 6. кадр рисуется и темнеет вместе с экспозицией
        bright = t.js("(()=>{const c=document.getElementById('eb-frame');"
                      "const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
                      "let s=0;for(let i=0;i<d.length;i+=4)s+=d[i];return Math.round(s/(d.length/4));})()")
        t.scene(0)
        time.sleep(0.5)
        bright_sun = t.js("(()=>{const c=document.getElementById('eb-frame');"
                          "const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
                          "let s=0;for(let i=0;i<d.length;i+=4)s+=d[i];return Math.round(s/(d.length/4));})()")
        check("на солнце тот же набор настроек даёт кадр ярче", bright_sun > bright,
              f"{bright_sun} против {bright}")

        # 7. мобила
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
