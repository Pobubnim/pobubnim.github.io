# -*- coding: utf-8 -*-
"""Приёмка доски «мягкий свет» (uroki/myagkij-svet.html).

Доска обязана считать. Ширина полутени, угловой размер источника и провал фона
пересчитываются здесь независимо по формулам EDU_BASE §8о.2 и сверяются со
значениями страницы. Отдельно проверяется, что край тени на полосе «крупно»
действительно размывается у большого источника и остаётся резким у солнца.

Запуск:  python tools/test_softboard.py [url]
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
PORT = 9503
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/myagkij-svet.html"

SRC = [0.1, 0.6, 1.2, 1.5, None]
DIST = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4]
BG = [0.3, 0.5, 0.75, 1, 1.5, 2, 2.5, 3]
SUN = 1.392e9 / 1.496e11

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def ratio_ref(src, dist):
    return SUN if SRC[src] is None else SRC[src] / DIST[dist]


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
        return {"-0": -0.0, "NaN": float("nan"),
                "Infinity": float("inf"), "-Infinity": float("-inf")
                }.get(obj.get("unserializableValue"))

    def slider(self, attr, value):
        self.js("(()=>{const e=document.querySelector('[data-%s]');e.value=%d;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (attr, value))

    def src(self, i):
        self.js("document.querySelector('[data-src=\"%d\"]').click()" % i)

    def setup(self, src, dist, bg):
        self.src(src)
        self.slider("dist", dist)
        self.slider("bg", bg)
        time.sleep(0.4)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimSoft") == "object":
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

        # 1. ширина полутени = S * L / D
        for src, dist, bg in ((1, 2, 3), (1, 6, 3), (3, 3, 5), (0, 2, 7), (2, 0, 0)):
            t.setup(src, dist, bg)
            got = t.js("PobubnimSoft.penumbra()")
            ref = ratio_ref(src, dist) * BG[bg]
            check(f"полутень: источник {SRC[src]} м, {DIST[dist]} м до героя, "
                  f"{BG[bg]} м до фона", abs(got - ref) < 1e-6,
                  f"{got:.4f} против {ref:.4f}")

        # 2. угловой размер источника
        for src, dist, ref in ((1, 2, 33.40), (1, 6, 11.42), (3, 3, 53.13), (0, 2, 5.72)):
            t.setup(src, dist, 3)
            check(f"угловой размер: {SRC[src]} м с {DIST[dist]} м = {ref}°",
                  abs(t.js("PobubnimSoft.angle()") - ref) < 0.02,
                  t.js("PobubnimSoft.angle()"))

        # 3. солнце: полградуса и никакого падения света
        t.setup(4, 2, 5)
        check("угловой размер солнца 0,53°", abs(t.js("PobubnimSoft.angle()") - 0.5331) < 0.002,
              t.js("PobubnimSoft.angle()"))
        check("у солнца свет на фон не падает", abs(t.js("PobubnimSoft.falloff()")) < 1e-9,
              t.js("PobubnimSoft.falloff()"))
        sun_pen = t.js("PobubnimSoft.penumbra()")
        check("полутень от солнца — миллиметры", abs(sun_pen - SUN * BG[5]) < 1e-9, sun_pen)
        t.slider("dist", 7)
        time.sleep(0.4)
        check("расстояние до солнца ничего не меняет",
              abs(t.js("PobubnimSoft.penumbra()") - sun_pen) < 1e-12, t.js("PobubnimSoft.penumbra()"))
        check("в подписи сказано, что расстояние ничего не меняет",
              "ничего не меняет" in (t.js("document.getElementById('sf-stat').innerText") or ""))

        # 4. падение света на фон = 2*log2((D+L)/D)
        for src, dist, bg in ((1, 2, 5), (1, 7, 5), (2, 0, 3)):
            t.setup(src, dist, bg)
            ref = 2 * math.log2((DIST[dist] + BG[bg]) / DIST[dist])
            check(f"фон темнее на {ref:.2f} ст. при {DIST[dist]} м и {BG[bg]} м",
                  abs(t.js("PobubnimSoft.falloff()") - ref) < 1e-6,
                  t.js("PobubnimSoft.falloff()"))

        # 5. отодвинули прибор вдвое — полутень вдвое уже, света на 2 ступени меньше
        t.setup(1, 2, 3)                  # софтбокс 60, 1 м, фон 1 м
        pen_near = t.js("PobubnimSoft.penumbra()")
        t.setup(1, 4, 3)                  # он же с 2 м
        check("вдвое дальше — полутень вдвое уже",
              abs(t.js("PobubnimSoft.penumbra()") - pen_near / 2) < 1e-6,
              t.js("PobubnimSoft.penumbra()"))

        # 6. вердикт по мягкости
        t.setup(3, 3, 5)                  # окно 1,5 м с 1,5 м
        check("окно вблизи — «очень мягко»",
              "очень мягко" in (t.js("document.getElementById('sf-stat').innerText") or ""))
        t.setup(4, 2, 5)
        check("солнце — «жёстко»",
              "жёстко" in (t.js("document.getElementById('sf-stat').innerText") or ""))

        # 7. полоса «край тени крупно»: у мягкого источника переход растянут,
        #    у солнца — ступенька в один-два пикселя
        def edge_width():
            return t.js("(()=>{const c=document.getElementById('sf-frame');"
                        "const d=c.getContext('2d').getImageData(472,350,408,1).data;"
                        "let lo=255,hi=0;for(let i=0;i<d.length;i+=4){"
                        "if(d[i]<lo)lo=d[i];if(d[i]>hi)hi=d[i];}"
                        "let n=0;for(let i=0;i<d.length;i+=4)"
                        "if(d[i]>lo+(hi-lo)*0.1&&d[i]<lo+(hi-lo)*0.9)n++;return n;})()")
        t.setup(3, 3, 5)
        soft = edge_width()
        check("у мягкого источника переход широкий", soft > 120, soft)
        t.setup(4, 2, 5)
        hard = edge_width()
        check("масштаб полосы подстраивается, переход виден всегда", hard > 120, hard)

        # 8. кадр нарисован
        ink = t.js("(()=>{const c=document.getElementById('sf-frame');"
                   "const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
                   "let s=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0)s++;return s;})()")
        check("доска нарисована", ink > 200000, ink)

        # 9. страница собрана по закону
        check("ровно один h1", t.js("document.querySelectorAll('h1').length") == 1)
        check("пробел после запросного span в h1",
              t.js("document.querySelector('h1 .label').nextSibling.textContent.startsWith(' ')"))
        check("шесть вопросов в FAQ",
              t.js("document.querySelectorAll('details.svc-faq').length") == 6)
        check("оговорка про модель в подписи под доской",
              "одель" in (t.js("document.querySelector('.viz-cap').innerText") or ""))

        # 10. мобильная ширина
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
