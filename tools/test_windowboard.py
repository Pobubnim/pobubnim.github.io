# -*- coding: utf-8 -*-
"""Приёмка доски «свет из окна» (uroki/svet-iz-okna.html).

Главное, что обязана доказать приёмка: доска считает ПЛОЩАДНОЙ источник, а не
точечный. Формула диска R²/(R²+d²) проверяется здесь численным интегрированием
по квадратной площадке — независимо от движка страницы. Дальше сверяются угловой
размер, перепад по лицу, отдача отражателя, косинус Ламберта и то, что вдали
площадная формула действительно сходится с обратным квадратом.

Вывод и числа — EDU_BASE §8п.2 и §8п.3, геометрия полутени — §8о.2.
Запуск:  python tools/test_windowboard.py [url]
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
PORT = 9505
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/svet-iz-okna.html"

FACE = 0.16
HEAD = 0.22
AMB = 0.03
RHO = 0.8

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def close(a, b, eps):
    return a is not None and b is not None and abs(a - b) <= eps


# ---------- независимый пересчёт ----------
def disc(R, d):
    return R * R / (R * R + d * d)


def square_numeric(S, d, n=300):
    """Освещённость на оси от квадратной ламбертовой площадки, численно.
    E = L·d²·∫∫ dA/(d²+x²+y²)², нормировано так же, как disc()."""
    h = S / n
    acc = 0.0
    for i in range(n):
        x = -S / 2 + (i + 0.5) * h
        x2 = x * x
        for j in range(n):
            y = -S / 2 + (j + 0.5) * h
            r2 = d * d + x2 + y * y
            acc += 1.0 / (r2 * r2)
    return d * d * acc * h * h / math.pi


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
        # CDP не сериализует бесконечности значением (грабля 21.09)
        return {"-0": -0.0, "NaN": float("nan"),
                "Infinity": float("inf"), "-Infinity": float("-inf")
                }.get(obj.get("unserializableValue"))

    def set(self, **kw):
        parts = ";".join("B.state.%s=%r" % (k, v) for k, v in kw.items())
        self.js("(()=>{const B=PobubnimWindow;%s;B.draw();})()" % parts)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimWindow") == "object":
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

        # 1. формула диска против численного интеграла по квадрату
        for S, d in ((0.6, 0.3), (0.6, 1.0), (1.5, 0.5), (1.5, 1.0), (1.5, 4.0), (2.5, 2.0)):
            R = math.sqrt(S * S / math.pi)
            page = t.js("PobubnimWindow.disc(%r,%r)" % (R, d))
            num = square_numeric(S, d)
            check("окно %.1f м на %.1f м: формула = интегралу по площадке" % (S, d),
                  page is not None and abs(page - num) / num < 0.02,
                  (round(page or 0, 4), round(num, 4)))

        # 2. вдали площадная формула обязана сойтись с обратным квадратом
        for S in (0.6, 1.5):
            R = math.sqrt(S * S / math.pi)
            far = t.js("PobubnimWindow.disc(%r,%r)" % (R, 5 * S))
            inv = (S * S / math.pi) / (5 * S) ** 2
            check("с пяти размеров окна %.1f м обратный квадрат уже верен" % S,
                  abs(far - inv) / far < 0.03, (round(far, 5), round(inv, 5)))

        # 3. а вблизи — не верен, и в этом весь урок
        R = math.sqrt(2.25 / math.pi)
        near = t.js("PobubnimWindow.disc(%r,1.5)" % R)
        inv = (2.25 / math.pi) / 1.5 ** 2
        check("на дистанции в один размер обратный квадрат врёт больше чем на 25 %",
              abs(near - inv) / near > 0.25, round(abs(near - inv) / near * 100, 1))

        # 4. угловой размер окна (§8о.2)
        for win, d, ang in ((1.5, 1.0, 73.7), (1.5, 2.0, 41.1), (1.5, 3.0, 28.1),
                            (0.6, 1.0, 33.4), (2.5, 1.0, 102.7)):
            t.set(win=win, d=d)
            check("угол окна %.1f м с %.1f м = %.1f°" % (win, d, ang),
                  close(t.js("PobubnimWindow.angular()"), ang, 0.15),
                  t.js("PobubnimWindow.angular()"))

        # 5. перепад по лицу: вблизи площадная модель мягче точечной втрое,
        #    а вдали они обязаны сойтись — иначе доска считает не то
        t.set(win=1.5)
        vals = {}
        for d in (0.5, 1.0, 2.0):
            t.set(d=d)
            page = t.js("PobubnimWindow.faceFall()")
            ref = math.log2(disc(R, d - FACE / 2) / disc(R, d + FACE / 2))
            vals[d] = (ref, 2 * math.log2((d + FACE) / d))
            check("перепад по лицу в %.1f м посчитан по площади" % d, close(page, ref, 1e-6),
                  (round(page or 0, 3), round(ref, 3)))
        check("вплотную к окну площадная модель мягче точечной вдвое и больше",
              vals[0.5][0] < vals[0.5][1] * 0.5,
              (round(vals[0.5][0], 2), round(vals[0.5][1], 2)))
        check("а в двух метрах обе модели сходятся",
              abs(vals[2.0][0] - vals[2.0][1]) / vals[2.0][1] < 0.2,
              (round(vals[2.0][0], 2), round(vals[2.0][1], 2)))

        # 6. отражатель: точная отдача, а не дальнее поле
        Rr = math.sqrt(1.0 / math.pi)
        for d, pct in ((0.5, 44.8), (0.7, 31.5), (1.0, 19.3), (1.5, 9.9), (2.0, 5.9)):
            t.set(refl=d)
            got = t.js("PobubnimWindow.fill()") * 100
            check("отражатель в %.1f м возвращает %.1f %% ключа" % (d, pct),
                  close(got, pct, 0.15), round(got, 2))
            check("дальнее поле здесь завысило бы отдачу",
                  RHO / (math.pi * d * d) * 100 > got)
        check("вплотную дальнее поле даёт невозможные больше 100 %",
              RHO / (math.pi * 0.5 * 0.5) > 1.0)

        # 7. поворот героя — косинус Ламберта (§8п.3)
        for rot, loss in ((0, 0.0), (30, 0.21), (45, 0.50), (60, 1.00), (75, 1.95)):
            t.set(rot=rot)
            check("поворот %d° стоит %.2f ступени" % (rot, loss),
                  close(t.js("PobubnimWindow.turnLoss()"), loss, 0.01),
                  t.js("PobubnimWindow.turnLoss()"))
        t.set(rot=90)
        check("в профиль к окну ключа не остаётся",
              not math.isfinite(t.js("PobubnimWindow.turnLoss()") or 0))

        # 8. лицом к окну — плоско; повернули — появился рисунок
        t.set(win=1.5, d=1.0, refl=1.0, rot=0)
        flat = t.js("PobubnimWindow.contrast()")
        t.set(rot=60)
        modeled = t.js("PobubnimWindow.contrast()")
        check("лицом к окну рисунка нет (меньше полуступени)", flat < 0.5, round(flat, 2))
        check("поворот на 60° даёт рисунок", modeled > 2, round(modeled, 2))
        t.set(refl=0)
        no_refl = t.js("PobubnimWindow.contrast()")
        check("без отражателя теневая сторона проваливается", no_refl > 4.5, round(no_refl, 2))
        check("отражатель срезает контраст больше чем на две ступени",
              no_refl - modeled > 2, round(no_refl - modeled, 2))

        # 9. фон темнеет по той же площадной формуле
        t.set(win=1.5, d=1.0, bg=2.0)
        page = t.js("PobubnimWindow.bgFall()")
        ref = math.log2(disc(R, 1.0) / disc(R, 3.0))
        check("перепад герой/фон посчитан по площади", close(page, ref, 1e-6),
              (round(page or 0, 3), round(ref, 3)))
        check("точечная модель обещала бы заметно больше",
              2 * math.log2(3.0 / 1.0) > ref * 1.2,
              (round(2 * math.log2(3.0), 2), round(ref, 2)))

        # 10. тень на фоне: большое окно не даёт тени вообще
        t.set(win=1.5, d=1.2, bg=1.5)
        big = t.js("PobubnimWindow.shadowDepth()")
        t.set(win=0.6)
        small = t.js("PobubnimWindow.shadowDepth()")
        ref_big = min(1, (HEAD * 2.7 / (1.5 * 1.5)) ** 2)
        check("за большим окном тень героя на фоне почти не видна",
              close(big, ref_big, 1e-6) and big < 0.1, round(big, 3))
        check("за форточкой тень появляется", small > 0.3, round(small, 3))
        check("ширина полутени — геометрия §8о.2",
              close(t.js("PobubnimWindow.penumbra()"), 0.6 * 1.5 / 1.2, 1e-9))

        # 11. отражение стен комнаты объявлено моделью и не ноль
        check("отражение стен взято 3 % ключа и подписано",
              close(t.js("PobubnimWindow.amb"), AMB, 1e-9), t.js("PobubnimWindow.amb"))
        check("белая сторона отражателя 0,8", close(t.js("PobubnimWindow.rho"), RHO, 1e-9))

        # 12. страница на телефоне
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
