# -*- coding: utf-8 -*-
"""Приёмка калькулятора ставки (instrumenty/stavka-frilansera.html).

Главная проверка — обратный счёт: берём посчитанную ставку, умножаем на
число смен, вычитаем налог, расходы, амортизацию и резерв. Должен остаться
ровно желаемый доход. Плюс интерфейс: налоговые режимы, полоса состава,
проверка своей цены, мобильная раскладка.

Запуск:  python tools/test_rate.py [url]
"""
import json
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9471
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/stavka-frilansera.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
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
                "e.dispatchEvent(new Event('change',{bubbles:true}));})()"
                % (el_id, json.dumps(str(value))))

    def calc(self):
        return json.loads(self.js("JSON.stringify(PobubnimRate.calc())"))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimRate") == "object":
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

        # 1. обратный счёт на нескольких наборах вводных
        cases = [
            # доход, смен, расходы, техника, лет, резерв %, налог
            (120000, 6, 15000, 900000, 5, 10, "npd6"),
            (80000, 4, 8000, 400000, 4, 0, "npd4"),
            (250000, 10, 40000, 2000000, 6, 20, "usn6"),
            (60000, 3, 5000, 0, 5, 5, "none"),
        ]
        for want, shifts, costs, gear, years, reserve, tax in cases:
            t.set("f-want", want)
            t.set("f-shifts", shifts)
            t.set("f-costs", costs)
            t.set("f-gear", gear)
            t.set("f-years", years)
            t.set("f-reserve", reserve)
            t.js("document.querySelector('input[name=tax][value=%s]').click()" % tax)
            time.sleep(0.4)
            c = t.calc()
            b = json.loads(t.js("JSON.stringify(PobubnimRate.backward(%f))" % c["perShift"]))
            ok = abs(b["net"] - want) < 1.0 and abs(b["diff"]) < 1.0
            check(f"обратный счёт сходится: {want:,} ₽ / {shifts} смен / {tax}".replace(",", " "),
                  ok, f"на руки {b['net']:.0f} против {want}")

        # 2. составные части считаются как ожидается
        t.set("f-want", 120000); t.set("f-shifts", 6); t.set("f-costs", 15000)
        t.set("f-gear", 900000); t.set("f-years", 5); t.set("f-reserve", 10)
        t.js("document.querySelector('input[name=tax][value=npd6]').click()")
        time.sleep(0.4)
        c = t.calc()
        check("амортизация = стоимость / (лет × 12)", abs(c["amort"] - 900000 / 60) < 0.01, c["amort"])
        check("резерв = процент от дохода", abs(c["reserveSum"] - 12000) < 0.01, c["reserveSum"])
        check("выручка покрывает налог", abs(c["gross"] * 0.94 - c["needNet"]) < 0.01, c)
        check("часовая ставка = сменная / часы",
              abs(c["perHour"] - c["perShift"] / c["hours"]) < 0.01, c["perHour"])

        # 3. поведение по физике денег
        base = t.calc()["perShift"]
        t.set("f-shifts", 12)
        time.sleep(0.35)
        check("больше смен — ниже ставка", t.calc()["perShift"] < base, t.calc()["perShift"])
        t.set("f-shifts", 6)
        t.set("f-gear", 2000000)
        time.sleep(0.35)
        check("дороже техника — выше ставка", t.calc()["perShift"] > base, t.calc()["perShift"])
        t.set("f-gear", 900000)
        t.js("document.querySelector('input[name=tax][value=none]').click()")
        time.sleep(0.35)
        check("без налога ставка ниже", t.calc()["perShift"] < base, t.calc()["perShift"])
        t.js("document.querySelector('input[name=tax][value=npd6]').click()")
        time.sleep(0.35)

        # 4. проверка своей цены
        low = round(base * 0.6)
        t.set("f-real", low)
        time.sleep(0.5)
        paper = t.js("document.getElementById('paper').innerText")
        check("низкая ставка помечена как недобор", "меньше цели" in paper, paper[-160:])
        check("предложено решение", "поднять ставку до" in paper, "")
        t.set("f-real", round(base * 1.4))
        time.sleep(0.5)
        paper = t.js("document.getElementById('paper').innerText")
        check("высокая ставка помечена как запас", "запас есть" in paper, paper[-120:])

        # 5. полоса состава
        parts = t.js("document.querySelectorAll('#split .track i').length")
        legend = t.js("document.querySelector('#split .legend').innerText")
        check("полоса состава нарисована", parts >= 4, parts)
        check("в легенде есть доход и налог",
              "Доход" in (legend or "") and "Налог" in (legend or ""), legend)

        # 6. мобила
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
