# -*- coding: utf-8 -*-
"""Приёмка доски «мерцание» (uroki/mercanie-na-video.html).

Доска обязана считать, а не рисовать полосы для красоты. Экспозиция строки на
странице берётся замкнутой формой интеграла sin²; здесь она пересчитывается
ЧИСЛЕННО (прямоугольниками), и обе величины обязаны сойтись. Дальше проверяется
главное правило: выдержка, кратная периоду пульсации, даёт ровно ноль полос.

Формулы и сверка — EDU_BASE §8о.4.
Запуск:  python tools/test_flickerboard.py [url]
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
PORT = 9501
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/mercanie-na-video.html"

SHUT = [1 / 25, 1 / 30, 1 / 50, 1 / 60, 1 / 100, 1 / 120, 1 / 200, 1 / 500, 1 / 1000]
READ = [1 / 120, 1 / 60, 1 / 30, 1 / 15]
DEPTH = [1, 0.8, 0.3, 0]

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def exposure_num(t0, T, mains, m, steps=4000):
    """Тот же интеграл, но численно — независимая проверка замкнутой формы."""
    s = 0.0
    for i in range(steps):
        t = t0 + T * (i + 0.5) / steps
        s += (1 - m) + m * math.sin(2 * math.pi * mains * t) ** 2
    return s / steps * T


def band_ref(shut, mains, m, readout, rows=240):
    v = [exposure_num(r * readout / rows, shut, mains, m, 400) for r in range(rows)]
    mean = sum(v) / len(v)
    return (max(v) - min(v)) / mean if mean else 0


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

    def pick(self, attr, value):
        self.js("document.querySelector('[data-%s=\"%s\"]').click()" % (attr, value))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimFlicker") == "object":
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

        # 1. замкнутая форма интеграла сходится с численным интегрированием
        for shut, t0 in ((3, 0.0), (2, 0.003), (6, 0.0071), (7, 0.0125)):
            t.slider("shut", shut)
            time.sleep(0.3)
            got = t.js("PobubnimFlicker.exposure(%r)" % t0)
            ref = exposure_num(t0, SHUT[shut], 50, 1.0)
            check(f"интеграл экспозиции: выдержка 1/{round(1/SHUT[shut])}, t0={t0}",
                  abs(got - ref) < ref * 1e-4, f"{got:.8f} против {ref:.8f}")

        # 2. главное правило: кратная выдержка — ровно ноль полос
        t.pick("mains", 50)
        t.pick("lamp", 0)
        for i, name in ((0, "1/25"), (2, "1/50"), (4, "1/100")):
            t.slider("shut", i)
            time.sleep(0.3)
            check(f"на сети 50 Гц выдержка {name} не даёт полос",
                  t.js("PobubnimFlicker.banding()") < 1e-6, t.js("PobubnimFlicker.banding()"))

        # 3. некратные выдержки дают посчитанный заранее размах
        for i, ref in ((3, 0.326), (5, 0.377), (6, 1.219), (7, 1.862)):
            t.slider("shut", i)
            time.sleep(0.3)
            got = t.js("PobubnimFlicker.banding()")
            check(f"размах на 1/{round(1/SHUT[i])} = {ref*100:.0f} %", abs(got - ref) < 0.01,
                  f"{got:.3f} против {ref:.3f}")

        # 4. на сети 60 Гц безопасные выдержки меняются местами
        t.pick("mains", 60)
        for i, name in ((3, "1/60"), (5, "1/120")):
            t.slider("shut", i)
            time.sleep(0.3)
            check(f"на сети 60 Гц выдержка {name} чистая",
                  t.js("PobubnimFlicker.banding()") < 1e-6, t.js("PobubnimFlicker.banding()"))
        t.slider("shut", 2)
        time.sleep(0.3)
        check("на сети 60 Гц выдержка 1/50 даёт полосы 25 %",
              abs(t.js("PobubnimFlicker.banding()") - 0.252) < 0.01,
              t.js("PobubnimFlicker.banding()"))

        # 5. источник без пульсации не мерцает ни при какой выдержке
        t.pick("mains", 50)
        t.pick("lamp", 3)
        worst = 0
        for i in range(9):
            t.slider("shut", i)
            time.sleep(0.2)
            worst = max(worst, t.js("PobubnimFlicker.banding()"))
        check("окно не мерцает ни на одной выдержке", worst < 1e-9, worst)

        # 6. лампа накаливания мерцает слабее светодиода на той же выдержке
        t.slider("shut", 3)
        t.pick("lamp", 0)
        time.sleep(0.3)
        led = t.js("PobubnimFlicker.banding()")
        t.pick("lamp", 2)
        time.sleep(0.3)
        bulb = t.js("PobubnimFlicker.banding()")
        check("накаливания мерцает слабее светодиода", bulb < led / 4, f"{bulb:.3f} против {led:.3f}")
        check("у накаливания размах около 6 %", abs(bulb - 0.058) < 0.005, f"{bulb:.3f}")

        # 7. считывание меняет ЧИСЛО полос, а не их глубину
        t.pick("lamp", 0)

        def bands_count():
            return t.js("(()=>{const F=window.PobubnimFlicker;const H=420;let k=[];"
                        "for(let r=0;r<H;r++)k.push(F.exposure(r*F.readout()/H));"
                        "let n=0;for(let r=1;r<H-1;r++)"
                        "if(k[r]>k[r-1]&&k[r]>=k[r+1])n++;return n;})()")
        t.slider("read", 0)
        time.sleep(0.35)
        fast = bands_count()
        amp_fast = t.js("PobubnimFlicker.banding()")
        t.slider("read", 3)
        time.sleep(0.35)
        slow = bands_count()
        amp_slow = t.js("PobubnimFlicker.banding()")
        check("медленное считывание — полос больше", slow > fast, f"{slow} против {fast}")
        check("глубина полос от считывания почти не зависит",
              abs(amp_slow - amp_fast) < 0.02, f"{amp_slow:.3f} против {amp_fast:.3f}")

        # 8. кадр действительно полосатый: колонка пикселей гуляет по яркости
        t.slider("read", 2)
        t.slider("shut", 3)
        time.sleep(0.4)

        def column_spread():
            return t.js("(()=>{const c=document.getElementById('fb-frame');"
                        "const d=c.getContext('2d').getImageData(150,170,1,140).data;"
                        "let lo=255,hi=0;for(let i=0;i<d.length;i+=4){"
                        "if(d[i]<lo)lo=d[i];if(d[i]>hi)hi=d[i];}return hi-lo;})()")
        dirty = column_spread()
        t.slider("shut", 2)                 # 1/50 — кратная
        time.sleep(0.4)
        clean = column_spread()
        check("на 1/60 белая карта полосатая", dirty > 40, dirty)
        check("на 1/50 белая карта ровная", clean < 6, clean)

        # 9. подписи говорят по-человечески
        t.slider("shut", 3)
        time.sleep(0.4)
        stat = t.js("document.getElementById('fb-stat').innerText") or ""
        for probe in ("РАЗМАХ ПОЛОС", "ПУЛЬСАЦИЯ", "ПЕРИОДОВ В ВЫДЕРЖКЕ", "СЧИТЫВАНИЕ КАДРА"):
            check("в подписи есть " + probe.lower(), probe in stat, stat)
        check("некратная выдержка названа «не целое»", "не целое" in stat, stat)
        t.slider("shut", 2)
        time.sleep(0.4)
        stat = t.js("document.getElementById('fb-stat').innerText") or ""
        check("кратная выдержка названа «целое»", "— целое" in stat, stat)
        check("на кратной выдержке вердикт «полос нет»", "полос нет" in stat, stat)

        # 10. страница собрана по закону
        check("ровно один h1", t.js("document.querySelectorAll('h1').length") == 1)
        check("пробел после запросного span в h1",
              t.js("document.querySelector('h1 .label').nextSibling.textContent.startsWith(' ')"))
        check("шесть вопросов в FAQ",
              t.js("document.querySelectorAll('details.svc-faq').length") == 6)
        check("оговорка про модель в подписи под доской",
              "одель" in (t.js("document.querySelector('.viz-cap').innerText") or ""))

        # 11. мобильная ширина
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
