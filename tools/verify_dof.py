# -*- coding: utf-8 -*-
"""Сверка калькулятора ГРИП (assets/js/dof.js) с независимой моделью оптики.

Аналитические формулы гиперфокала и границ резкости выведены из модели
тонкой линзы. Здесь та же физика считается ДРУГИМ путём — численно, через
положение плоскости изображения и диаметр пятна на сенсоре: границей
считается дистанция, где пятно равно кружку нерезкости. Если оба пути дают
одно и то же, формулы на сайте верны.

Запуск:  python tools/verify_dof.py [url страницы с dof.js]
Допуск — 0.5% по дистанции. Код 1 — расхождение.
"""
import json
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9401
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/kalkulyator-grip.html"
TOL = 0.005

# (фокусное мм, диафрагма, дистанция мм, кружок нерезкости мм)
CASES = [
    (50, 1.8, 2000, 0.029),
    (50, 5.6, 5000, 0.029),
    (24, 2.8, 1500, 0.029),
    (85, 1.4, 1200, 0.029),
    (35, 4.0, 3000, 0.019),
    (100, 2.8, 10000, 0.015),
    (12, 5.6, 800, 0.015),
    (200, 2.8, 25000, 0.029),
    (35, 8.0, 50000, 0.0187),
]


def image_plane(f, u):
    """Где строится изображение точки на дистанции u (тонкая линза)."""
    return f * u / (u - f)


def spot(f, N, s, d):
    """Диаметр пятна на сенсоре, если сенсор стоит под дистанцию s."""
    vs, vd = image_plane(f, s), image_plane(f, d)
    return (f / N) * abs(vs - vd) / vd


def solve(f, N, s, c, forward):
    """Численно ищем границу резкости: пятно ровно c."""
    lo, hi = (s, s * 10000.0) if forward else (f * 1.0001, s)
    if forward and spot(f, N, s, hi) < c:
        return float("inf")
    for _ in range(200):
        mid = (lo + hi) / 2
        if (spot(f, N, s, mid) < c) == forward:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def main():
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", f"--remote-debugging-port={PORT}",
         "--remote-allow-origins=*", "--window-size=1000,800", "about:blank"],
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
    ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
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
        for _ in range(20):
            time.sleep(0.4)
            if js("typeof window.PobubnimDof") == "object":
                break
        else:
            print("на странице нет PobubnimDof — dof.js не подключён")
            return 1

        for f, N, s, c in CASES:
            got = json.loads(js("JSON.stringify(PobubnimDof.dof(%f,%f,%f,%f))" % (f, N, s, c)))
            near_ref = solve(f, N, s, c, forward=False)
            far_ref = solve(f, N, s, c, forward=True)
            near, far = got["near"], got["far"]
            if far is None:
                far = float("inf")
            def rel(a, b):
                if a == float("inf") or b == float("inf") or (isinstance(a, str)):
                    return 0.0 if (a == b or (a == float("inf") and b == float("inf"))) else 1.0
                return abs(a - b) / max(b, 1e-9)
            far_val = float("inf") if far in (None, "Infinity") or far is True else far
            if isinstance(far_val, str):
                far_val = float("inf")
            dn, df = rel(near, near_ref), rel(far_val, far_ref)
            ok = dn <= TOL and df <= TOL
            print(("ok  " if ok else "ФЕЙЛ ") +
                  f"f={f} N={N} s={s/1000:.1f} м c={c}: ближняя {near/1000:.3f} м "
                  f"(модель {near_ref/1000:.3f}), дальняя " +
                  ("бесконечность" if far_val == float("inf") else f"{far_val/1000:.3f} м") +
                  (" (модель бесконечность)" if far_ref == float("inf") else f" (модель {far_ref/1000:.3f})"))
            if not ok:
                bad.append(f"f={f} N={N} s={s}: near {near} против {near_ref}, far {far_val} против {far_ref}")

        # гиперфокал: наведись на H — дальняя граница уходит в бесконечность, ближняя ≈ H/2
        H = json.loads(js("JSON.stringify(PobubnimDof.dof(50,4,1e9,0.029))"))["H"]
        at_h = json.loads(js("JSON.stringify(PobubnimDof.dof(50,4,%f,0.029))" % H))
        half = at_h["near"] / (H / 2)
        far_inf = at_h["far"] is None or at_h["far"] == "Infinity" or at_h["far"] > 1e12 or at_h["far"] is True
        print(f"гиперфокал 50/4: H={H/1000:.2f} м, ближняя {at_h['near']/1000:.2f} м "
              f"(должна быть ≈ H/2 = {H/2000:.2f} м), дальняя бесконечная: {bool(far_inf)}")
        if abs(half - 1) > 0.01:
            bad.append(f"на гиперфокале ближняя граница {at_h['near']} против H/2 {H/2}")
        if not far_inf:
            bad.append("на гиперфокале дальняя граница не ушла в бесконечность")

        # кружок нерезкости по формату: должен воспроизводить привычные значения
        for name, w, h, expect in (("полный кадр", 36, 24, 0.029), ("APS-C", 23.5, 15.6, 0.019),
                                   ("Micro 4/3", 17.3, 13, 0.015), ("дюйм", 13.2, 8.8, 0.011)):
            c = js("PobubnimDof.coc('print',%f,%f,0)" % (w, h))
            ok = abs(c - expect) <= 0.0011
            print(("ok  " if ok else "ФЕЙЛ ") + f"кружок нерезкости {name}: {c:.4f} мм (ждали ≈{expect})")
            if not ok:
                bad.append(f"coc {name}: {c} против {expect}")
    finally:
        ws.close()
        proc.kill()

    print()
    if bad:
        print("РАСХОЖДЕНИЯ:")
        for b in bad:
            print("  X", b)
        return 1
    print("ГРИП сошлась с независимой моделью оптики")
    return 0


if __name__ == "__main__":
    sys.exit(main())
