# -*- coding: utf-8 -*-
"""Приёмка приборов (instrumenty/pribory-onlajn.html).

Проверяет не «нарисовалось ли что-то», а СОВПАДАЮТ ЛИ ЦИФРЫ: странице подаётся
эталонный кадр, а ожидания считаются здесь же независимо по формулам из
docs/SCOPES_BASE.md. Если прибор врёт — тест краснеет.

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
CODE75 = round(LEVEL * 255)          # 191 — код полосы 75%


def check(name, cond, got=""):
    print(("ok   " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


def near(a, b, tol):
    return a is not None and abs(a - b) <= tol


def ycbcr(r, g, b, kr=KR, kg=KG, kb=KB):
    y = kr * r + kg * g + kb * b
    return y, (b - y) / (2 * (1 - kb)), (r - y) / (2 * (1 - kr))


def oetf709(L):
    return 4.5 * L if L < 0.018 else 1.099 * L ** 0.45 - 0.099


def logc3(x):
    cut, a, b, c, d, e, f = 0.010591, 5.555556, 0.052272, 0.247190, 0.385537, 5.367655, 0.092809
    return c * math.log10(a * x + b) + d if x > cut else e * x + f


class Tab:
    def __init__(self, width=1400, height=1000):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbchrome-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             f"--window-size={width},{height}", "about:blank"],
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
                 urls=["*fonts.googleapis.com*", "*fonts.gstatic.com*", "*mc.yandex.ru*"])

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg
            if msg.get("method") == "Runtime.exceptionThrown":
                d = msg["params"]["exceptionDetails"]
                desc = (d.get("exception", {}) or {}).get("description", "")
                self.errors.append((d.get("text", "JS error") + " " + str(desc))[:200])

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

    def jsobj(self, expr):
        raw = self.js("JSON.stringify(" + expr + ")")
        return json.loads(raw) if raw else None

    def size(self, width, height):
        self.cmd("Emulation.setDeviceMetricsOverride", width=width, height=height,
                 deviceScaleFactor=1, mobile=(width < 700))

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(40):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimPribory") == "object":
                time.sleep(0.5)
                return
        raise RuntimeError("прибор не поднялся")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def feed_bars(width=700, height=270):
    """эталонный кадр: цветные полосы 75%"""
    return """
