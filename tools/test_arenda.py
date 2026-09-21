# -*- coding: utf-8 -*-
"""Приёмка конструктора договора аренды техники
(instrumenty/dogovor-arendy-tehniki.html).

Проверяется не «страница открылась», а то, ради чего инструмент существует:
  * арифметика смен, полусмены и скидки считается независимо на питоне и
    сверяется с тем, что посчитал браузер;
  * число смен берётся из дат, а не из поля, когда даты заданы;
  * опись без серийных номеров поднимает предупреждение (ст. 607 ГК РФ);
  * прокат меняет ТЕКСТ договора, а не только заголовок: срок до года,
    ремонт на арендодателе, запрет субаренды, надпись нотариуса;
  * залог тремя способами, включая «равен оценочной стоимости»;
  * неустойка за просрочку попадает в документ, а ссылка на ст. 622 стоит всегда;
  * акт — отдельный документ с описью, состоянием и второй половиной под возврат;
  * сумма прописью совпадает с цифрой;
  * на 375 px страница не разъезжается и опись остаётся заполняемой.

Запуск:  python tools/test_arenda.py [url]
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9482
URL = sys.argv[1] if len(sys.argv) > 1 else \
    "http://localhost:8765/instrumenty/dogovor-arendy-tehniki.html"

fails = []


def check(name, cond, got=""):
    print(("ok   " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


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
        if not tabs:
            raise RuntimeError("Chrome не поднялся")
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0
        self.errors = []
        self.cmd("Runtime.enable")
        self.cmd("Page.enable")

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
                "e.dispatchEvent(new Event('input',{bubbles:true}));"
                "e.dispatchEvent(new Event('change',{bubbles:true}));})()"
                % (el_id, json.dumps(str(value))))

    def pick(self, name, value):
        self.js("document.querySelector('input[name=%s][value=%s]').click()" % (name, value))

    def rows(self, items):
        self.js("PobubnimArenda.setRows(%s)" % json.dumps(items))

    def calc(self):
        return json.loads(self.js("JSON.stringify(PobubnimArenda.calc())"))

    def text(self):
        return self.js("document.getElementById('paper').innerText")

    def resize(self, w, h):
        self.cmd("Emulation.setDeviceMetricsOverride", width=w, height=h,
                 deviceScaleFactor=1, mobile=w < 700)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimArenda") == "object":
                return
        raise RuntimeError("страница не поднялась: нет PobubnimArenda")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


KIT = [
    {"name": "Камера Sony FX3", "sn": "SN-100200", "value": 350000, "rate": 4000, "qty": 1},
    {"name": "Объектив 24-70/2.8", "sn": "SN-77", "value": 180000, "rate": 1500, "qty": 2},
    {"name": "Свет 120 Вт", "sn": "SN-9", "value": 90000, "rate": 900, "qty": 3},
]


def expect(shifts, half, disc):
    """Независимый расчёт: тот же порядок действий, но написанный отдельно."""
    per = 4000 * 1 + 1500 * 2 + 900 * 3          # 4000 + 3000 + 2700 = 9700
    value = 350000 * 1 + 180000 * 2 + 90000 * 3  # 350000 + 360000 + 270000 = 980000
    rate = round(per * 0.7) if half else per
    full = rate * shifts
    d = 0 if half else disc
    discSum = round(full * d / 100)
    return {"perShift": per, "totalValue": value, "rate": rate,
            "full": full, "discSum": discSum, "rent": full - discSum}


def main():
    t = Tab()
    try:
        t.goto(URL)
        t.rows(KIT)

        # --- 1. арифметика: сверяем браузер с независимым расчётом ---
        for shifts, half, disc in [(1, False, 0), (3, False, 0), (5, False, 15),
                                   (1, True, 0), (4, True, 20)]:
            t.pick("shift", "half" if half else "full")
            t.set("f-from", "")
            t.set("f-to", "")
            t.set("f-shifts", shifts)
            t.set("f-disc", disc)
            time.sleep(0.25)
            c = t.calc()
            e = expect(shifts, half, disc)
            same = all(abs(c[k] - e[k]) < 1 for k in e)
            check(f"расчёт сходится: {shifts} смен, полусмена={half}, скидка {disc}%",
                  same, {k: (c.get(k), e[k]) for k in e if abs(c.get(k, 0) - e[k]) >= 1})

        # --- 2. скидка не складывается с полусменой (двойное снижение) ---
        t.pick("shift", "half")
        t.set("f-disc", 30)
        time.sleep(0.25)
        c = t.calc()
        check("на полусмене скидка за срок не применяется", c["disc"] == 0 and c["discSum"] == 0,
              c["disc"])
        check("поле скидки при полусмене заблокировано",
              t.js("document.getElementById('f-disc').disabled") is True)
        t.pick("shift", "full")
        t.set("f-disc", 0)

        # --- 3. смены считаются по датам и перебивают поле ---
        t.set("f-shifts", 1)
        t.set("f-from", "2026-10-01")
        t.set("f-to", "2026-10-04")
        time.sleep(0.3)
        c = t.calc()
        check("смены взяты из дат: 1-4 октября = 4 смены", c["shifts"] == 4 and c["auto"], c["shifts"])
        check("поле «смен вручную» спрятано, когда даты заданы",
              t.js("document.getElementById('wrap-shifts').hidden") is True)
        check("в договоре стоят обе даты",
              "01.10.2026" in t.text() and "04.10.2026" in t.text())
        t.set("f-from", "")
        t.set("f-to", "")
        time.sleep(0.25)
        check("без дат поле «смен вручную» возвращается",
              t.js("document.getElementById('wrap-shifts').hidden") is False)

        # --- 4. предупреждение про серийные номера (ст. 607 ГК РФ) ---
        t.rows([{"name": "Камера", "sn": "", "value": 300000, "rate": 4000, "qty": 1}])
        time.sleep(0.25)
        check("позиция без серийного номера поднимает предупреждение",
              t.js("document.getElementById('warn-sn').hidden") is False)
        t.rows(KIT)
        time.sleep(0.25)
        check("с номерами предупреждение гаснет",
              t.js("document.getElementById('warn-sn').hidden") is True)

        # --- 5. опись попадает в документ полностью ---
        txt = t.text()
        check("опись в договоре: все три позиции и их номера",
              all(x in txt for x in ["Камера Sony FX3", "SN-100200", "Объектив 24-70/2.8",
                                     "SN-77", "Свет 120 Вт", "SN-9"]))
        check("количество умножено: 2 объектива и 3 прибора в ставке",
              "9 700" in txt.replace("\u00a0", " ") or "9700" in txt)

        # --- 6. сумма прописью совпадает с цифрой ---
        t.set("f-shifts", 2)
        time.sleep(0.25)
        c = t.calc()
        txt = t.text()
        check("итог прописью стоит рядом с цифрой",
              f"{c['rent']:,}".replace(",", "\u00a0") in txt and "рубл" in txt,
              c["rent"])
        check("общая оценочная стоимость прописью есть в договоре",
              "980" in txt.replace("\u00a0", " ") and "девятьсот восемьдесят тысяч" in txt.lower())

        # --- 7. залог тремя способами ---
        t.pick("deposit", "none")
        time.sleep(0.2)
        check("без залога: в тексте сказано прямо",
              "Обеспечительный платёж по настоящему договору не вносится" in t.text())
        t.pick("deposit", "sum")
        t.set("f-deposit", 50000)
        time.sleep(0.25)
        check("своя сумма залога попала в документ", "50 000 ₽" in t.text().replace("\u00a0", " "))
        check("поле суммы залога показано",
              t.js("document.getElementById('wrap-deposit').hidden") is False)
        t.pick("deposit", "value")
        time.sleep(0.25)
        c = t.calc()
        check("залог «полная оценка» равен стоимости описи", c["deposit"] == 980000, c["deposit"])
        check("в тексте объяснено, что залог равен оценке",
              "равен общей оценочной стоимости" in t.text())
        check("ссылка на ст. 381.1 ГК РФ про обеспечительный платёж",
              "381.1" in t.text())

        # --- 8. просрочка возврата: ст. 622 всегда, неустойка по выбору ---
        t.set("f-penalty", 0)
        time.sleep(0.25)
        txt = t.text()
        check("ссылка на ст. 622 ГК РФ стоит и без неустойки", "622" in txt)
        check("без неустойки её в тексте нет", "кратной суточной ставки" not in txt)
        t.set("f-penalty", 2)
        time.sleep(0.25)
        check("неустойка 2 ставки в сутки попала в договор",
              "2-кратной суточной ставки" in t.text())

        # --- 9. ПРОКАТ меняет текст, а не только заголовок ---
        t.pick("vid", "arenda")
        time.sleep(0.25)
        a = t.text()
        t.pick("vid", "prokat")
        time.sleep(0.3)
        p = t.text()
        check("прокат: заголовок сменился", "ДОГОВОР ПРОКАТА" in p and "ДОГОВОР АРЕНДЫ" in a)
        check("прокат: срок не больше года (ст. 627)", "627" in p and "до одного года" in p)
        check("прокат: ремонт на арендодателе (ст. 631)",
              "631" in p and "обязанностью Арендодателя" in p)
        check("прокат: субаренда запрещена законом", "не допускаются" in p and "631" in p)
        check("прокат: проверка исправности при клиенте (ст. 628)", "628" in p)
        check("прокат: десятидневный срок устранения недостатков (ст. 629)", "629" in p)
        check("прокат: отказ арендатора с предупреждением за 10 дней", "десять дней" in p)
        check("прокат: переключатель субаренды спрятан",
              t.js("document.getElementById('wrap-sub').hidden") is True)
        check("прокат: подсказка о разнице показана",
              t.js("document.getElementById('hint-prokat').hidden") is False)
        check("аренда: ст. 615 про использование по назначению", "615" in a)
        check("аренда: ст. 616 про содержание", "616" in a)
        check("аренда: пунктов проката в обычном договоре нет",
              "627" not in a and "631" not in a)

        # --- 10. субаренда в обычной аренде двумя вариантами ---
        t.pick("vid", "arenda")
        t.pick("sub", "deny")
        time.sleep(0.25)
        check("субаренда запрещена: так и написано",
              "субаренду и передача прав" in t.text() or "не допускаются" in t.text())
        t.pick("sub", "allow")
        time.sleep(0.25)
        check("субаренда с согласия: ссылка на ст. 615",
              "предварительного письменного согласия" in t.text() and "615" in t.text())

        # --- 11. статусы сторон меняют реквизиты ---
        t.set("f-aname", "Иванов Иван Иванович")
        t.set("f-ainn", "770000000000")
        t.pick("akind", "selfemp")
        time.sleep(0.25)
        txt = t.text()
        check("самозанятый арендодатель: строка про налог на профессиональный доход",
              "профессиональный доход" in txt and "Мой налог" in txt)
        t.pick("akind", "ip")
        time.sleep(0.25)
        check("ИП: приписка в реквизитах",
              "Индивидуальный предприниматель Иванов Иван Иванович" in t.text())
        t.pick("akind", "org")
        t.set("f-adoc", "Иванова И.И.")
        time.sleep(0.25)
        check("компания: подписант и основание полномочий",
              "в лице Иванова И.И." in t.text() and "на основании Устава" in t.text())

        # --- 12. логистика и порядок оплаты ---
        t.pick("logi", "self")
        time.sleep(0.2)
        check("самовывоз: возврат силами арендатора", "силами и за счёт Арендатора" in t.text())
        t.pick("logi", "both")
        time.sleep(0.2)
        check("подача и забор: доставка силами арендодателя",
              "силами Арендодателя" in t.text())
        t.pick("pay", "after")
        time.sleep(0.2)
        check("оплата при возврате", "в день возврата Оборудования" in t.text())
        t.pick("pay", "half")
        time.sleep(0.2)
        check("половина вперёд", "50%" in t.text() and "остаток" in t.text())

        # --- 13. АКТ — отдельный документ ---
        t.js("PobubnimArenda.setMode('akt')")
        time.sleep(0.3)
        akt = t.text()
        check("акт: свой заголовок", "АКТ ПРИЁМА-ПЕРЕДАЧИ ОБОРУДОВАНИЯ" in akt)
        check("акт: опись с серийными номерами перенесена",
              "SN-100200" in akt and "Объектив 24-70/2.8" in akt)
        check("акт: колонка состояния при передаче", "Состояние при передаче" in akt)
        check("акт: вторая половина под возврат", "Возврат оборудования" in akt)
        check("акт: место под время передачи и возврата", "время" in akt.lower())
        check("акт: подписи обеих сторон дважды", akt.count("Подпись:") >= 4, akt.count("Подпись:"))
        check("акт: напоминание про серийные номера",
              "Акт без серийных номеров" in akt)
        check("акт: строка про залог есть, пока залог включён",
              "Обеспечительный платёж" in akt)
        t.js("PobubnimArenda.setMode('dogovor')")
        time.sleep(0.25)
        check("возврат на вкладку договора", "ДОГОВОР" in t.text() and "АКТ ПРИЁМА" not in t.text())

        # --- 14. мобильная раскладка ---
        t.resize(375, 800)
        time.sleep(0.5)
        sw = t.js("document.documentElement.scrollWidth")
        check("на 375 px страница не разъезжается", sw <= 376, sw)
        vis = t.js("(()=>{const r=document.querySelector('.rowa');if(!r)return 0;"
                   "const b=r.getBoundingClientRect();return Math.round(b.width);})()")
        check("строка описи помещается в экран", 0 < vis <= 375, vis)
        t.resize(1280, 900)

        # --- 15. ни одной ошибки в консоли за весь прогон ---
        check("консоль чистая", not t.errors, t.errors[:3])

    finally:
        t.close()

    print()
    if fails:
        print(f"ФЕЙЛОВ: {len(fails)}")
        for f in fails:
            print("  · " + f)
        sys.exit(1)
    print("Всё сошлось.")


if __name__ == "__main__":
    main()
