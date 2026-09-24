# -*- coding: utf-8 -*-
"""Приёмка доски «баланс белого и смешанный свет» (uroki/balans-belogo.html).

Доска обязана считать цвет, а не подбирать его на глаз. Здесь планковский локус
пересчитывается НЕЗАВИСИМО — интегралом закона Планка с функциями сложения цвета
CIE 1931 (приближение Wyman, Sloan, Shirley 2013) — и сверяется с тем, что
считает страница. Отдельный якорь: стандартный источник A (2856 K), у которого
координаты заданы CIE.

Формулы и сверка — EDU_BASE §8о.3.
Запуск:  python tools/test_wbboard.py [url]
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
PORT = 9505
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/balans-belogo.html"

KELV = [2500, 2800, 3000, 3200, 3600, 4000, 4500, 5000, 5600, 6500, 7500, 9000]
CIE_A = (0.44757, 0.40745)          # стандартный источник A, 2856 K

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def _g(x, mu, s1, s2):
    s = s1 if x < mu else s2
    return math.exp(-((x - mu) ** 2) / (2 * s * s))


def cmf(lam):
    """CIE 1931 в приближении Wyman, Sloan, Shirley (2013)."""
    return (1.056 * _g(lam, 599.8, 37.9, 31.0) + 0.362 * _g(lam, 442.0, 16.0, 26.7)
            - 0.065 * _g(lam, 501.1, 20.4, 26.2),
            0.821 * _g(lam, 568.8, 46.9, 40.5) + 0.286 * _g(lam, 530.9, 16.3, 31.1),
            1.217 * _g(lam, 437.0, 11.8, 36.0) + 0.681 * _g(lam, 459.0, 26.0, 13.8))


def planck(lam_nm, T):
    h, c, k = 6.62607015e-34, 2.99792458e8, 1.380649e-23
    lam = lam_nm * 1e-9
    return (2 * h * c ** 2) / lam ** 5 / (math.exp(h * c / (lam * k * T)) - 1)


def xy_ref(T):
    X = Y = Z = 0.0
    lam = 360.0
    while lam <= 830.0:
        xb, yb, zb = cmf(lam)
        s = planck(lam, T)
        X += s * xb
        Y += s * yb
        Z += s * zb
        lam += 1.0
    n = X + Y + Z
    return X / n, Y / n


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

    def pick(self, attr, i):
        self.js("document.querySelector('[data-%s=\"%d\"]').click()" % (attr, i))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimWb") == "object":
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

        # 1. локус сходится с интегралом Планка
        for T in (1900, 2856, 3000, 4000, 5600, 6500, 9000):
            got = t.js("PobubnimWb.locus(%d)" % T)
            ref = xy_ref(T)
            d = max(abs(got[0] - ref[0]), abs(got[1] - ref[1]))
            check(f"локус {T} K сходится с интегралом Планка", d < 0.0035,
                  f"{got[0]:.4f}/{got[1]:.4f} против {ref[0]:.4f}/{ref[1]:.4f}")

        # 2. якорь CIE: стандартный источник A
        a = t.js("PobubnimWb.locus(2856)")
        check("источник A: x = 0,44757", abs(a[0] - CIE_A[0]) < 0.001, a[0])
        check("источник A: y = 0,40745", abs(a[1] - CIE_A[1]) < 0.001, a[1])

        # 3. локус монотонен: с ростом температуры x падает (уходит в синее)
        xs = [t.js("PobubnimWb.locus(%d)" % T)[0] for T in KELV]
        check("с ростом кельвинов источник холоднее", all(a > b for a, b in zip(xs, xs[1:])), xs)

        # 4. источник, совпавший с балансом, выходит нейтральным
        t.slider("wb", 8)                     # 5600 K
        time.sleep(0.35)
        n = t.js("PobubnimWb.cast(5600,0)")
        check("на своём балансе источник нейтрален",
              max(abs(v - 1) for v in n) < 0.002, n)

        # 5. тёплый источник на холодном балансе краснит, холодный — синит
        warm = t.js("PobubnimWb.cast(3000,0)")
        cold = t.js("PobubnimWb.cast(9000,0)")
        check("лампа 3000 на балансе 5600 уходит в тёплое", warm[0] > 1.25 and warm[2] < 0.75, warm)
        check("свет 9000 на балансе 5600 уходит в синее", cold[2] > 1.15 and cold[0] < 0.9, cold)

        # 6. зелёный выброс люминесцентной лампы идёт по зелёному каналу
        plain = t.js("PobubnimWb.cast(4000,0)")
        green = t.js("PobubnimWb.cast(4000,0.18)")
        check("зелень поднимает зелёный канал", green[1] / plain[1] > 1.05,
              f"{green[1]:.3f} против {plain[1]:.3f}")

        # 7. главный вывод урока: смешанный свет не сводится ни одним балансом
        t.pick("left", 0)                     # окно 5600
        t.pick("right", 0)                    # лампа 3000
        worst = 1e9
        for i in range(12):
            t.slider("wb", i)
            time.sleep(0.15)
            cl = t.js("PobubnimWb.cast(PobubnimWb.tl(),0)")
            cr = t.js("PobubnimWb.cast(PobubnimWb.tr(),0)")
            worst = min(worst, max(max(abs(v - 1) for v in cl), max(abs(v - 1) for v in cr)))
        check("нет баланса, при котором обе половины нейтральны", worst > 0.1,
              f"лучший случай — отклонение {worst:.3f}")

        # 8. один источник сводится полностью
        t.pick("right", 3)                    # выключен
        t.slider("wb", 8)
        time.sleep(0.35)
        stat = t.js("document.getElementById('wb-stat').innerText") or ""
        check("с одним источником сказано «сводится»", "сводится" in stat, stat)
        check("разбег показан как «один источник»", "один источник" in stat, stat)
        t.pick("right", 0)
        time.sleep(0.35)
        stat = t.js("document.getElementById('wb-stat').innerText") or ""
        check("разбег окна и лампы — 2600 K", "2600 K" in stat, stat)
        check("вердикт «одним балансом не свести»", "не свести" in stat, stat)
        check("тревожные плашки зажглись",
              t.js("document.querySelectorAll('#wb-stat .warn').length") >= 2)

        # 9. кадр нарисован и лицо действительно двухцветное
        halves = t.js("(()=>{const c=document.getElementById('wb-frame');"
                      "const g=c.getContext('2d');"
                      "const l=g.getImageData(360,190,1,1).data,r=g.getImageData(520,190,1,1).data;"
                      "return [l[0]-l[2], r[0]-r[2]];})()")
        check("левая половина холоднее правой", halves[1] - halves[0] > 20, halves)

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
