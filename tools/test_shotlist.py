# -*- coding: utf-8 -*-
"""Приёмка шот-листа (instrumenty/shot-list.html) на живой странице.

Гоняет инструмент в headless Chrome как руками: набивает кадры пресетами,
проверяет нумерацию, счётчик смены, перебор, лист, сборку .docx и черновик
в localStorage. Падает с кодом 1 на первом расхождении.

Запуск:  python tools/test_shotlist.py [url]
         (по умолчанию http://localhost:8765/instrumenty/shot-list.html)
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9351
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/instrumenty/shot-list.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self, width=1280):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbchrome-"),
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
        # худший случай раскладки: системный шрифт вместо Inter (пока грузятся веб-шрифты)
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

    def js(self, expr, await_promise=False):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=await_promise)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            self.errors.append(str(res["exceptionDetails"].get("text")) + " " +
                               str(res["exceptionDetails"].get("exception", {}).get("description", "")))
            return None
        return res.get("result", {}).get("value")

    def goto(self, url, wait=2.2):
        self.cmd("Page.navigate", url=url)
        time.sleep(wait)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def main():
    t = Tab()
    try:
        t.goto(URL)

        # 1. чипы пресетов рисуются и меняются под тип съёмки
        n_svadba = t.js("document.querySelectorAll('#chips .chip').length")
        check("чипы свадьбы отрисованы", n_svadba and n_svadba >= 6, n_svadba)
        t.js("document.querySelector('input[name=kind][value=interv]').click()")
        time.sleep(0.3)
        first_interv = t.js("document.querySelector('#chips .chip').textContent")
        check("чипы сменились на интервью", "Герой" in (first_interv or ""), first_interv)
        t.js("document.querySelector('input[name=kind][value=svadba]').click()")
        time.sleep(0.3)

        # 2. «все кадры» набивают сцену, нумерация сквозная внутри сцены
        n_preset = n_svadba - 1                      # последний чип — «все кадры»
        check("пресетов свадьбы стало больше десятка", n_preset >= 12, n_preset)
        t.js("document.querySelector('#chips .chip.all').click()")
        time.sleep(0.5)
        shots = t.js("document.querySelectorAll('#scenes .shot').length")
        check("пресет набил все кадры", shots == n_preset, f"{shots} против {n_preset}")
        nums = t.js("[...document.querySelectorAll('#scenes .sn')].map(e=>e.textContent).join(',')")
        check("нумерация подряд от 1.1", nums.startswith("1.1,1.2,1.3"), nums[:24])

        # 2а. порядок кадров: стрелка вниз меняет местами соседей
        first = t.js("document.querySelector('#scenes .shot .what').value")
        second = t.js("document.querySelectorAll('#scenes .shot .what')[1].value")
        t.js("document.querySelector('#scenes .shot .down').click()")
        time.sleep(0.4)
        now1 = t.js("document.querySelector('#scenes .shot .what').value")
        now2 = t.js("document.querySelectorAll('#scenes .shot .what')[1].value")
        check("стрелка вниз переставила кадры", now1 == second and now2 == first,
              f"{now1} / {now2}")
        t.js("document.querySelectorAll('#scenes .shot .up')[1].click()")
        time.sleep(0.4)
        back = t.js("document.querySelector('#scenes .shot .what').value")
        check("стрелка вверх вернула порядок", back == first, back)

        # 2б. дубль кадра
        t.js("document.querySelector('#scenes .shot .copy-shot').click()")
        time.sleep(0.4)
        dup = t.js("document.querySelectorAll('#scenes .shot .what')[1].value")
        n_after = t.js("document.querySelectorAll('#scenes .shot').length")
        check("кнопка ⧉ дублирует кадр", dup == first and n_after == n_preset + 1,
              f"{dup} / {n_after}")
        t.js("document.querySelectorAll('#scenes .shot .del')[1].click()")
        time.sleep(0.4)

        # 2в. своё значение в списке (не из подсказок) доходит до листа
        t.js("(()=>{const i=document.querySelector('#scenes .shot .size');"
             "i.value='макро 1:1, своё';i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        paper_own = t.js("document.getElementById('paper').innerText")
        check("своё значение крупности попало в лист", "макро 1:1, своё" in (paper_own or ""), "")

        # 2г. кадр с края уезжает в соседнюю сцену
        t.js("document.getElementById('add-scene').click()")
        time.sleep(0.4)
        scenes_n = t.js("document.querySelectorAll('#scenes .scene').length")
        check("вторая сцена добавлена", scenes_n == 2, scenes_n)
        t.js("(()=>{const s=document.querySelectorAll('#scenes .scene')[1];"
             "s.querySelector('.shot .up').click();})()")
        time.sleep(0.5)
        in_first = t.js("document.querySelectorAll('#scenes .scene')[0].querySelectorAll('.shot').length")
        check("кадр с края уехал в прошлую сцену", in_first == n_preset + 1, in_first)
        # сцены меняются местами
        t.js("document.querySelectorAll('#scenes .scene')[0].querySelector('.down-scene').click()")
        time.sleep(0.5)
        top_scene_shots = t.js("document.querySelectorAll('#scenes .scene')[0].querySelectorAll('.shot').length")
        check("сцены переставляются", top_scene_shots == 1, top_scene_shots)
        t.js("document.querySelectorAll('#scenes .scene')[1].querySelector('.up-scene').click()")
        time.sleep(0.5)
        t.js("document.querySelectorAll('#scenes .scene')[1].querySelector('.del-scene').click()")
        time.sleep(0.5)
        t.js("(()=>{const s=document.querySelectorAll('#scenes .shot')[%s];if(s)s.querySelector('.del').click();})()" % str(n_preset))

        # 3. счётчик: 7 кадров × 15 мин + 60 мин запаса = 165 мин из 480
        d = t.js("JSON.stringify(window.PobubnimShotlist.calc())")
        d = json.loads(d) if d else {}
        check("счётчик считает все кадры", d.get("shots") == n_preset, d)
        check("счётчик: минуты по 15 на кадр", d.get("mins") == n_preset * 15, d)
        check("счётчик: плюс запас 60 мин", d.get("busy") == n_preset * 15 + 60, d)
        mtext = t.js("document.querySelector('#meter .mtext').textContent")
        check("текст счётчика человеческий",
              str(n_preset) + " кадров" in (mtext or "") and "из 8 ч" in (mtext or ""), mtext)

        # 4. свои минуты у кадра перебивают дефолт
        t.js("(()=>{const i=document.querySelector('#scenes .shot .min');"
             "i.value=45;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        d2 = json.loads(t.js("JSON.stringify(window.PobubnimShotlist.calc())"))
        check("свои минуты кадра перебивают дефолт",
              d2.get("mins") == n_preset * 15 - 15 + 45, d2)

        # 5. перебор смены красит счётчик
        t.js("(()=>{const i=document.getElementById('f-shift');"
             "i.value=1;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        over = t.js("document.getElementById('meter').classList.contains('over')")
        over_txt = t.js("document.querySelector('#meter .mtext').textContent")
        check("перебор смены помечен", over is True, over)
        check("перебор объяснён словами", "не влезает" in (over_txt or ""), over_txt)
        t.js("(()=>{const i=document.getElementById('f-shift');"
             "i.value=8;i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.3)

        # 6. лист собрался: заголовок сцены + таблица кадров + строка итога
        t.js("(()=>{const p=document.getElementById('f-proj');"
             "p.value='Свадьба Ани и Миши';p.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.4)
        paper = t.js("document.getElementById('paper').innerText")
        check("в листе имя проекта", "Свадьба Ани и Миши" in (paper or ""), (paper or "")[:80])
        check("в листе есть сцена", "Сцена 1" in (paper or ""), "")
        check("в листе есть итог", "Итого: " + str(n_preset) + " кадров" in (paper or ""), "")
        rows = t.js("document.querySelectorAll('#paper table.shots tr').length")
        check("в таблице листа все кадры + шапка", rows == n_preset + 1, rows)
        cols = t.js("document.querySelector('#paper table.shots').dataset.cols")
        check("ширины колонок для Word заданы (в сумме 100%)", cols == "6,38,15,17,14,10" and sum(map(int, cols.split(","))) == 100, cols)

        # 7. .docx реально собирается
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 8. черновик переживает перезагрузку
        time.sleep(0.8)
        t.goto(URL)
        proj = t.js("document.getElementById('f-proj').value")
        shots2 = t.js("document.querySelectorAll('#scenes .shot').length")
        note = t.js("!document.getElementById('draft-note').hidden")
        check("черновик восстановлен: проект", proj == "Свадьба Ани и Миши", proj)
        check("черновик восстановлен: кадры", shots2 == n_preset, shots2)
        check("про черновик сказано пользователю", note is True, note)

        # 9. кнопка очистки стирает всё
        t.js("document.getElementById('btn-clear').click()")
        time.sleep(0.5)
        after = t.js("document.querySelectorAll('#scenes .shot').length")
        stored = t.js("localStorage.getItem('pobubnim-shotlist-v1')")
        check("очистка вернула пустой лист", after == 1, after)
        check("очистка стёрла черновик", stored in (None, ""), stored)

        # 10. мобила: без горизонтального оверфлоу
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        t.js("document.querySelector('#chips .chip.all').click()")
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
