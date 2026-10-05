# -*- coding: utf-8 -*-
"""Карточки для поста в канал: вертикаль 1080×1350 из НАСТОЯЩИХ кадров досок.

Почему так, а не рисунком в редакторе: карточка обещает то, что человек увидит,
открыв страницу. Поэтому и картинка, и числа на ней берутся из живой доски —
скрипт открывает страницу, ставит доске нужное состояние, снимает её холст и
читает её же показания. Выдумать число здесь physически нечем.

Вёрстка карточки — HTML на локальном сервере сайта: тогда работают настоящие
шрифты и палитра (Inter Tight, Playfair Display italic, JetBrains Mono),
а не их приблизительные подобия из системных файлов.

Запуск:  python tools/build_post_cards.py [--base http://localhost:8765]
Результат: assets/post/card-N-<slug>.jpg  (1080×1350)
"""
from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket
from PIL import Image

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "post"
SRC = OUT / "src"
PORT = 9560
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE = "http://localhost:8765"
if "--base" in sys.argv:
    BASE = sys.argv[sys.argv.index("--base") + 1]

W, H = 1080, 1350

# ---------- что снимаем с досок ----------
# slug, id холста, состояние доски, область кропа (x, y, w, h) или None — весь холст
SHOTS = [
    # Ширина кропа ВСЕГДА 880 — во всю ширину холста. При ширине карточки 1080
    # и полях 68 картинка идёт с масштабом 1,07, то есть почти пиксель в пиксель.
    # Узкий кроп пришлось бы растягивать втрое, и подписи внутри доски мылились
    # (поймано на первой сборке 22.09).
    ("err-full", "tri-oshibki-cveta", "eb-frame",
     "PobubnimErr.state.err=1;PobubnimErr.state.s=0.6;PobubnimErr.draw()", None),
    ("err-top", "tri-oshibki-cveta", "eb-frame",
     "PobubnimErr.state.err=1;PobubnimErr.state.s=0.6;PobubnimErr.draw()", (0, 0, 880, 210)),
    ("window-full", "svet-iz-okna", "wb-frame",
     "PobubnimWindow.state.win=1.5;PobubnimWindow.state.rot=45;PobubnimWindow.state.refl=1;"
     "PobubnimWindow.state.d=0.5;PobubnimWindow.state.bg=1.5;PobubnimWindow.draw()", None),
    ("rawlog-full", "raw-ili-log", "rb-frame",
     "PobubnimRawLog.state.fmt=3;PobubnimRawLog.draw()", None),
    ("rawlog-bars", "raw-ili-log", "rb-frame",
     "PobubnimRawLog.state.fmt=3;PobubnimRawLog.draw()", (0, 252, 880, 166)),
    ("sound", "petlichka-ili-pushka", None, "", (0, 0, 880, 232)),
    ("flicker", "mercanie-na-video", "fb-frame",
     "PobubnimFlicker.state.read=3;PobubnimFlicker.draw()", (0, 0, 880, 232)),
]


