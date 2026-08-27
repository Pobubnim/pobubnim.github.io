# -*- coding: utf-8 -*-
"""Приёмка ND-калькулятора (instrumenty/kalkulyator-nd-filtra.html).

Числа проверяются против независимого расчёта на питоне (та же
экспонометрия, но написанная отдельно): EV = log2(N²/t), поправка на ISO,
стопы ND как разница. Плюс интерфейс: режимы, подбор фильтров, тексты,
мобильная раскладка.

Запуск:  python tools/test_nd.py [url]
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
PORT = 9441
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/kalkulyator-nd-filtra.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def nd_stops_ref(ev_scene, iso, aperture, shutter):
    """Независимый расчёт: сколько стопов лишнего света."""
    ev_iso = ev_scene + math.log2(iso / 100)
    ev_set = math.log2(aperture ** 2 / shutter)
    return ev_iso - ev_set


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
                "e.dispatchEvent(new Event('change',{bubbles:true}));})()"
                % (el_id, json.dumps(str(value))))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimNdCalc") == "object":
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

        # 1. видео: стопы сходятся с независимым расчётом
        cases = [(25, 180, 2.8, 800, 15), (25, 180, 4.0, 100, 13),
                 (50, 180, 1.8, 400, 14), (24, 90, 5.6, 200, 16)]
        for fps, angle, ap, iso, ev in cases:
            t.set("f-fps", fps)
            t.set("f-angle", angle)
            t.set("f-ap", ap)
            t.set("f-iso", iso)
            t.set("f-scene", ev)
            time.sleep(0.35)
            v = json.loads(t.js("JSON.stringify(PobubnimNdCalc.video())"))
            shutter = angle / (360 * fps)
            ref = nd_stops_ref(ev, iso, ap, shutter)
            ok = abs(v["stops"] - ref) < 0.02 and abs(v["t"] - shutter) < 1e-9
            check(f"видео {fps} к/с {angle}° f/{ap} ISO{iso} EV{ev}: "
                  f"{v['stops']:.2f} ст.", ok, f"наш {v['stops']} против {ref}")

        # 2. подбор фильтров: ближайший не дальше половины стопа от соседей
        t.set("f-fps", 25); t.set("f-angle", 180); t.set("f-ap", 2.8)
        t.set("f-iso", 800); t.set("f-scene", 15)
        time.sleep(0.4)
        v = json.loads(t.js("JSON.stringify(PobubnimNdCalc.video())"))
        picks = v["picks"]
        best = min(abs(p["stops"] - v["stops"]) for p in picks)
        check("подобран ближайший фильтр", len(picks) == 3 and best <= 0.55,
              [p["name"] for p in picks])
        paper = t.js("document.getElementById('paper').innerText")
        check("фильтр назван в листе", picks[0]["name"] in paper, paper[:80])
        check("в листе есть выдержка по шаттеру", "1/50" in paper, "")

        # 3. мало света — фильтр не нужен, и это сказано словами
        t.set("f-scene", 6)
        t.set("f-iso", 100)
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        check("при нехватке света фильтр не предлагается",
              "Фильтр не нужен" in paper and "света не хватает" in paper, paper[:90])

        # 4. фото: выдержка умножается на кратность
        t.js("document.querySelector('input[name=mode][value=photo]').click()")
        time.sleep(0.4)
        check("переключился режим фото",
              t.js("document.getElementById('sec-photo').hidden") is False, "")
        t.set("f-shut", 1 / 250)
        t.set("f-filter", 10)
        time.sleep(0.4)
        p = json.loads(t.js("JSON.stringify(PobubnimNdCalc.photo())"))
        check("ND1000 из 1/250 делает 4 секунды", abs(p["t1"] - 1024 / 250) < 1e-6, p)
        paper = t.js("document.getElementById('paper').innerText")
        check("в листе человеческая выдержка", "4,1 с" in paper or "4 с" in paper, paper[:60])

        # 5. свои стопы
        t.set("f-filter", "custom")
        time.sleep(0.3)
        check("поле своих стопов показалось",
              t.js("document.getElementById('fld-custom').hidden") is False, "")
        t.set("f-stops", 6)
        t.set("f-shut", 1 / 60)
        time.sleep(0.4)
        p = json.loads(t.js("JSON.stringify(PobubnimNdCalc.photo())"))
        check("шесть стопов из 1/60 дают ~1 секунду", abs(p["t1"] - 64 / 60) < 1e-6, p)

        # 6. длинная выдержка предупреждает про штатив и BULB
        t.set("f-stops", 15)
        t.set("f-shut", 1)
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        check("предупреждение про BULB", "BULB" in paper, paper[:80])

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
