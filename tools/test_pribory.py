# -*- coding: utf-8 -*-
"""Приёмка приборов (instrumenty/pribory-onlajn.html).

Проверяет не «нарисовалось ли что-то», а СОВПАДАЮТ ЛИ ЦИФРЫ: странице подаётся
эталонный кадр (цветные полосы 75%), а ожидания считаются здесь же независимо
по формулам из docs/SCOPES_BASE.md. Если прибор врёт — тест краснеет.

Запуск:  python tools/test_pribory.py [url]
"""
import io
import json
import math
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9495
URL = sys.argv[1] if len(sys.argv) > 1 else \
    "http://localhost:8765/instrumenty/pribory-onlajn.html"

fails = []

KR, KG, KB = 0.2126, 0.7152, 0.0722
KR601, KG601, KB601 = 0.299, 0.587, 0.114
BARS = [(1, 1, 1), (1, 1, 0), (0, 1, 1), (0, 1, 0), (1, 0, 1), (1, 0, 0), (0, 0, 1)]
LEVEL = 0.75


def check(name, cond, got=""):
    print(("ok   " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def near(a, b, tol):
    return a is not None and abs(a - b) <= tol


def ycbcr(r, g, b, kr=KR, kg=KG, kb=KB):
    y = kr * r + kg * g + kb * b
    return y, (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbchrome-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             "--window-size=1400,1000", "about:blank"],
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
        self.cmd("Network.enable")
        self.cmd("Network.setBlockedURLs",
                 urls=["*fonts.googleapis.com*", "*fonts.gstatic.com*"])

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
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=True)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            self.errors.append(
                str(res["exceptionDetails"].get("text")) + " " +
                str(res["exceptionDetails"].get("exception", {}).get("description", ""))[:160])
            return None
        return res.get("result", {}).get("value")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(30):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimPribory") == "object":
                return
        raise RuntimeError("прибор не поднялся")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


FEED_BARS = """
(() => {
  const c = document.createElement('canvas');
  c.width = 700; c.height = 270;
  const g = c.getContext('2d');
  const bars = [[1,1,1],[1,1,0],[0,1,1],[0,1,0],[1,0,1],[1,0,0],[0,0,1]];
  bars.forEach((b, i) => {
    g.fillStyle = 'rgb(' + b.map(v => Math.round(v * 0.75 * 255)).join(',') + ')';
    g.fillRect(i * 100, 0, 100, 270);
  });
  window.PobubnimPribory.useSource(c);
  window.PobubnimPribory.render();
  return true;
})()
"""


def main():
    t = Tab()
    try:
        t.goto(URL)

        # ---------- 1. ядро на месте ----------
        check("ядро приборов загружено", t.js("typeof window.PobubnimScopes") == "object")
        check("страница подписала матрицу и диапазон",
              "Rec.709" in (t.js("document.getElementById('pr-signature').innerText") or ""))

        # ---------- 2. эталонный кадр посчитан ----------
        t.js(FEED_BARS)
        st = json.loads(t.js("JSON.stringify(window.PobubnimPribory.stats())") or "null")
        check("прибор посчитал кадр", st is not None, st)

        if st:
            ys = [KR * r * LEVEL + KG * g * LEVEL + KB * b * LEVEL for r, g, b in BARS]
            # экран отдаёт full range: IRE = код / 255 * 100, код = round(v*255)
            want_min = round(min(ys) * 255) / 255 * 100
            want_max = round(max(ys) * 255) / 255 * 100
            want_avg = sum(round(y * 255) / 255 * 100 for y in ys) / len(ys)
            check(f"минимум IRE ≈ {want_min:.1f} (синяя полоса)",
                  near(st["min"], want_min, 0.6), st["min"])
            check(f"максимум IRE ≈ {want_max:.1f} (белая полоса 75%)",
                  near(st["max"], want_max, 0.6), st["max"])
            check(f"средний IRE ≈ {want_avg:.1f}",
                  near(st["avg"], want_avg, 1.5), st["avg"])
            check("на полосах 75% нет клиппинга сверху",
                  st["highPct"] < 0.01, st["highPct"])

        # ---------- 3. вектроскоп кладёт полосы в мишени ----------
        S_ = t.js("window.PobubnimPribory.field.VEC_S")
        peaks = t.js("""
        (() => {
          const S = window.PobubnimPribory.field.VEC_S, a = window.PobubnimPribory.vecAcc;
          const out = [];
          for (let i = 0; i < a.length; i++) if (a[i] > 0) out.push([i % S, (i / S) | 0, a[i]]);
          out.sort((p, q) => q[2] - p[2]);
          return JSON.stringify(out.slice(0, 40));
        })()
        """)
        pts = json.loads(peaks or "[]")
        check("вектроскоп накопил точки", len(pts) > 0, len(pts))

        half = S_ / 2
        found = []
        for x, y, _n in pts:
            cb, cr = (x - half) / S_, (half - y) / S_
            if math.hypot(cb, cr) < 0.05:      # белая полоса стоит в центре
                continue
            found.append((math.degrees(math.atan2(cr, cb)) % 360, math.hypot(cb, cr)))

        for name, rgb in (("красный", (1, 0, 0)), ("пурпурный", (1, 0, 1)),
                          ("синий", (0, 0, 1)), ("голубой", (0, 1, 1)),
                          ("зелёный", (0, 1, 0)), ("жёлтый", (1, 1, 0))):
            _, cb, cr = ycbcr(*[c * LEVEL for c in rgb])
            want_a = math.degrees(math.atan2(cr, cb)) % 360
            want_r = math.hypot(cb, cr)
            hit = any(abs((a - want_a + 180) % 360 - 180) <= 4 and abs(r - want_r) <= 0.03
                      for a, r in found)
            check(f"мишень {name}: угол {want_a:.1f}°, радиус {want_r:.3f}", hit,
                  sorted(found)[:8])

        # ---------- 4. матрица меняет расчёт ----------
        y709 = st["avg"] if st else 0
        t.js("(()=>{document.querySelector('[data-set=\"matrix\"][data-val=\"601\"]').click();"
             "window.PobubnimPribory.render();})()")
        st601 = json.loads(t.js("JSON.stringify(window.PobubnimPribory.stats())") or "null")
        # средний IRE по полному набору полос к матрице НЕ чувствителен: каждый
        # канал встречается в четырёх полосах, а веса в сумме дают единицу.
        # Разницу видно на отдельной полосе — берём синюю (она же минимум кадра).
        want_min601 = round(KB601 * LEVEL * 255) / 255 * 100
        check(f"матрица 601: синяя полоса даёт {want_min601:.1f} IRE",
              st601 and near(st601["min"], want_min601, 0.6), st601 and st601["min"])
        want_min709 = round(KB * LEVEL * 255) / 255 * 100
        check("601 и 709 действительно расходятся на синей полосе",
              st601 and abs(st601["min"] - want_min709) > 2,
              (want_min709, st601 and st601["min"]))
        t.js("(()=>{document.querySelector('[data-set=\"matrix\"][data-val=\"709\"]').click();"
             "window.PobubnimPribory.render();})()")

        # ---------- 5. legal range сдвигает шкалу ----------
        t.js("(()=>{document.querySelector('[data-set=\"range\"][data-val=\"legal\"]').click();"
             "window.PobubnimPribory.render();})()")
        stl = json.loads(t.js("JSON.stringify(window.PobubnimPribory.stats())") or "null")
        if stl and st:
            code_max = round(max(KR * r * LEVEL + KG * g * LEVEL + KB * b * LEVEL
                                 for r, g, b in BARS) * 255)
            want_legal = (code_max - 16) / 219 * 100
            check(f"legal: максимум пересчитан в {want_legal:.1f} IRE",
                  near(stl["max"], want_legal, 0.8), stl["max"])
        t.js("(()=>{document.querySelector('[data-set=\"range\"][data-val=\"full\"]').click();"
             "window.PobubnimPribory.render();})()")

        # ---------- 6. false color красит по зонам ----------
        fc = t.js("""
        (() => {
          const S = window.PobubnimScopes;
          const lut = S.falseColorLUT(S.FC_IRE, S.RANGE.full);
          const at = ire => { const v = Math.round(ire / 100 * 255) * 3;
                              return [lut[v], lut[v+1], lut[v+2]]; };
          return JSON.stringify({grey: at(41), skin: at(67), clip: at(99),
                                 shadow: at(5), none: at(50)});
        })()
        """)
        z = json.loads(fc or "{}")
        check("18% серый (41 IRE) красится зелёным", z.get("grey") == [0, 220, 60], z.get("grey"))
        check("кожа (67 IRE) красится розовым", z.get("skin") == [255, 150, 165], z.get("skin"))
        check("клиппинг (99 IRE) красится красным", z.get("clip") == [255, 40, 30], z.get("clip"))
        check("тени (5 IRE) красятся синим", z.get("shadow") == [0, 90, 255], z.get("shadow"))
        check("вне зон остаётся серым",
              z.get("none") and z["none"][0] == z["none"][1] == z["none"][2], z.get("none"))

        # ---------- 7. waveform ----------
        wf = t.js("""
        (() => {
          const f = window.PobubnimPribory.field, a = window.PobubnimPribory.wfAcc;
          let filled = 0;
          const perRow = new Uint32Array(f.WF_H);
          for (let i = 0; i < f.WF_W * f.WF_H; i++)
            if (a[i]) { filled++; perRow[(i / f.WF_W) | 0] += a[i]; }
          let peak = 0;
          for (let r = 0; r < f.WF_H; r++) if (perRow[r] > peak) peak = perRow[r];
          let strong = 0, weak = 0;
          for (let r = 0; r < f.WF_H; r++) {
            if (perRow[r] > peak * 0.2) strong++;
            else if (perRow[r]) weak++;
          }
          return JSON.stringify({filled: filled, strong: strong, weak: weak});
        })()
        """)
        w = json.loads(wf or "{}")
        check("waveform накопил трассу", w.get("filled", 0) > 100, w)
        # семь полос — семь уровней; лишних (переходных) строк быть не должно:
        # выборка пикселей вместо усреднения при уменьшении кадра
        check("у семи полос ровно семь уровней", w.get("strong") == 7, w)
        check("переходных уровней от сглаживания нет", w.get("weak") == 0, w)

        # ---------- 8. интерфейс жив ----------
        check("переключатель false color есть",
              t.js("!!document.getElementById('pr-fc-toggle')"))
        check("кнопки источников на месте",
              all(t.js(f"!!document.getElementById('{i}')")
                  for i in ("pr-file", "pr-screen", "pr-camera")))
        check("ошибок в консоли нет", not t.errors, t.errors[:3])

    finally:
        t.close()

    print()
    if fails:
        print(f"ПРОВАЛЕНО: {len(fails)}")
        for f in fails:
            print("  ✗ " + f)
        sys.exit(1)
    print("Все проверки пройдены.")


if __name__ == "__main__":
    main()
