# -*- coding: utf-8 -*-
"""Приёмка доски «три ошибки цвета» (uroki/tri-oshibki-cveta.html).

Доска обязана СЧИТАТЬ кадр, а не показывать заготовку. Здесь независимо
пересчитываются на питоне: кривые камеры (§8д.4,6), все три преобразования
ошибок, и вся измерительная арифметика — IRE, угол в осях Cb/Cr и насыщенность
(§8б.4а). Дальше проверяются канонические коридоры на чистом кадре (§8б.2)
и то, что каждая ошибка двигает ровно те показания, ради которых она в уроке.

Запуск:  python tools/test_errboard.py [url]
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
PORT = 9504
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/tri-oshibki-cveta.html"

KR, KG, KB = 0.2126, 0.7152, 0.0722
CANON = 123.0

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def close(a, b, eps):
    return a is not None and b is not None and abs(a - b) <= eps


# ---------- независимый пересчёт ----------
def oetf709(L):
    L = max(L, 0.0)
    return 4.5 * L if L < 0.018 else 1.099 * L ** 0.45 - 0.099


def slog3(x):
    x = max(x, 0.0)
    if x >= 0.01125:
        return (420 + math.log10((x + 0.01) / 0.19) * 261.5) / 1023
    return (x * (171.2102946929 - 95) / 0.01125 + 95) / 1023


def slog3_inv(v):
    c = v * 1023
    if c >= 171.2102946929:
        return 10 ** ((c - 420) / 261.5) * 0.19 - 0.01
    return (c - 95) * 0.01125 / (171.2102946929 - 95)


def cst(c):
    return round(oetf709(slog3_inv(c / 255.0)) * 255)


def cl(v):
    return 0.0 if v < 0 else (1.0 if v > 1 else v)


def luma(v):
    return KR * v[0] + KG * v[1] + KB * v[2]


def creative(rgb, s):
    p, k, sa = 0.435, 1 + 0.6 * s, 1 + 0.32 * s
    v = [cl((c / 255.0 - p) * k + p) for c in rgb]
    y = luma(v)
    v = [cl(y + (x - y) * sa) for x in v]
    v[0] = cl(v[0] + 0.05 * s * (v[0] - 0.5))
    v[2] = cl(v[2] - 0.05 * s * (v[2] - 0.5))
    return [x * 255 for x in v]


def grade_all(rgb, s):
    sl = [1 + 0.20 * s, 1 + 0.10 * s, 1 - 0.18 * s]
    of = [-0.025 * s, 0.04 * s, 0.035 * s]
    v = [cl(rgb[i] / 255.0 * sl[i] + of[i]) for i in range(3)]
    y = luma(v)
    sa = 1 + 0.25 * s
    return [cl(y + (x - y) * sa) * 255 for x in v]


def screen_fix(rgb, t):
    return [rgb[0] / (1 + t), rgb[1], rgb[2] / (1 - t)]


def metrics(rgb):
    """та же арифметика, что у доски: IRE, угол и насыщенность в осях Cb/Cr"""
    v = [c / 255.0 for c in rgb]
    y = luma(v)
    cb = (v[2] - y) * 0.5389
    cr = (v[0] - y) * 0.635
    a = math.degrees(math.atan2(cr, cb))
    return {"ire": y * 100, "angle": a + 360 if a < 0 else a,
            "sat": math.hypot(cb, cr) * 100}


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
        # CDP не умеет сериализовать -0, NaN и бесконечности значением (грабля 21.09)
        return {"-0": -0.0, "NaN": float("nan"),
                "Infinity": float("inf"), "-Infinity": float("-inf")
                }.get(obj.get("unserializableValue"))

    def state(self, err, view, s, screen=0.12):
        self.js("(()=>{const E=PobubnimErr;E.state.err=%d;E.state.view=%d;"
                "E.state.s=%r;E.state.screen=%r;E.draw();})()" % (err, view, s, screen))

    def zone(self, i):
        return self.js("(()=>{const m=PobubnimErr.measure(%d);"
                       "return {rgb:m.rgb,ire:m.ire,angle:m.angle,sat:m.sat};})()" % i)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimErr") == "object":
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

        # 1. кривые камеры на странице — те же, что в каноне §8д
        for L in (0.02, 0.09, 0.18, 0.36, 0.9):
            check("Rec.709 OETF при L=%.2f" % L,
                  close(t.js("PobubnimErr.oetf709(%r)" % L), oetf709(L), 1e-9))
            check("S-Log3 при x=%.2f" % L,
                  close(t.js("PobubnimErr.slog3(%r)" % L), slog3(L), 1e-9))
        for v in (0.2, 0.41, 0.7, 0.95):
            check("S-Log3 обратная при V=%.2f" % v,
                  close(t.js("PobubnimErr.slog3Inv(%r)" % v), slog3_inv(v), 1e-9))

        # 2. ловушка урока: серая карта в 709 и в log стоит почти в одном месте
        # числа страницы — это КОДЫ кадра, то есть после квантования в восемь бит
        c709 = round(oetf709(0.18) * 255)
        clog = round(slog3(0.18) * 255)
        g709, glog = c709 / 255 * 100, clog / 255 * 100
        check("серая карта 18 % в 709 даёт код 104 = 40,8 IRE",
              c709 == 104 and close(g709, 40.8, 0.05), (c709, round(g709, 2)))
        check("серая карта 18 % в S-Log3 даёт код 105 = 41,2 IRE",
              clog == 105 and close(glog, 41.2, 0.05), (clog, round(glog, 2)))
        check("разница — один код: по карте ошибку не поймать",
              abs(c709 - clog) <= 1, abs(c709 - clog))

        # 3. преобразования ошибок совпадают с независимым пересчётом
        probes = [[104, 104, 104], [210, 154, 123], [48, 52, 60], [231, 231, 231], [12, 9, 7]]
        for rgb in probes:
            for s in (0.3, 0.6, 1.0):
                got = t.js("PobubnimErr.creative(%s,%r)" % (json.dumps(rgb), s))
                ref = creative(rgb, s)
                check("творческий LUT %s сила %.1f" % (rgb, s),
                      got and all(close(got[i], ref[i], 1e-6) for i in range(3)), got)
                got = t.js("PobubnimErr.gradeAll(%s,%r)" % (json.dumps(rgb), s))
                ref = grade_all(rgb, s)
                check("общий грейд %s сила %.1f" % (rgb, s),
                      got and all(close(got[i], ref[i], 1e-6) for i in range(3)), got)
            got = t.js("PobubnimErr.screenFix(%s,0.12)" % json.dumps(rgb))
            ref = screen_fix(rgb, 0.12)
            check("поправка по кривому экрану %s" % rgb,
                  got and all(close(got[i], ref[i], 1e-6) for i in range(3)), got)
            got = t.js("PobubnimErr.cst(%d)" % rgb[0])
            check("конверсия log→709 кода %d" % rgb[0], got == cst(rgb[0]), got)

        # 4. измерительная арифметика доски проверяется по её же RGB
        t.state(0, 0, 0.6)
        for i, name in ((0, "кожа"), (1, "серая карта"), (2, "белая бумага")):
            z = t.zone(i)
            ref = metrics(z["rgb"])
            check("IRE зоны «%s» посчитан верно" % name, close(z["ire"], ref["ire"], 1e-6),
                  (z["ire"], ref["ire"]))
            check("насыщенность зоны «%s» посчитана верно" % name,
                  close(z["sat"], ref["sat"], 1e-6), (z["sat"], ref["sat"]))
            if ref["sat"] > 0.5:
                check("угол зоны «%s» посчитан верно" % name,
                      close(z["angle"], ref["angle"], 1e-6), (z["angle"], ref["angle"]))

        # 5. чистый кадр обязан лежать в канонических коридорах §8б.2 и §8б.4а
        skin, gray, white = t.zone(0), t.zone(1), t.zone(2)
        check("кожа в коридоре 60–75 IRE", 60 <= skin["ire"] <= 75, round(skin["ire"], 1))
        check("кожа на линии скин-тона (123°, светлая до 127°)",
              118 <= skin["angle"] <= 130, round(skin["angle"], 1))
        check("серая карта в коридоре 38–43 IRE", 38 <= gray["ire"] <= 43, round(gray["ire"], 1))
        check("серая карта нейтральна", abs(gray["rgb"][0] - gray["rgb"][2]) < 1.5,
              [round(c, 1) for c in gray["rgb"]])
        check("белая бумага в коридоре 80–92 IRE", 80 <= white["ire"] <= 92, round(white["ire"], 1))

        clean_ire, clean_ang, clean_sat = skin["ire"], skin["angle"], skin["sat"]

        # 6. ошибка 1: творчество поверх сырого log сажает кожу, карта молчит
        t.state(1, 0, 0.6)
        s1, g1 = t.zone(0), t.zone(1)
        check("LUT поверх log: кожа вышла из коридора вниз", s1["ire"] < 60, round(s1["ire"], 1))
        check("LUT поверх log: кожа села не меньше чем на 8 IRE",
              clean_ire - s1["ire"] >= 8, round(clean_ire - s1["ire"], 1))
        check("LUT поверх log: серая карта всё ещё «в норме» — ловушка урока",
              38 <= g1["ire"] <= 43, round(g1["ire"], 1))
        check("log вмещает окно: обреза нет", t.js("PobubnimErr.clipped()") < 0.5,
              t.js("PobubnimErr.clipped()"))
        t.state(1, 1, 0.6)
        check("«как надо»: после конверсии кожа вернулась в коридор",
              60 <= t.zone(0)["ire"] <= 75, round(t.zone(0)["ire"], 1))

        # 7. ошибка 2: кожа уходит с линии, ключ по коже её возвращает
        t.state(2, 0, 1.0)
        s2, g2 = t.zone(0), t.zone(1)
        check("общий грейд: кожа ушла с линии больше чем на 8°",
              abs(s2["angle"] - clean_ang) > 8, round(s2["angle"] - clean_ang, 1))
        check("общий грейд: насыщенность кожи выросла в 1,5 раза и больше",
              s2["sat"] / clean_sat > 1.5, round(s2["sat"] / clean_sat, 2))
        check("общий грейд: серая карта тоже уехала",
              abs(g2["rgb"][0] - g2["rgb"][2]) > 10, round(g2["rgb"][0] - g2["rgb"][2], 1))
        t.state(2, 1, 1.0)
        s2f = t.zone(0)
        check("ключ по коже вернул угол на место", close(s2f["angle"], clean_ang, 0.5),
              round(s2f["angle"] - clean_ang, 2))
        check("ключ по коже вернул насыщенность", close(s2f["sat"], clean_sat, 0.5),
              round(s2f["sat"] - clean_sat, 2))
        check("но остальной кадр остался под грейдом",
              abs(t.zone(1)["rgb"][0] - t.zone(1)["rgb"][2]) > 10)

        # 8. ошибка 3: поправка по кривому экрану уходит в файл
        t.state(3, 0, 0.6, 0.12)
        g3 = t.zone(1)
        rb = g3["rgb"][0] - g3["rgb"][2]
        ref_gray = screen_fix([104, 104, 104], 0.12)
        check("экран теплит 12 %: серая карта уехала в синеву на 25 кодов",
              close(rb, ref_gray[0] - ref_gray[2], 1.5), round(rb, 1))
        t.state(3, 2, 0.6, 0.12)
        check("на экране колориста тот же файл выглядит нейтральным",
              abs(t.zone(1)["rgb"][0] - t.zone(1)["rgb"][2]) < 1.5,
              [round(c, 1) for c in t.zone(1)["rgb"]])
        check("и кожа на его экране на своём месте",
              close(t.zone(0)["angle"], clean_ang, 0.6), round(t.zone(0)["angle"], 1))
        t.state(3, 1, 0.6, 0.12)
        check("«как надо» — файл не тронут", close(t.zone(1)["rgb"][0], 104, 1.5))

        # 9. чем сильнее врёт экран, тем больше уезжает файл
        prev = 0
        for scr in (0.04, 0.12, 0.20):
            t.state(3, 0, 0.6, scr)
            z = t.zone(1)
            d = abs(z["rgb"][0] - z["rgb"][2])
            check("экран %d %%: сдвиг файла растёт" % round(scr * 100), d > prev, d)
            prev = d

        # 10. приборы читают кадр, а не рисуются отдельно
        t.state(0, 0, 0.6)
        st = t.js("PobubnimErr.stats()")
        check("вектроскоп получил выборку кадра", st and st.get("vecN", 0) > 10000,
              st and st.get("vecN"))
        check("статистика прибора сходится с кадром по среднему",
              st and 0 < st["avg"] < 100, st and round(st["avg"], 1))
        check("линия кожи на вектроскопе — канонические 123°",
              t.js("PobubnimErr.canon") == CANON, t.js("PobubnimErr.canon"))

        # 11. страница на телефоне
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=780,
              deviceScaleFactor=1, mobile=True)
        time.sleep(0.5)
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
