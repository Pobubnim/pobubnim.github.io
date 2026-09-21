# -*- coding: utf-8 -*-
"""Приёмка доски «RAW или log» (uroki/raw-ili-log.html).

Доска утверждает вещь, противоположную общему мнению: в глубоких тенях
десятибитный log держит БОЛЬШЕ разных кодов, чем четырнадцатибитный линейный
RAW. Здесь это пересчитывается независимо по опубликованным кривым (§8д.4,6),
вместе с потолками форматов, обрезом светов и поведением баланса белого,
который в RAW метаданные, а в log запечён (§8б.3). Числа — EDU_BASE §8п.1.

Запуск:  python tools/test_rawlogboard.py [url]
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
PORT = 9506
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/uroki/raw-ili-log.html"

GREY = 0.18
LMAX = GREY * 2 ** 6.5
RAW12, RAW14, SLOG, R709 = 0, 1, 2, 3

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


def eotf709(v):
    return v / 4.5 if v < 0.081 else ((v + 0.099) / 1.099) ** (1 / 0.45)


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


MAXC = {RAW12: 4095, RAW14: 16383, SLOG: 1023, R709: 1023}


def capture(fmt, L):
    L = min(max(L, 0.0), LMAX)
    if fmt in (RAW12, RAW14):
        v = L / LMAX
    elif fmt == SLOG:
        v = slog3(L)
    else:
        v = oetf709(L)
    return round(min(v, 1.0) * MAXC[fmt])


def per_stop(fmt, L):
    return capture(fmt, min(L * 2, LMAX)) - capture(fmt, min(L, LMAX))


def ceiling(fmt):
    if fmt == R709:
        return min(LMAX, 1.0)
    if fmt == SLOG:
        return min(LMAX, slog3_inv(1.0))
    return LMAX


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

    def set(self, **kw):
        parts = ";".join("B.state.%s=%r" % (k, v) for k, v in kw.items())
        self.js("(()=>{const B=PobubnimRawLog;%s;B.draw();})()" % parts)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimRawLog") == "object":
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

        # 1. кривые на странице — опубликованные, без самодеятельности
        for L in (0.02, 0.09, 0.18, 0.36, 2.0, 12.0):
            check("S-Log3 при x=%.2f" % L,
                  close(t.js("PobubnimRawLog.slog3(%r)" % L), slog3(L), 1e-9))
        for L in (0.02, 0.18, 0.9):
            check("Rec.709 OETF при L=%.2f" % L,
                  close(t.js("PobubnimRawLog.oetf709(%r)" % L), oetf709(L), 1e-9))
        for v in (0.2, 0.41, 0.9):
            check("обратные кривые при V=%.2f" % v,
                  close(t.js("PobubnimRawLog.slog3Inv(%r)" % v), slog3_inv(v), 1e-9) and
                  close(t.js("PobubnimRawLog.eotf709(%r)" % v), eotf709(v), 1e-9))

        # 2. потолок сенсора — объявленная модель, одинаковая для всех форматов
        check("потолок сенсора +6,5 ст. над серой картой",
              close(t.js("PobubnimRawLog.LMAX"), LMAX, 1e-9), t.js("PobubnimRawLog.LMAX"))

        # 3. кодов на ступень: все четыре формата на всех ступенях
        for fmt in (RAW12, RAW14, SLOG, R709):
            t.set(fmt=fmt)
            for s in range(-6, 6):
                L = GREY * 2 ** s
                got = t.js("PobubnimRawLog.perStop(%r)" % L)
                check("%s, ступень %+d: кодов %d" % (t.js("PobubnimRawLog.FMT[%d][0]" % fmt),
                                                     s, per_stop(fmt, L)),
                      got == per_stop(fmt, L), got)

        # 4. канон §8п.1: предел ступени S-Log3 и фактическое значение у серого
        limit = 261.5 * math.log10(2)
        check("предел ступени S-Log3 = 78,72 кода", close(limit, 78.72, 0.01), round(limit, 3))
        t.set(fmt=SLOG)
        at_grey = t.js("PobubnimRawLog.perStop(%r)" % GREY)
        check("но у серой карты фактически 76, а не 78,7", at_grey == 76, at_grey)
        far = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** 4))
        check("к светам ступень подходит к пределу", abs(far - limit) < 1, far)

        # 5. потолки форматов
        t.set(fmt=R709)
        check("Rec.709 обрывается на L = 1,0",
              close(t.js("PobubnimRawLog.ceiling()"), 1.0, 1e-9))
        check("а это всего +2,47 ступени над серым",
              close(t.js("PobubnimRawLog.headroom()"), math.log2(1 / GREY), 1e-9),
              t.js("PobubnimRawLog.headroom()"))
        t.set(fmt=SLOG)
        check("S-Log3 своим потолком достаёт выше сенсора (38,4 против 16,3)",
              slog3_inv(1.0) > LMAX, round(slog3_inv(1.0), 1))
        check("поэтому в log предел кладёт сенсор, а не формат",
              close(t.js("PobubnimRawLog.ceiling()"), LMAX, 1e-9))
        check("запас над серым в log +6,5 ст.",
              close(t.js("PobubnimRawLog.headroom()"), 6.5, 1e-9))

        # 6. главное утверждение урока — и оно против общего мнения
        t.set(fmt=SLOG)
        log_dark = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** -5))
        log_grey = t.js("PobubnimRawLog.perStop(%r)" % GREY)
        t.set(fmt=RAW14)
        raw_dark = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** -5))
        raw_grey = t.js("PobubnimRawLog.perStop(%r)" % GREY)
        raw_high = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** 3))
        t.set(fmt=SLOG)
        log_high = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** 3))
        check("в тени −5 ст. log держит кодов в несколько раз больше RAW 14 бит",
              log_dark > raw_dark * 4, (log_dark, raw_dark))
        check("у серой карты наоборот — RAW вдвое богаче",
              raw_grey > log_grey * 2, (raw_grey, log_grey))
        check("а в светах RAW не догнать вовсе",
              raw_high > log_high * 15, (raw_high, log_high))

        # 7. обрез светов: сколько ступеней шкалы не попало в файл
        t.set(fmt=R709)
        check("в Rec.709 три верхние ступени шкалы потеряны",
              t.js("PobubnimRawLog.clipped()") == 3, t.js("PobubnimRawLog.clipped()"))
        for fmt in (RAW12, RAW14, SLOG):
            t.set(fmt=fmt)
            check("а в %s — ни одной" % t.js("PobubnimRawLog.FMT[%d][0]" % fmt),
                  t.js("PobubnimRawLog.clipped()") == 0)

        # 8. клиппинг сенсора необратим во всех форматах (§8б.3)
        # две РАЗНЫЕ яркости выше потолка обязаны дать в файле одно и то же —
        # и никакая правка экспозиции их уже не разведёт
        for fmt in (RAW14, SLOG, R709):
            for exp in (0, 2):
                t.set(fmt=fmt, exp=exp)
                a = t.js("JSON.stringify(PobubnimRawLog.through(%r))" % (LMAX * 2))
                b = t.js("JSON.stringify(PobubnimRawLog.through(%r))" % (LMAX * 3))
                check("выше потолка яркости слиплись, подъём на %d ст. их не разводит (%s)"
                      % (exp, t.js("PobubnimRawLog.FMT[%d][0]" % fmt)), a == b, (a, b))
        t.set(exp=0)

        # 9. баланс белого: в RAW метаданные, в log и 709 запечён
        for wb in (20, 60, 100):
            t.set(fmt=RAW14, wb=wb)
            check("RAW: промах ББ на %d %% возвращается точно" % wb,
                  t.js("PobubnimRawLog.worstCast()") < 0.6,
                  t.js("PobubnimRawLog.worstCast()"))
        t.set(fmt=SLOG, wb=100)
        log_cast = t.js("PobubnimRawLog.worstCast()")
        t.set(fmt=R709, wb=100)
        c709 = t.js("PobubnimRawLog.worstCast()")
        check("S-Log3: после правки остаётся цветной след", log_cast > 1, round(log_cast, 2))
        check("Rec.709: след ещё заметнее", c709 > log_cast, (round(c709, 2), round(log_cast, 2)))
        t.set(wb=0)
        check("при точном ББ на камере следа нет ни у кого",
              t.js("PobubnimRawLog.worstCast()") < 0.6)

        # 10. полосы в поднятой тени: чем меньше кодов, тем их меньше осталось
        t.set(fmt=RAW12, wb=40)
        c12 = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** -5))
        t.set(fmt=SLOG)
        cl = t.js("PobubnimRawLog.perStop(%r)" % (GREY * 2 ** -5))
        check("на RAW 12 бит в тени −5 ст. остаётся считаное число кодов", c12 <= 2, c12)
        check("на log их в разы больше", cl > c12 * 10, (cl, c12))

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
