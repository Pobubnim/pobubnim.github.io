# -*- coding: utf-8 -*-
"""Приёмка конструктора КП (instrumenty/kommercheskoe-predlozhenie-na-videosemku.html).

Проверяет на живой странице: наборы под тип съёмки, таблицу вариантов, проверку КП
(все флаги, включая «одинаковый состав» и «дороже, но меньше»), предоплату и срок
действия против пересчёта на питоне, склонение правок, строки НДС и оферты,
письмо к КП, Word, черновик и «собрать заново», мобильную раскладку.

Запуск:  python tools/test_kp.py [url]
"""
import datetime
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

from _chrome import CHROME  # Windows или облако — tools/_chrome.py
PORT = 9523
URL = sys.argv[1] if len(sys.argv) > 1 else \
    "http://localhost:8765/instrumenty/kommercheskoe-predlozhenie-na-videosemku.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)[:160]))
    if not cond:
        fails.append(name)


def norm(s):
    return (s or "").replace(" ", " ").replace(" ", " ")


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
        self.cmd("Network.setBlockedURLs", urls=["*fonts.googleapis.com*", "*fonts.gstatic.com*",
                                                 "*mc.yandex.ru*"])

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
            self.errors.append(str(res["exceptionDetails"].get("text")) + " :: " + expr[:60])
            return None
        return res.get("result", {}).get("value")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimKP") == "object":
                return
        raise RuntimeError("страница не поднялась")

    def paper(self):
        return norm(self.js("document.getElementById('paper').innerText"))

    def fill(self, fid, value):
        self.js("(()=>{const e=document.getElementById(%s);e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()"
                % (json.dumps(fid), json.dumps(value)))
        time.sleep(0.15)

    def pick(self, name, value):
        self.js("document.querySelector('input[name=%s][value=\"%s\"]').click()" % (name, value))
        time.sleep(0.3)

    def price(self, i, value):
        self.js("(()=>{const e=document.querySelectorAll('#packs .pprice')[%d];e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (i, json.dumps(str(value))))
        time.sleep(0.15)

    def tick(self, row, j):
        self.js("document.querySelectorAll('#matrix .mrow')[%d].querySelector('input[data-j=\"%d\"]').click()"
                % (row, j))
        time.sleep(0.15)

    def missing(self):
        return [c["text"] for c in self.js("PobubnimKP.checks()") if not c["ok"]]

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def main():
    t = Tab()
    try:
        t.goto(URL)
        t.js("localStorage.removeItem('pobubnim-kp-v1')")
        t.goto(URL)

        # 1. исходный набор
        st = t.js("PobubnimKP.state()")
        check("три варианта по умолчанию", st["n"] == 3, st["n"])
        check("в составе не меньше восьми позиций", len(st["items"]) >= 8, len(st["items"]))
        check("цены не подставлены — их ставит исполнитель", all(p["price"] == "" for p in st["packs"]), st["packs"])
        p = t.paper()
        check("лист собран", "КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ" in p, p[:80])
        heads = t.js("[...document.querySelectorAll('#paper table.items tr:first-child th')].map(e=>e.innerText)")
        check("в таблице колонка на каждый вариант", len(heads) == 4, heads)
        check("советуемый вариант помечен звёздочкой", "★" in (heads[2] if len(heads) > 2 else ""), heads)
        miss = t.missing()
        check("пустое КП: проверка просит заказчика, задачу, цену, работы и контакт",
              any("Кому" in m for m in miss) and any("Задача" in m for m in miss)
              and any("нет цены" in m for m in miss) and any("похожая работа" in m for m in miss)
              and any("Контакт" in m for m in miss), miss)

        # 2. заполнение до зелёного
        t.fill("f-client", "ООО «Ромашка»")
        t.fill("f-person", "Анна")
        t.fill("f-task", "Нужен ролик для рекламы новой линейки во ВКонтакте, чтобы показать продукт в деле")
        t.fill("f-dur", "30 секунд")
        t.fill("f-where", "ВКонтакте, сайт")
        t.fill("f-contact", "+7 900 000-00-00")
        t.fill("f-links", "Ролик для кофейни — vk.com/video-1")
        t.fill("f-date", "2026-09-24")
        for i, v in enumerate((60000, 90000, 140000)):
            t.price(i, v)
        miss = t.missing()
        check("заполненное КП проходит проверку целиком", not miss, miss)
        meter = norm(t.js("document.querySelector('#doctor .mtext').innerText"))
        total = len(t.js("PobubnimKP.checks()"))
        check("счётчик проверки показывает полный счёт", ("Готово %d из %d" % (total, total)) in meter, meter)
        chip = norm(t.js("document.getElementById('kp-score').innerText"))
        check("счёт проверки виден и над листом", chip == "Проверка: %d из %d" % (total, total), chip)

        # 3. деньги и даты — против пересчёта на питоне
        p = t.paper()
        pre = round(90000 * 50 / 100)
        check("предоплата 50% от советуемого варианта",
              ("%s ₽" % format(pre, ",").replace(",", " ")) in p, p[p.find("Предоплата"):p.find("Предоплата") + 90])
        until = (datetime.date(2026, 9, 24) + datetime.timedelta(days=14)).strftime("%d.%m.%Y")
        check("срок действия = дата КП + 14 дней", ("Действует до " + until) in p and t.js("PobubnimKP.validUntil()") == until,
              t.js("PobubnimKP.validUntil()"))
        t.fill("f-valid", "30")
        until30 = (datetime.date(2026, 9, 24) + datetime.timedelta(days=30)).strftime("%d.%m.%Y")
        check("через границу месяца срок считается верно (30 дней)", t.js("PobubnimKP.validUntil()") == until30,
              t.js("PobubnimKP.validUntil()"))
        t.fill("f-valid", "14")
        for v in ("60 000 ₽", "90 000 ₽", "140 000 ₽"):
            check("цена %s в таблице" % v, v in p, "")
        t.fill("f-pre", "30")
        check("другой процент предоплаты пересчитан", "27 000 ₽" in t.paper(), "")
        t.fill("f-pre", "50")

        # 4. склонение правок
        for r, want in (("1", "1 раунд правок"), ("3", "3 раунда правок"), ("5", "5 раундов правок"),
                        ("21", "21 раунд правок"), ("0", "Правки после сдачи оплачиваются отдельно")):
            t.fill("f-rounds", r)
            check("правки: " + want, want in t.paper(), "")
        t.fill("f-rounds", "2")

        # 5. одинаковый состав и «дороже, но меньше»
        rows = t.js("PobubnimKP.state().items.map(i=>i.on)")
        diff = [i for i, on in enumerate(rows) if on[0] != on[1]]
        for i in diff:
            t.tick(i, 1)
        miss = t.missing()
        check("два варианта с одним составом — флаг «наценка, а не выбор»",
              any("не составом" in m for m in miss), miss)
        for i in diff:
            t.tick(i, 1)
        check("состав вернули — флаг снят", not any("не составом" in m for m in t.missing()), t.missing())
        t.price(0, 100000)
        miss = t.missing()
        check("вариант дороже, но меньше по составу — флаг", any("дороже" in m and "меньше" in m for m in miss), miss)
        t.price(0, 60000)
        check("цена вернулась — флаг снят", not t.missing(), t.missing())

        # 6. оферта и НДС
        p = t.paper()
        check("строка «не является офертой» по умолчанию", "не является офертой (ст. 435 ГК РФ)" in p, "")
        t.js("document.getElementById('f-offer').click()")
        time.sleep(0.3)
        check("галочка снимает строку об оферте", "офертой" not in t.paper(), "")
        t.js("document.getElementById('f-offer').click()")
        time.sleep(0.3)
        check("самозанятому — НДС не облагается и НПД", "налог на профессиональный доход" in t.paper(), "")
        t.pick("who", "ooo")
        check("компании по умолчанию строка НДС не пишется", "НДС" not in t.paper(), "")
        t.js("(()=>{const s=document.getElementById('f-nds');s.value='incl';"
             "s.dispatchEvent(new Event('change',{bubbles:true}));})()")
        time.sleep(0.3)
        check("НДС «включён в цену»", "Цены указаны с учётом НДС." in t.paper(), "")
        t.js("(()=>{const s=document.getElementById('f-nds');s.value='';"
             "s.dispatchEvent(new Event('change',{bubbles:true}));})()")
        t.pick("who", "selfemp")

        # 7. письмо к КП
        L = norm(t.js("PobubnimKP.letterText()"))
        check("письмо: обращение по имени", L.startswith("Здравствуйте, Анна!"), L[:40])
        check("письмо: вилка цен от минимума до максимума", "от 60 000 ₽ до 140 000 ₽" in L, L)
        check("письмо: какой вариант советуем", "Советую «Оптимальный»" in L, L)
        check("письмо: срок действия", ("действует до " + until) in L, L)
        t.js("document.getElementById('tab-letter').click()")
        time.sleep(0.3)
        check("вкладка письма показывает письмо", "Здравствуйте, Анна!" in t.paper(), t.paper()[:60])
        t.js("document.getElementById('tab-kp').click()")
        time.sleep(0.3)

        # 8. число вариантов
        t.pick("n", "2")
        heads = t.js("[...document.querySelectorAll('#paper table.items tr:first-child th')].length")
        check("два варианта — три колонки", heads == 3, heads)
        t.pick("n", "1")
        p = t.paper()
        check("один вариант — без «советую» и без звёздочки", "Советую" not in p and "★" not in p, "")
        check("один вариант — проверка не ищет различий", not any("составом" in m for m in t.missing()), t.missing())
        t.pick("n", "3")

        # 9. Word
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check(".docx собран (>3 КБ)", size and size > 3000, size)

        # 10. смена типа съёмки
        t.pick("kind", "svadba")
        st = t.js("PobubnimKP.state()")
        check("свадьба: свой состав", any(i["name"] == "Свадебный фильм" for i in st["items"]), "")
        check("при смене типа заказчик и контакт сохранились",
              st["client"] == "ООО «Ромашка»" and st["contact"] == "+7 900 000-00-00", st["client"])
        check("при смене типа цены сброшены (состав другой)", all(p["price"] == "" for p in st["packs"]), st["packs"])

        # 11. черновик
        t.price(1, 75000)
        time.sleep(0.9)
        t.goto(URL)
        st = t.js("PobubnimKP.state()")
        check("черновик вернул тип и цену", st["kind"] == "svadba" and str(st["packs"][1]["price"]) == "75000", st["packs"])
        check("про черновик сказано", t.js("!document.getElementById('draft-note').hidden") is True, "")
        check("кнопка «Ссылка на расчёт» на месте", t.js("!!document.getElementById('btn-share')") is True, "")
        t.js("document.getElementById('btn-reset').click()")
        time.sleep(0.5)
        st = t.js("PobubnimKP.state()")
        check("«собрать заново» сбросил цены, но оставил заказчика",
              all(p["price"] == "" for p in st["packs"]) and st["client"] == "ООО «Ромашка»", st["packs"])

        # 12. мобила
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850, deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        time.sleep(0.6)
        sw, cw = t.js("document.documentElement.scrollWidth"), t.js("document.documentElement.clientWidth")
        check("мобила 375 без оверфлоу", sw <= cw + 1, f"{sw} > {cw}")

        check("без ошибок в консоли", not t.errors, t.errors[:3])
    finally:
        t.close()

    print(("\nПРОВАЛЕНО: " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
