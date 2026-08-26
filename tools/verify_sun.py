# -*- coding: utf-8 -*-
"""Сверка солнечного движка сайта (assets/js/sun.js) с независимым эталоном.

Зачем: вызывной лист печатает восход, закат и золотой час — если формула
врёт, группа приедет не в то время. Здесь JS-реализация гоняется в живом
браузере и сравнивается с библиотекой astral (pip install astral), которая
считает по тем же NOAA-формулам, но написана другими людьми.

Запуск:  python tools/verify_sun.py [url страницы, где подключён sun.js]
Порог расхождения — 2 минуты (точность самого алгоритма ~1 мин).
Код 1 — расхождение больше порога.
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
    print("нужен astral: pip install astral")
    sys.exit(2)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9381
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/vyzyvnoj-list.html"
TOL_MIN = 2

# город: широта, долгота, часовой пояс сайта, зона astral
CITIES = [
    ("Москва", 55.7558, 37.6173, 3, "Europe/Moscow"),
    ("Наро-Фоминск", 55.3853, 36.7325, 3, "Europe/Moscow"),
    ("Санкт-Петербург", 59.9311, 30.3609, 3, "Europe/Moscow"),
    ("Калининград", 54.7104, 20.4522, 2, "Europe/Kaliningrad"),
    ("Екатеринбург", 56.8389, 60.6057, 5, "Asia/Yekaterinburg"),
    ("Владивосток", 43.1155, 131.8855, 10, "Asia/Vladivostok"),
    ("Сочи", 43.5855, 39.7231, 3, "Europe/Moscow"),
]
DATES = [(2026, 1, 15), (2026, 3, 21), (2026, 6, 21), (2026, 9, 14),
         (2026, 11, 5), (2026, 12, 21)]


def start_chrome():
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
         "--remote-allow-origins=*", "--window-size=1200,800", "about:blank"],
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
    return proc, websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)


def main():
    proc, ws = start_chrome()
    mid = [0]

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == mid[0]:
                return msg

    def js(expr):
        r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        return r.get("result", {}).get("result", {}).get("value")

    bad = []
    try:
        cmd("Page.navigate", url=URL)
        for _ in range(20):                       # ждём defer-скрипты страницы
            time.sleep(0.5)
            if js("typeof window.PobubnimSun") == "object":
                break
        else:
            print("на странице нет PobubnimSun — sun.js не подключён")
            return 1
        for name, lat, lng, tz, zone in CITIES:
            for (y, m, d) in DATES:
                got = json.loads(js(
                    "JSON.stringify((function(){var t=PobubnimSun.times(%d,%d,%d,%f,%f,%d);"
                    "return {sunrise:PobubnimSun.hhmm(t.sunrise),sunset:PobubnimSun.hhmm(t.sunset),"
                    "noon:PobubnimSun.hhmm(t.noon)};})())" % (y, m, d, lat, lng, tz)))
                city = LocationInfo(name, "RU", zone, lat, lng)
                ref = astral_sun(city.observer, date=datetime.date(y, m, d),
                                 tzinfo=zoneinfo.ZoneInfo(zone))
                for key, refkey in (("sunrise", "sunrise"), ("sunset", "sunset"), ("noon", "noon")):
                    ours = got[key]
                    theirs = ref[refkey].strftime("%H:%M")
                    if ours is None:
                        bad.append(f"{name} {y}-{m:02d}-{d:02d} {key}: у нас пусто, эталон {theirs}")
                        continue
                    dh, dm = (int(x) for x in ours.split(":"))
                    rh, rm = (int(x) for x in theirs.split(":"))
                    diff = abs((dh * 60 + dm) - (rh * 60 + rm))
                    if diff > TOL_MIN:
                        bad.append(f"{name} {y}-{m:02d}-{d:02d} {key}: наш {ours}, "
                                   f"эталон {theirs} (расхождение {diff} мин)")
                print(f"{name} {y}-{m:02d}-{d:02d}: восход {got['sunrise']} "
                      f"(эталон {ref['sunrise'].strftime('%H:%M')}), закат {got['sunset']} "
                      f"(эталон {ref['sunset'].strftime('%H:%M')})")
        # полярная ночь и день в Мурманске — движок обязан честно вернуть «нет»
        for (y, m, d), what in (((2026, 12, 21), "полярная ночь"), ((2026, 6, 21), "полярный день")):
            got = js("JSON.stringify((function(){var t=PobubnimSun.times(%d,%d,%d,68.9585,33.0827,3);"
                     "return [t.sunrise,t.sunset];})())" % (y, m, d))
            print(f"Мурманск {y}-{m:02d}-{d:02d} ({what}): {got}")
            if json.loads(got) != [None, None]:
                bad.append(f"Мурманск {y}-{m:02d}-{d:02d}: ждали отсутствие восхода/заката, вышло {got}")
    finally:
        ws.close()
        proc.kill()

    print()
    if bad:
        print("РАСХОЖДЕНИЯ:")
        for b in bad:
            print("  X", b)
        return 1
    print(f"Солнце сошлось с эталоном на {len(CITIES) * len(DATES)} проверках "
          f"(допуск {TOL_MIN} мин)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
