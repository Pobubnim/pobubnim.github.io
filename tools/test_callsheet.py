# -*- coding: utf-8 -*-
"""Приёмка вызывного листа (instrumenty/vyzyvnoj-list.html) на живой странице.

Проверяет то, чем инструмент отличается от бумажного шаблона: подстановку
координат по городу, расчёт света (сверяется с astral), предупреждения про
закат и золотой час, строки локаций и группы с перестановкой, сборку .docx,
черновик и мобильную раскладку без веб-шрифтов.

Запуск:  python tools/test_callsheet.py [url]
"""
import datetime
import json
import subprocess
import sys
import time
import urllib.request
import zoneinfo

import websocket

try:
    from astral import LocationInfo
    from astral.sun import sun as astral_sun
except ImportError:
    astral_sun = None

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9391
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/vyzyvnoj-list.html"

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
        # худший случай раскладки: системный шрифт вместо Inter
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
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (el_id, json.dumps(value)))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimCallsheet") == "object":
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

        # 1. город подставляет координаты и пояс
        t.set("f-city", "Наро-Фоминск")
        time.sleep(0.4)
        lat = t.js("document.getElementById('f-lat').value")
        tz = t.js("document.getElementById('f-tz').value")
        check("город подставил координаты", lat.startswith("55.38") and tz == "3", f"{lat} / {tz}")

        # 2. свет считается и совпадает с эталоном astral
        t.set("f-date", "2026-09-14")
        time.sleep(0.5)
        paper = t.js("document.getElementById('paper').innerText")
        got = json.loads(t.js("JSON.stringify((function(){var s=PobubnimCallsheet.sun();"
                              "return [PobubnimSun.hhmm(s.sunrise),PobubnimSun.hhmm(s.sunset)];})())"))
        check("в листе появился блок света", "Восход и закат" in (paper or ""), (paper or "")[:60])
        check("золотой час в листе", "Золотой час" in (paper or ""), "")
        if astral_sun:
            ref = astral_sun(LocationInfo("НФ", "RU", "Europe/Moscow", 55.3853, 36.7325).observer,
                             date=datetime.date(2026, 9, 14),
                             tzinfo=zoneinfo.ZoneInfo("Europe/Moscow"))
            rise, sset = ref["sunrise"].strftime("%H:%M"), ref["sunset"].strftime("%H:%M")
            def diff(a, b):
                ah, am = (int(x) for x in a.split(":"))
                bh, bm = (int(x) for x in b.split(":"))
                return abs((ah * 60 + am) - (bh * 60 + bm))
            check("восход совпал с эталоном", diff(got[0], rise) <= 2, f"{got[0]} против {rise}")
            check("закат совпал с эталоном", diff(got[1], sset) <= 2, f"{got[1]} против {sset}")
        check("закат попал в лист текстом", (got[1] or "") in (paper or ""), got[1])

        # 3. полоса светового дня рисует сегменты
        segs = t.js("document.querySelectorAll('#sunbar .track i').length")
        check("полоса дня нарисована", segs >= 3, segs)

        # 4. расписание и предупреждения по свету
        for fid, v in (("f-call", "07:00"), ("f-go", "07:30"), ("f-start", "09:00"),
                       ("f-lunch", "13:00"), ("f-end", "22:00")):
            t.set(fid, v)
        time.sleep(0.6)
        paper = t.js("document.getElementById('paper').innerText")
        check("расписание в листе", "Сбор группы" in (paper or "") and "07:00" in (paper or ""), "")
        check("предупреждение про закат", "после заката" in (paper or ""), "")
        check("подсказка про золотой час в смене", "золотой час" in (paper or "").lower(), "")
        shift = t.js("document.querySelectorAll('#sunbar .track .shift').length")
        check("смена показана на полосе", shift == 1, shift)

        # 5. локации: добавление, перестановка, удаление
        t.js("(()=>{const r=document.querySelectorAll('#locs .row-i')[0];"
             "r.querySelector('.l-name').value='Усадьба';"
             "r.querySelector('.l-name').dispatchEvent(new Event('input',{bubbles:true}));})()")
        t.js("document.getElementById('add-loc').click()")
        time.sleep(0.4)
        t.js("(()=>{const r=document.querySelectorAll('#locs .row-i')[1];"
             "r.querySelector('.l-name').value='Студия';"
             "r.querySelector('.l-name').dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        check("две локации в листе",
              "Усадьба" in t.js("document.getElementById('paper').innerText") and
              "Студия" in t.js("document.getElementById('paper').innerText"), "")
        t.js("document.querySelectorAll('#locs .row-i')[0].querySelector('.down').click()")
        time.sleep(0.5)
        first = t.js("document.querySelectorAll('#locs .row-i')[0].querySelector('.l-name').value")
        check("локации переставляются", first == "Студия", first)
        t.js("document.querySelectorAll('#locs .row-i')[1].querySelector('.del-row').click()")
        time.sleep(0.5)
        n_loc = t.js("document.querySelectorAll('#locs .row-i').length")
        check("локация удаляется", n_loc == 1, n_loc)

        # 6. группа: чип роли добавляет человека
        t.js("document.querySelectorAll('#chips .chip')[4].click()")
        time.sleep(0.5)
        roles = t.js("[...document.querySelectorAll('#crew .c-role')].map(e=>e.value).join('|')")
        check("роль добавлена чипом", "Звукорежиссёр" in (roles or ""), roles)
        t.js("(()=>{const r=document.querySelectorAll('#crew .row-i')[0];"
             "r.querySelector('.c-who').value='Савелий';"
             "r.querySelector('.c-who').dispatchEvent(new Event('input',{bubbles:true}));"
             "r.querySelector('.c-phone').value='+7 982 905-44-54';"
             "r.querySelector('.c-phone').dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.5)
        paper = t.js("document.getElementById('paper').innerText")
        check("человек попал в лист", "Савелий" in paper and "905-44-54" in paper, "")

        # 7. заметки и .docx
        t.set("f-notes", "Парковка во дворе, шлагбаум — звонить администратору.")
        time.sleep(0.5)
        paper = t.js("document.getElementById('paper').innerText")
        check("заметки в листе", "шлагбаум" in paper, "")
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 8. черновик переживает перезагрузку и чистится кнопкой
        time.sleep(0.9)
        t.goto(URL)
        check("черновик восстановил дату", t.js("document.getElementById('f-date').value") == "2026-09-14",
              t.js("document.getElementById('f-date').value"))
        check("черновик восстановил группу",
              "Савелий" in (t.js("document.getElementById('paper').innerText") or ""), "")
        t.js("document.getElementById('btn-clear').click()")
        time.sleep(0.6)
        check("очистка стёрла черновик", t.js("localStorage.getItem('pobubnim-callsheet-v1')") in (None, ""),
              t.js("localStorage.getItem('pobubnim-callsheet-v1')"))

        # 9. мобила
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        t.set("f-date", "2026-09-14")
        t.js("document.querySelectorAll('#chips .chip')[1].click()")
        time.sleep(0.8)
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