(function () {
  var c = document.createElement('canvas');
  c.width = %d; c.height = %d;
  var g = c.getContext('2d');
  var bars = [[1,1,1],[1,1,0],[0,1,1],[0,1,0],[1,0,1],[1,0,0],[0,0,1]];
  bars.forEach(function (b, i) {
    g.fillStyle = 'rgb(' + b.map(function (v) { return Math.round(v * 0.75 * 255); }).join(',') + ')';
    g.fillRect(Math.round(i * c.width / 7), 0, Math.ceil(c.width / 7), c.height);
  });
  window.PobubnimPribory.useSource(c, 'полосы 75%%');
  window.PobubnimPribory.render(true);
  return true;
})()
""" % (width, height)


FEED_FLAT = """
(function () {
  var c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  var g = c.getContext('2d');
  g.fillStyle = 'rgb(%d,%d,%d)';
  g.fillRect(0, 0, c.width, c.height);
  window.PobubnimPribory.useSource(c, 'ровное поле');
  window.PobubnimPribory.render(true);
  return true;
})()
"""

FEED_HALVES = """
(function () {
  var c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  var g = c.getContext('2d');
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, 320, 360);
  g.fillStyle = 'rgb(255,255,255)'; g.fillRect(320, 0, 320, 360);
  window.PobubnimPribory.useSource(c, 'две половины');
  window.PobubnimPribory.render(true);
  return true;
})()
"""


def main():
    t = Tab()
    try:
        t.goto(URL)
        t.js("localStorage.removeItem('pobubnim-pribory-v1')")

        # ---------- 1. каркас ----------
        check("ядро приборов загружено", t.js("typeof window.PobubnimScopes") == "object")
        check("рабочая станция поднялась", t.js("typeof window.PobubnimPribory") == "object")
        sig = t.js("document.getElementById('sc-signature').innerText") or ""
        check("паспорт сигнала подписан (источник/матрица/диапазон)",
              "Rec.709" in sig and "Full" in sig and "Источник" in sig, sig[:120])
        check("шесть чисел кадра на месте",
              t.js("document.querySelectorAll('.sc-num').length") == 6)
        check("четыре окна приборов созданы",
              t.js("document.querySelectorAll('.sc-slot').length") == 4)

        # ---------- 2. эталонный кадр: числа ----------
        t.js(feed_bars())
        st = t.jsobj("window.PobubnimPribory.stats()")
        check("прибор посчитал кадр", st is not None, st)

        ys = [KR * r + KG * g + KB * b for r, g, b in BARS]
        ys = [y * CODE75 for y in ys]
        want_min, want_max = min(ys) / 255 * 100, max(ys) / 255 * 100
        want_avg = sum(ys) / len(ys) / 255 * 100
        if st:
            check(f"минимум {want_min:.2f} IRE (синяя полоса)", near(st["min"], want_min, 0.15), st["min"])
            check(f"максимум {want_max:.2f} IRE (белая полоса)", near(st["max"], want_max, 0.15), st["max"])
            check(f"средний уровень {want_avg:.2f} IRE", near(st["avg"], want_avg, 0.3), st["avg"])
            check("клип чёрного = 0 (полосы не в полу)", near(st["clipLow"], 0, 0.01), st["clipLow"])
            check("клип белого = 0 (полосы не в потолке)", near(st["clipHigh"], 0, 0.01), st["clipHigh"])
            check("«канал в упор» = 85,7% (шесть полос из семи с нулевым каналом)",
                  near(st["chanOut"], 600 / 7, 0.5), st["chanOut"])

        # ---------- 3. диапазон legal ----------
        t.js("window.PobubnimPribory.state.range='legal'; window.PobubnimPribory.render(true)")
        stl = t.jsobj("window.PobubnimPribory.stats()")
        want_min_l = (min(ys) - 16) / 219 * 100
        want_max_l = (max(ys) - 16) / 219 * 100
        check(f"legal: минимум {want_min_l:.2f} IRE (ниже нуля — так и должно быть)",
              near(stl["min"], want_min_l, 0.15), stl["min"])
        check(f"legal: максимум {want_max_l:.2f} IRE", near(stl["max"], want_max_l, 0.15), stl["max"])
        check("legal: шкала показывает запас за 0 и 100 IRE",
              near(stl["viewLo"], -0.1, 1e-6) and near(stl["viewHi"], 1.1, 1e-6),
              (stl["viewLo"], stl["viewHi"]))
        t.js("window.PobubnimPribory.state.range='full'; window.PobubnimPribory.render(true)")

        # ---------- 4. матрица 601 ----------
        t.js("window.PobubnimPribory.state.matrix='601'; window.PobubnimPribory.render(true)")
        st601 = t.jsobj("window.PobubnimPribory.stats()")
        want_blue_601 = KB601 * CODE75 / 255 * 100
        check(f"Rec.601: синяя полоса даёт {want_blue_601:.2f} IRE вместо {want_min:.2f}",
              near(st601["min"], want_blue_601, 0.15), st601["min"])
        t.js("window.PobubnimPribory.state.matrix='709'; window.PobubnimPribory.render(true)")

        # ---------- 5. мишени вектроскопа ----------
        targets = t.jsobj("window.PobubnimPribory.targets()")
        by = {x["name"]: x for x in targets}
        for name, ang, rad in (("R", 102.9, 0.385), ("Mg", 49.7, 0.447), ("B", 354.8, 0.377)):
            check(f"мишень {name}: угол {ang}°", near(by[name]["angle"], ang, 0.15), by[name]["angle"])
            check(f"мишень {name}: радиус {rad}", near(by[name]["radius"], rad, 0.005), by[name]["radius"])

        # точки кадра обязаны лечь в мишени: ищем максимум накопления рядом с целью
        hit = t.jsobj("""(function () {
          var P = window.PobubnimPribory, b = P.buffers(), S = P.field().VEC_S;
          var half = S / 2, out = [];
          P.targets().forEach(function (t) {
            var cx = Math.round(half + t.cb * S), cy = Math.round(half - t.cr * S);
            var best = 0;
            for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
              var x = cx + dx, y = cy + dy;
              if (x < 0 || y < 0 || x >= S || y >= S) continue;
              if (b.vec[y * S + x] > best) best = b.vec[y * S + x];
            }
            out.push({ name: t.name, hits: best });
          });
          return out;
        })()""")
        for h in hit:
            check(f"точки полосы {h['name']} попали в мишень", h["hits"] > 0, h["hits"])

        # ---------- 6. false color: три шкалы ----------
        zones = t.jsobj("window.PobubnimPribory.zones()")
        check("шкала IRE: шесть зон", len(zones) == 6, len(zones))
        grey_code = round(oetf709(0.18) * 255)          # 18% серый в full range
        col = t.jsobj("""(function () {
          var S = window.PobubnimScopes, st = window.PobubnimPribory.state;
          var lut = S.buildLUT(S.ireZones(S.FC_IRE), S.RANGE.full);
          function at(v) { return [lut[v*3], lut[v*3+1], lut[v*3+2]]; }
          return { grey: at(%d), skin: at(Math.round(0.65*255)), clip: at(252), shadow: at(4) };
        })()""" % grey_code)
        check("false color: 18%% серый красится зелёным", col["grey"] == [0, 220, 60], col["grey"])
        check("false color: кожа 65 IRE красится розовым", col["skin"] == [255, 150, 165], col["skin"])
        check("false color: 98 IRE красится красным", col["clip"] == [255, 40, 30], col["clip"])
        check("false color: 1,6 IRE — фиолетовый шумовой пол", col["shadow"] == [179, 0, 255], col["shadow"])

        # шкала ARRI: наша формула LogC3 обязана попасть в опубликованную зону
        arri = t.jsobj("""(function () {
          var S = window.PobubnimScopes;
          var z = S.arriZones(800, 'legal');
          return z.map(function (x) { return { t: x.t, lo: x.lo, hi: x.hi, code: x.code }; });
        })()""")
        green = [z for z in arri if z["t"] == "18% серый"][0]
        grey_logc = logc3(0.18)
        check("ARRI EI800: зелёная зона — коды 397–415 (спецификация 04.02.2025)",
              green["code"] == [397, 415], green["code"])
        check(f"ARRI: 18%% серый по LogC3 ({grey_logc*100:.2f}%%) попадает в зелёную зону",
              green["lo"] <= grey_logc <= green["hi"], (green["lo"], grey_logc, green["hi"]))

        stops = t.jsobj("window.PobubnimScopes.stopZones('709').map(function(z){return {t:z.t,lo:z.lo,hi:z.hi,stop:z.stop};})")
        zero = [z for z in stops if z["stop"] == 0][0]
        check("шкала в стопах: зона «0 стоп» накрывает серую карту",
              zero["lo"] <= oetf709(0.18) <= zero["hi"], (zero["lo"], oetf709(0.18), zero["hi"]))

        # ---------- 7. единицы шкалы ----------
        units = t.jsobj("""(function () {
          var S = window.PobubnimScopes;
          return { legal8: S.toUnit(1, 'code8', S.RANGE.legal), legal10: S.toUnit(1, 'code10', S.RANGE.legal),
                   legal0: S.toUnit(0, 'code8', S.RANGE.legal), full10: S.toUnit(1, 'code10', S.RANGE.full),
                   ire: S.toUnit(0.409, 'ire', S.RANGE.legal) };
        })()""")
        check("единицы: legal 100 IRE = код 235", near(units["legal8"], 235, 0.01), units["legal8"])
        check("единицы: legal 100 IRE = 10-битный 940", near(units["legal10"], 940, 0.01), units["legal10"])
        check("единицы: legal 0 IRE = код 16", near(units["legal0"], 16, 0.01), units["legal0"])
        check("единицы: full 100% = 10-битный 1023", near(units["full10"], 1023, 0.01), units["full10"])

        # ---------- 8. пипетка ----------
        probe = t.jsobj("""(function () {
          var S = window.PobubnimScopes;
          var p = S.probe(191, 191, 191, S.MATRIX['709'], S.RANGE.full, '709');
          var skin = S.probe(198, 134, 102, S.MATRIX['709'], S.RANGE.full, '709');
          return { white: p, skin: skin };
        })()""")
        check("пипетка: белая полоса 74,9 IRE", near(probe["white"]["ire"], 74.9, 0.1), probe["white"]["ire"])
        check("пипетка: тон кожи ложится на 120–130° (линия кожи 123°)",
              120 <= probe["skin"]["angle"] <= 130, probe["skin"]["angle"])
        check("пипетка: белая полоса примерно +1,7 стопа от серого",
              near(probe["white"]["stops"], 1.72, 0.15), probe["white"]["stops"])

        # ---------- 9. клип на белом поле ----------
        t.js(FEED_FLAT % (255, 255, 255))
        stw = t.jsobj("window.PobubnimPribory.stats()")
        check("белое поле: клип белого 100%", near(stw["clipHigh"], 100, 0.01), stw["clipHigh"])
        check("белое поле: 100 IRE", near(stw["max"], 100, 0.01), stw["max"])
        t.js(FEED_FLAT % (0, 0, 0))
        stb = t.jsobj("window.PobubnimPribory.stats()")
        check("чёрное поле: клип чёрного 100%", near(stb["clipLow"], 100, 0.01), stb["clipLow"])

        # ---------- 10. нормировка трассы не зависит от размера кадра ----------
        bright = []
        for w, h in ((480, 270), (1280, 720)):
            t.js(feed_bars(w, h))
            bright.append(t.jsobj("""(function () {
              var c = document.querySelectorAll('.sc-slot')[0].querySelector('canvas');
              var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              var sum = 0, n = 0;
              for (var i = 0; i < d.length; i += 4) { if (d[i] > 30) { sum += d[i]; n++; } }
              return n ? sum / n : 0;
            })()"""))
        rel = abs(bright[0] - bright[1]) / max(1e-9, bright[0])
        check(f"яркость трассы не зависит от размера кадра (расхождение {rel*100:.1f}%)",
              rel < 0.12, bright)

        # ---------- 10б. трасса сплошная, а не пунктир ----------
        t.js(FEED_FLAT % (120, 120, 120))
        solid = t.jsobj("""(function () {
          var P = window.PobubnimPribory, b = P.buffers(), f = P.field();
          var W = f.WF_W, H = f.WF_H, filled = 0;
          for (var x = 0; x < W; x++) {
            for (var y = 0; y < H; y++) { if (b.wf[y * W + x]) { filled++; break; } }
          }
          return { filled: filled, width: W };
        })()""")
        check("трасса заполняет всю ширину поля (не пунктир)",
              solid["filled"] == solid["width"], solid)

        # ---------- 11. кроп ----------
        t.js(feed_bars(700, 270))
        t.js("window.PobubnimPribory.setCrop({x: 6/7, y: 0, w: 1/7, h: 1})")
        stc = t.jsobj("window.PobubnimPribory.stats()")
        want_blue = KB * CODE75 / 255 * 100
        check("кроп по синей полосе: средний уровень равен её яркости",
              near(stc["avg"], want_blue, 0.4), (stc["avg"], want_blue))
        check("кроп отражён в паспорте сигнала",
              "кроп" in (t.js("document.getElementById('sc-signature').innerText") or ""))
        t.js("window.PobubnimPribory.setCrop(null)")

        # ---------- 12. зебра и пикинг ----------
        zeb = t.jsobj("""(function () {
          var S = window.PobubnimScopes;
          var n = 64, px = new Uint8ClampedArray(n * n * 4);
          for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
            var v = x < n / 2 ? 120 : 250, o = (y * n + x) * 4;
            px[o] = px[o+1] = px[o+2] = v; px[o+3] = 255;
          }
          S.applyZebra(px, n, n, { matrix: S.MATRIX['709'], range: S.RANGE.full, lo: 0.95, hi: 1e4, period: 8, phase: 0 });
          var left = 0, right = 0;
          for (var y2 = 0; y2 < n; y2++) for (var x2 = 0; x2 < n; x2++) {
            var o2 = (y2 * n + x2) * 4;
            if (px[o2] === 255 && px[o2+1] === 255 && px[o2+2] === 255) { if (x2 < n/2) left++; else right++; }
          }
          return { left: left, right: right };
        })()""")
        check("зебра: штрихует только пересвет (правая половина)",
              zeb["left"] == 0 and zeb["right"] > 500, zeb)

        peak = t.jsobj("""(function () {
          var S = window.PobubnimScopes;
          var n = 64;
          function make(sharp) {
            var px = new Uint8ClampedArray(n * n * 4);
            for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
              var v = sharp ? (x < n / 2 ? 20 : 235) : Math.round(20 + x / n * 215);
              var o = (y * n + x) * 4;
              px[o] = px[o+1] = px[o+2] = v; px[o+3] = 255;
            }
            return px;
          }
          function count(px) {
            S.applyPeaking(px, n, n, { matrix: S.MATRIX['709'], threshold: 0.35 });
            var k = 0;
            for (var i = 0; i < px.length; i += 4) if (px[i] === 255 && px[i+1] === 60 && px[i+2] === 60) k++;
            return k;
          }
          return { sharp: count(make(true)), soft: count(make(false)) };
        })()""")
        check("пикинг: резкая граница подсвечена", peak["sharp"] > 50, peak)
        check("пикинг: плавный градиент не подсвечен", peak["soft"] == 0, peak)

        # ---------- 13. приборы в окнах ----------
        for idx, scope in ((0, "wf-parade"), (1, "wf-ycc"), (2, "fc"), (3, "wf-color")):
            t.js(f"window.PobubnimPribory.setSlot({idx}, '{scope}')")
        t.js(feed_bars())
        painted = t.jsobj("""(function () {
          return Array.prototype.map.call(document.querySelectorAll('.sc-slot'), function (sl) {
            var c = sl.querySelector('canvas');
            var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            var bright = 0, colored = 0;
            for (var i = 0; i < d.length; i += 4) {
              var mx = Math.max(d[i], d[i+1], d[i+2]), mn = Math.min(d[i], d[i+1], d[i+2]);
              if (mx > 120) bright++;
              if (mx - mn > 40) colored++;
            }
            return { scope: sl.querySelector('select').value, bright: bright, colored: colored };
          });
        })()""")
        for p in painted:
            check(f"прибор «{p['scope']}» рисует картинку", p["bright"] > 100, p)
        check("парад RGB цветной", [p for p in painted if p["scope"] == "wf-parade"][0]["colored"] > 100)
        check("false color красит зоны", [p for p in painted if p["scope"] == "fc"][0]["colored"] > 1000)

        # ---------- 14. раскладка и настройки живут ----------
        t.js("document.querySelector('[data-layout=\\\"2\\\"]').click()")
        time.sleep(0.3)
        check("раскладка 2 прибора: два окна видимы",
              t.js("Array.prototype.filter.call(document.querySelectorAll('.sc-slot'), function(s){return !s.classList.contains('off');}).length") == 2)
        saved = t.js("localStorage.getItem('pobubnim-pribory-v1')")
        check("настройки сохраняются в браузере", saved is not None and '"layout":2' in saved, saved)
        t.js("document.querySelector('[data-layout=\\\"4\\\"]').click()")

        # ---------- 15. заморозка ----------
        t.js("document.getElementById('sc-freeze').click()")
        check("заморозка подписана в паспорте",
              "заморожен" in (t.js("document.getElementById('sc-signature').innerText") or ""))
        t.js("document.getElementById('sc-freeze').click()")

        # ---------- 16. панель управления ----------
        was = t.js("document.getElementById('sc-cfg').classList.contains('on')")
        check("панель управления открыта на широком экране", was is True, was)
        t.js("document.getElementById('sc-settings').click()")
        time.sleep(0.25)
        check("панель сворачивается кнопкой",
              t.js("document.getElementById('sc-cfg').classList.contains('on')") is False)
        wide = t.js("Math.round(document.getElementById('sc-grid').getBoundingClientRect().width)")
        t.js("document.getElementById('sc-settings').click()")
        time.sleep(0.25)
        narrow = t.js("Math.round(document.getElementById('sc-grid').getBoundingClientRect().width)")
        check("свёрнутая панель отдаёт приборам свою ширину", wide - narrow > 200, (wide, narrow))
        check("выбор шкалы false color есть", t.js("!!document.getElementById('cfg-fc')"))
        check("список EI ARRI на 14 позиций",
              t.js("document.getElementById('cfg-ei').options.length") == 14)

        # ---------- 16б. приборы рисуются один к одному ----------
        t.js("window.PobubnimPribory.state.quality = 'auto'; window.PobubnimPribory.render(true)")
        time.sleep(0.3)
        fit = t.jsobj("""(function () {
          var slot = document.querySelectorAll('.sc-slot')[0];
          var c = slot.querySelector('canvas'), f = window.PobubnimPribory.field();
          var dpr = Math.min(2, window.devicePixelRatio || 1);
          return { field: f.WF_W, want: Math.round(c.getBoundingClientRect().width * dpr - 34 * dpr),
                   fieldH: f.WF_H, wantH: Math.round(c.getBoundingClientRect().height * dpr),
                   work: window.PobubnimPribory.work.width };
        })()""")
        check("поле waveform равно окну по ширине (без растяжки)",
              abs(fit["field"] - fit["want"]) <= 1, fit)
        check("поле waveform равно окну по высоте", abs(fit["fieldH"] - fit["wantH"]) <= 1, fit)
        check("режим «под размер окна» поднимает разрешение анализа",
              fit["work"] >= min(1440, fit["want"]), fit)

        # ---------- 16в. окно яркости на трассе ----------
        # градиент 0-255: у трассы есть и тени, и света, и её видно диагональю
        t.js("""(function () {
          var c = document.createElement('canvas'); c.width = 640; c.height = 360;
          var g = c.getContext('2d');
          var lg = g.createLinearGradient(0, 0, 640, 0);
          lg.addColorStop(0, '#000'); lg.addColorStop(1, '#fff');
          g.fillStyle = lg; g.fillRect(0, 0, 640, 360);
          window.PobubnimPribory.setSlot(0, 'wf-luma');
          window.PobubnimPribory.state.zone = 'all';
          window.PobubnimPribory.useSource(c, 'градиент');
        })()""")
        time.sleep(0.3)
        # считаем накопление в самом поле прибора: разметка и подписи в него
        # не входят, поэтому видно именно трассу
        halves = """(function () {
          var b = window.PobubnimPribory.buffers(), f = window.PobubnimPribory.field();
          var W = f.WF_W, H = f.WF_H, top = 0, bot = 0;
          for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
              var v = b.wf[y * W + x];
              if (y < H / 2) top += v; else bot += v;
            }
          }
          return { top: top, bot: bot };
        })()"""
        both = t.jsobj(halves)
        t.js("window.PobubnimPribory.state.zone='low'; window.PobubnimPribory.render(true)")
        time.sleep(0.25)
        low = t.jsobj(halves)
        t.js("window.PobubnimPribory.state.zone='high'; window.PobubnimPribory.render(true)")
        time.sleep(0.25)
        high = t.jsobj(halves)
        t.js("window.PobubnimPribory.state.zone='all'; window.PobubnimPribory.render(true)")
        check("трасса градиента заполняет обе половины поля", both["top"] > 1000 and both["bot"] > 1000, both)
        check("зона «тени»: света с трассы уходят", low["top"] < both["top"] * 0.02, (low, both))
        check("зона «тени»: тени остаются", low["bot"] > both["bot"] * 0.3, (low, both))
        check("зона «света»: тени с трассы уходят", high["bot"] < both["bot"] * 0.02, (high, both))
        check("зона «света»: света остаются", high["top"] > both["top"] * 0.3, (high, both))
        t.js(feed_bars())
        t.js("window.PobubnimPribory.render(true)")
        time.sleep(0.25)

        # ---------- 16г. цвет трассы не переставлен по каналам ----------
        trace = t.jsobj("""(function () {
          var c = document.querySelectorAll('.sc-slot')[0].querySelector('canvas');
          var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, best = -1, o = 0;
          for (var p = 0; p < d.length; p += 4) {
            var s = d[p] + d[p + 1] + d[p + 2];
            if (s > best) { best = s; o = p; }
          }
          return { r: d[o], g: d[o + 1], b: d[o + 2] };
        })()""")
        check("трасса яркости остаётся тёплой белой (245/239/226 — каналы не переставлены)",
              trace["r"] >= trace["g"] >= trace["b"] and trace["r"] > 200 and trace["r"] - trace["b"] < 40, trace)

        # ---------- 16д. превью источника и кроп по нему ----------
        prev = t.jsobj("""(function () {
          var c = document.getElementById('sc-preview-cv');
          var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, bright = 0;
          for (var p = 0; p < d.length; p += 4) if (d[p] + d[p + 1] + d[p + 2] > 60) bright++;
          return { w: c.width, h: c.height, bright: bright };
        })()""")
        check("превью источника в панели живое", prev["bright"] > 100 and prev["w"] > 100, prev)
        drag = t.jsobj("""(function () {
          var box = document.getElementById('sc-preview');
          var r = box.getBoundingClientRect();
          function ev(type, fx, fy) {
            box.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1,
              clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
          }
          ev('pointerdown', 0.1, 0.1); ev('pointermove', 0.6, 0.7); ev('pointerup', 0.6, 0.7);
          var c = window.PobubnimPribory.crop();
          return c ? { x: +c.x.toFixed(2), y: +c.y.toFixed(2), w: +c.w.toFixed(2), h: +c.h.toFixed(2) } : null;
        })()""")
        check("кроп задаётся мышью по превью, без окна «Кадр»",
              drag is not None and abs(drag["w"] - 0.5) < 0.06 and abs(drag["h"] - 0.6) < 0.06, drag)
        t.js("window.PobubnimPribory.setCrop(null); document.getElementById('sc-crop').textContent = 'Кроп'")

        # ---------- 17. горячие клавиши ----------
        before = t.js("window.PobubnimPribory.state.zebra")
        t.js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z'}))")
        after = t.js("window.PobubnimPribory.state.zebra")
        check("горячая клавиша Z переключает зебру", before != after, (before, after))
        t.js("document.dispatchEvent(new KeyboardEvent('keydown', {key: 'z'}))")

        # ---------- 18. мобильная ширина ----------
        t.size(390, 844)
        time.sleep(0.8)
        t.js("window.dispatchEvent(new Event('resize')); window.PobubnimPribory.render(true)")
        time.sleep(0.4)
        over = t.jsobj("""(function () {
          return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                   app: (function () { var a = document.getElementById('sc-app');
                         return a.scrollWidth - a.clientWidth; })(),
                   btn: Math.round(document.getElementById('sc-screen').getBoundingClientRect().height) };
        })()""")
        check("телефон: страница не едет вбок", over["doc"] <= 2, over)
        check("телефон: рабочая область не едет вбок", over["app"] <= 2, over)
        check("телефон: кнопки под палец (≥40px)", over["btn"] >= 40, over)
        t.size(1400, 1000)

        # ---------- 19. ошибок в консоли нет ----------
        real = [e for e in t.errors if "favicon" not in e and "yandex" not in e.lower()]
        check("нет ошибок JS", not real, real[:3])

    finally:
        t.close()

    print()
    if fails:
        print("ПРОВАЛЫ:", len(fails))
        for f in fails:
            print("  ✗", f)
        sys.exit(1)
    print("Все проверки пройдены.")


main()