# ---------- какие показания читаем ----------
PROBES = {
    "err": ("tri-oshibki-cveta",
            "PobubnimErr.state.err=1;PobubnimErr.state.s=0.6;PobubnimErr.draw();"
            "JSON.stringify({skin:PobubnimErr.measure(0).ire,gray:PobubnimErr.measure(1).ire})"),
    "window": ("svet-iz-okna",
               "(()=>{const B=PobubnimWindow;B.state.win=1.5;const R=B.winR();"
               "const f=d=>B.disc(R,d);"
               "return JSON.stringify({area:Math.log2(f(0.5)/f(2)),point:2*Math.log2(2/0.5)});})()"),
    "rawlog": ("raw-ili-log",
               "(()=>{const B=PobubnimRawLog;B.state.fmt=3;B.draw();"
               "return JSON.stringify({head:B.headroom(),clip:B.clipped()});})()"),
    # читаем ДВИЖОК доски, а не текст её строки показаний: разбор текста
    # регуляркой тихо отдавал «−13,6 д» и «?» вместо чисел (поймано 22.09)
    "sound": ("petlichka-ili-pushka",
              "JSON.stringify({edge:PobubnimSound.rc(),dr:PobubnimSound.dr(),"
              "wet:PobubnimSound.wet()})"),
    # состояние ТО ЖЕ, что на снятом кадре, иначе число и картинка разойдутся
    "flicker": ("mercanie-na-video",
                "PobubnimFlicker.state.read=3;PobubnimFlicker.draw();"
                "JSON.stringify({band:PobubnimFlicker.banding(),"
                "pulse:PobubnimFlicker.pulse()})"),
}


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbcards-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             "--force-device-scale-factor=1", "--window-size=1200,1400", "about:blank"],
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
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=90)
        self.mid = 0

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.mid:
                return m

    def js(self, expr):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        return r.get("result", {}).get("result", {}).get("value")

    def go(self, url, wait=3.4, ready=None):
        self.cmd("Page.navigate", url=url)
        deadline = time.time() + 25
        # ждём СОБЫТИЯ, а не «столько-то секунд»: на холодном старте шрифты и
        # движок доски поднимаются дольше, чем любая угаданная пауза
        while time.time() < deadline:
            time.sleep(0.4)
            if self.js("document.readyState") != "complete":
                continue
            if ready is None or self.js(ready):
                break
        else:
            raise RuntimeError("страница не поднялась: " + url)
        self.js("document.fonts && document.fonts.ready")
        time.sleep(wait)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def shoot_boards(t):
    """Снять кадры досок и прочитать их показания."""
    SRC.mkdir(parents=True, exist_ok=True)
    seen = {}
    for name, slug, canvas, state, crop in SHOTS:
        if seen.get("page") != slug:
            t.go(f"{BASE}/uroki/{slug}.html", wait=1.0,
                 ready="!!document.querySelector('.board canvas')")
            seen["page"] = slug
        if state:
            t.js(state)
            time.sleep(0.4)
        if canvas is None:
            canvas = t.js("(document.querySelector('.board canvas')||{}).id")
        data = t.js(f"document.getElementById('{canvas}').toDataURL('image/png')")
        if not data:
            raise RuntimeError(f"{slug}: холст {canvas} не отдал картинку")
        raw = base64.b64decode(data.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if crop:
            x, y, w, h = crop
            img = img.crop((x, y, x + w, y + h))
        img.save(SRC / f"{name}.png")
        print(f"  кадр {name}: {img.width}×{img.height}")
    vals = {}
    for key, (slug, expr) in PROBES.items():
        t.go(f"{BASE}/uroki/{slug}.html", wait=0.8,
             ready="!!document.querySelector('.board canvas')")
        vals[key] = t.js(expr)
    return vals


def num(v, digits=1):
    return f"{v:.{digits}f}".replace(".", ",")


def build_texts(v):
    """Числа карточек — из показаний живых досок, не из головы."""
    err = json.loads(v["err"])
    win = json.loads(v["window"])
    raw = json.loads(v["rawlog"])
    sound = json.loads(v["sound"])
    flick = json.loads(v["flicker"])

    return {
        "err": {"skin": num(err["skin"]) + " IRE", "gray": num(err["gray"]) + " IRE"},
        "win": {"area": "−" + num(win["area"], 2) + " ст.", "point": "−" + num(win["point"], 2) + " ст."},
        "raw": {"head": "+" + num(raw["head"], 1) + " ст.", "clip": str(raw["clip"])},
        "sound": {"edge": num(sound["edge"], 2) + " м",
                  "ratio": num(sound["dr"], 1) + " дБ",
                  "wet": str(round(sound["wet"] * 100)) + " %"},
        "flick": {"band": str(round(flick["band"] * 100)) + " %",
                  "pulse": str(round(flick["pulse"])) + " Гц"},
    }


CSS = """
:root{--ink:#f5efe2;--bg:#0b0a09;--char:#141211;--mute:#8a857a;--lamp:#f0c46e;
      --line:rgba(245,239,226,0.10);--warm:#e0553c}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;background:var(--bg);overflow:hidden}
body{font-family:'Inter Tight',system-ui,sans-serif;color:var(--ink);
     -webkit-font-smoothing:antialiased}
.card{width:1080px;height:1350px;padding:72px 68px;display:flex;flex-direction:column;justify-content:space-between;
      position:relative;background:
        radial-gradient(1100px 620px at 78% -8%, rgba(240,196,110,0.10), transparent 62%),
        radial-gradient(900px 560px at 6% 104%, rgba(198,214,240,0.07), transparent 60%),
        var(--bg)}
.top{display:flex;justify-content:space-between;align-items:baseline;
     font-family:'JetBrains Mono',monospace;font-size:19px;letter-spacing:0.16em;
     text-transform:uppercase;color:var(--mute)}
.top b{color:var(--ink);font-weight:500}
h1{font-size:82px;line-height:0.96;font-weight:600;letter-spacing:-0.035em;
   text-wrap:balance}
h1 em{font-family:'Playfair Display',serif;font-style:italic;font-weight:500;
      color:var(--lamp);letter-spacing:-0.01em}
h1.sm{font-size:68px}
.sub{margin-top:22px;font-size:30px;line-height:1.34;font-weight:300;color:#cfc8ba;
     max-width:880px;text-wrap:pretty}
.shot{margin:0 -68px;overflow:hidden;border-top:1px solid var(--line);
      border-bottom:1px solid var(--line);background:var(--char);
      box-shadow:0 40px 90px rgba(0,0,0,0.55)}
.grid2 .shot{margin:0;border:1px solid var(--line);border-radius:18px}
.shot img{display:block;width:100%}
.shot .bar{display:flex;justify-content:space-between;gap:20px;padding:15px 68px;
      white-space:nowrap;
      font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:0.1em;
      text-transform:uppercase;color:var(--mute);border-top:1px solid var(--line)}
.chips{display:flex;gap:14px;flex-wrap:wrap}
.chip{border:1px solid var(--line);border-radius:16px;padding:16px 22px;background:var(--char)}
.chip i{display:block;font-style:normal;font-family:'JetBrains Mono',monospace;
        font-size:15px;letter-spacing:0.12em;text-transform:uppercase;color:var(--mute)}
.chip b{display:block;font-size:34px;font-weight:600;letter-spacing:-0.02em;margin-top:8px}
.chip.warn b{color:var(--warm)}
.chip.lamp b{color:var(--lamp)}
.foot{display:flex;justify-content:space-between;align-items:center;
      font-family:'JetBrains Mono',monospace;font-size:19px;letter-spacing:0.12em;
      text-transform:uppercase;color:var(--mute)}
.foot b{color:var(--lamp);font-weight:500}
.grid2{display:grid;gap:18px}
.grid2 .shot .bar{padding:13px 18px;font-size:15px}
.big{font-size:132px;line-height:0.9;font-weight:600;letter-spacing:-0.045em}
.doc{border:1px solid var(--line);border-radius:20px;background:var(--char);padding:34px 32px}
.doc i{display:block;font-style:normal;font-family:'JetBrains Mono',monospace;font-size:16px;
       letter-spacing:0.12em;text-transform:uppercase;color:var(--lamp)}
.doc b{display:block;font-size:38px;font-weight:600;letter-spacing:-0.025em;margin-top:14px}
.doc span{display:block;font-size:24px;font-weight:300;color:#cfc8ba;margin-top:12px;line-height:1.35}
"""


def card_html(body):
    return f"""<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/fonts.css"><style>{CSS}</style></head>
<body>{body}</body></html>"""


def cards(x):
    """Шесть карточек. Числа приходят из живых досок словарём x."""
    return [
        ("oblozhka", f"""
<div class="card">
  <div>
    <div class="top"><span><b>ПОБУБНИМ</b> · pobubnim.ru</span><span>сентябрь 2026</span></div>
    <h1 style="margin-top:38px">Семь живых досок,<br>которые <em>считают</em>,<br>а не рассказывают</h1>
    <p class="sub">Физика площадки прямо в браузере. Крутите ползунок, приборы отвечают.
       Бесплатно и без регистрации.</p>
  </div>
  <div class="chips">
    <div class="chip lamp"><i>граница «голос / комната»</i><b>{x['sound']['edge']}</b></div>
    <div class="chip warn"><i>полосы на выдержке 1/60</i><b>{x['flick']['band']}</b></div>
    <div class="chip"><i>запас Rec.709 над серым</i><b>{x['raw']['head']}</b></div>
  </div>
  <div class="grid2">
    <div class="shot"><img src="src/err-top.png"></div>
    <div class="shot"><img src="src/rawlog-bars.png"></div>
  </div>
  <div class="foot"><span>свет · звук · цвет · оптика</span><b>15 уроков</b></div>
</div>"""),

        ("pribory", f"""
<div class="card">
  <div>
    <div class="top"><span>Урок 13 · цвет</span><span>живая доска</span></div>
    <h1 class="sm" style="margin-top:34px">Приборы читают<br><em>ваш кадр</em></h1>
    <p class="sub">Кадр считается из света, ошибка применяется по-настоящему,
       а waveform и вектроскоп читают получившиеся пиксели.</p>
  </div>
  <div class="chips">
    <div class="chip warn"><i>кожа</i><b>{x['err']['skin']}</b></div>
    <div class="chip"><i>её коридор</i><b>60–75 IRE</b></div>
    <div class="chip lamp"><i>серая карта</i><b>{x['err']['gray']}</b></div>
  </div>
  <div class="shot"><img src="src/err-full.png">
    <div class="bar"><span>творческий LUT поверх сырого log</span><span>линия кожи 123°</span></div>
  </div>
  <div class="foot"><span>карта в норме — а кадр испорчен</span><b>uroki/tri-oshibki-cveta</b></div>
</div>"""),

        ("okno", f"""
<div class="card">
  <div>
    <div class="top"><span>Урок 14 · свет</span><span>живая доска</span></div>
    <h1 class="sm" style="margin-top:34px">Обратный квадрат<br><em>врёт у окна</em></h1>
    <p class="sub">Отойти от окна полтора метра с полуметра до двух.
       Учебник обещает одно, физика площадного источника даёт другое.</p>
  </div>
  <div class="chips">
    <div class="chip"><i>обещали</i><b>{x['win']['point']}</b></div>
    <div class="chip lamp"><i>на деле</i><b>{x['win']['area']}</b></div>
    <div class="chip"><i>разница</i><b>почти вдвое</b></div>
  </div>
  <div class="shot"><img src="src/window-full.png">
    <div class="bar"><span>окно 1,5 м · герой в полуметре</span><span>сплошная — окно, пунктир — учебник</span></div>
  </div>
  <div class="foot"><span>меняет, где сажать человека</span><b>uroki/svet-iz-okna</b></div>
</div>"""),

        ("rawlog", f"""
<div class="card">
  <div>
    <div class="top"><span>Урок 15 · цвет</span><span>живая доска</span></div>
    <h1 class="sm" style="margin-top:34px">Где кончается<br><em>Rec.709</em></h1>
    <p class="sub">Сколько разных кодов файл тратит на каждую ступень экспозиции —
       и на какой ступени перестаёт тратить их вовсе.</p>
  </div>
  <div class="chips">
    <div class="chip"><i>запас над серым</i><b>{x['raw']['head']}</b></div>
    <div class="chip warn"><i>ступеней нет в файле</i><b>{x['raw']['clip']}</b></div>
    <div class="chip lamp"><i>у S-Log3</i><b>+6,5 ст.</b></div>
  </div>
  <div class="shot"><img src="src/rawlog-full.png">
    <div class="bar"><span>Rec.709, 10 бит</span><span>красным — чего в файле уже нет</span></div>
  </div>
  <div class="foot"><span>выбитое не вернёт ни один формат</span><b>uroki/raw-ili-log</b></div>
</div>"""),

        ("zvuk-mercanie", f"""
<div class="card">
  <div>
    <div class="top"><span>Уроки 09 и 12</span><span>звук · свет</span></div>
    <h1 class="sm" style="margin-top:34px">Две вещи, которые<br>решаются <em>на площадке</em></h1>
    <p class="sub">Где проходит граница, за которой микрофон слышит комнату громче человека.
       И почему в России снимают на 1/50, а не на 1/60.</p>
  </div>
  <div class="chips">
    <div class="chip lamp"><i>граница «голос / комната»</i><b>{x['sound']['edge']}</b></div>
    <div class="chip warn"><i>полосы на 1/60</i><b>{x['flick']['band']}</b></div>
  </div>
  <div class="grid2">
    <div class="shot"><img src="src/sound.png">
      <div class="bar"><span>петличка или пушка</span><span>{x['sound']['ratio']} голос / комната</span></div></div>
    <div class="shot"><img src="src/flicker.png">
      <div class="bar"><span>откуда в кадре полосы</span><span>пульсация {x['flick']['pulse']}</span></div></div>
  </div>
  <div class="foot"><span>на монтаже это уже не чинится</span><b>pobubnim.ru/uroki</b></div>
</div>"""),

        ("dokumenty", """
<div class="card">
  <div>
    <div class="top"><span>и два документа</span><span>конструктор · Word и PDF</span></div>
    <h1 class="sm" style="margin-top:34px">Бумаги, которые<br>обычно <em>ищут в панике</em></h1>
    <p class="sub">Заполняются в браузере за пару минут, выгружаются готовым файлом.
       Ничего никуда не отправляется.</p>
  </div>
  <div class="grid2" style="gap:22px">
    <div class="doc"><i>гл. 34 ГК РФ</i><b>Договор аренды видеотехники</b>
      <span>Опись с серийными номерами, расчёт смен, залог и акт приёма-передачи.
      Заполняется в браузере, выгружается в Word или PDF.</span></div>
    <div class="doc"><i>152-ФЗ · ст. 152.1 ГК РФ</i><b>Согласие на съёмку ребёнка</b>
      <span>Согласие законного представителя плюс отдельный лист на публикацию —
      он появляется, только если публикация действительно нужна.</span></div>
    <div class="doc"><i>и рядом ещё</i><b>Шестнадцать инструментов</b>
      <span>Смета и счёт, бриф, тайминг свадьбы, шот-лист, вызывной лист,
      калькуляторы ГРИП, ND и карты памяти, ставка за смену.</span></div>
  </div>
  <div class="foot"><span>бесплатно, без регистрации</span><b>pobubnim.ru/instrumenty</b></div>
</div>"""),
    ]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    t = Tab()
    try:
        print("Снимаю кадры досок:")
        vals = shoot_boards(t)
        x = build_texts(vals)
        print("Показания живых досок:", json.dumps(x, ensure_ascii=False))

        t.cmd("Emulation.setDeviceMetricsOverride", width=W, height=H,
              deviceScaleFactor=1, mobile=False)
        made = []
        for i, (name, body) in enumerate(cards(x), 1):
            page = OUT / f"_card-{name}.html"
            page.write_text(card_html(body), encoding="utf-8")
            t.go(f"{BASE}/assets/post/_card-{name}.html", wait=1.2,
                 ready="!!document.querySelector('.card')")
            shot = t.cmd("Page.captureScreenshot", format="png",
                         clip={"x": 0, "y": 0, "width": W, "height": H, "scale": 1})
            raw = base64.b64decode(shot["result"]["data"])
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            assert img.size == (W, H), f"размер {img.size}, ждали {(W, H)}"
            out = OUT / f"card-{i}-{name}.jpg"
            img.save(out, quality=92, optimize=True, subsampling=1)
            page.unlink()
            kb = out.stat().st_size // 1024
            print(f"  {out.name}: {img.width}×{img.height}, {kb} КБ")
            made.append(out)
    finally:
        t.close()
    print(f"\nГотово: {len(made)} карточек в {OUT}")


if __name__ == "__main__":
    main()
