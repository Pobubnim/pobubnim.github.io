# -*- coding: utf-8 -*-
"""Приёмка конструктора договоров (konstruktor-dogovora.html).

Проверяет вариативность и юридические формулировки: статусы сторон
(физлицо, самозанятый, ИП, компания, НКО), паспорт с пропиской в реквизитах,
режимы даты и времени съёмки, переработку, сроки сдачи, НДС, формы брони,
момент оплаты, способы расчётов (включая взаимозачёт и бартер), права на
материалы, персональные данные, автонумерацию пунктов и сборку акта и .docx.

Запуск:  python tools/test_dogovor.py [url]
"""
import base64
import io
import json
import re
import subprocess
import tempfile
import sys
import time
import urllib.request
import zipfile
from xml.dom import minidom

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9462
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/konstruktor-dogovora.html"

fails = []


def check(name, cond, got=""):
    print(("ok  " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
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
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        self.mid = 0
        self.errors = []
        self.cmd("Runtime.enable")
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

    def js(self, expr):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            self.errors.append(str(res["exceptionDetails"].get("text")))
            return None
        return res.get("result", {}).get("value")

    def pick(self, name, value):
        self.js(f"document.querySelector('input[name=\"{name}\"][value=\"{value}\"]').click()")

    def set(self, el_id, value):
        self.js("(()=>{const e=document.getElementById(%s);e.value=%s;"
                "e.dispatchEvent(new Event('input',{bubbles:true}));"
                "e.dispatchEvent(new Event('change',{bubbles:true}));})()"
                % (json.dumps(el_id), json.dumps(value)))

    def toggle(self, el_id, on):
        self.js("(()=>{const e=document.getElementById(%s);if(e.checked!==%s)e.click();})()"
                % (json.dumps(el_id), "true" if on else "false"))

    def text(self):
        """текст листа; неразрывные пробели из toLocaleString → обычные"""
        return (self.js("document.getElementById('paper').innerText") or "").replace(" ", " ")

    def hidden(self, el_id):
        return self.js(f"document.getElementById('{el_id}').hidden")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(20):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimDogovor") == "object":
                return
        raise RuntimeError("страница не поднялась")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def numbering_ok(txt):
    """пункты внутри каждого раздела идут подряд с 1, разделы — с 1"""
    pairs = [tuple(int(x) for x in m) for m in re.findall(r"^(\d+)\.(\d+)\.", txt, re.M)]
    if not pairs:
        return False, "пунктов нет"
    seen = {}
    for sec, sub in pairs:
        exp = seen.get(sec, 0) + 1
        if sub != exp:
            return False, f"{sec}.{sub} после {sec}.{exp - 1}"
        seen[sec] = sub
    secs = sorted(seen)
    if secs != list(range(1, len(secs) + 1)):
        return False, secs
    return True, secs


def main():
    t = Tab()
    try:
        t.goto(URL)

        # 1. каркас
        check("лист собрался", len(t.text()) > 3000, len(t.text()))
        check("виды проекта расширены",
              t.js("document.querySelectorAll('#f-kind option').length") >= 30,
              t.js("document.querySelectorAll('#f-kind option').length"))
        check("поля реквизитов нарисованы на обе стороны",
              t.js("document.querySelectorAll('#req-exec input, #req-exec select').length") == 18
              and t.js("document.querySelectorAll('#req-client input, #req-client select').length") == 18,
              t.js("document.querySelectorAll('#req-exec input, #req-exec select').length"))

        # 2. документ (паспорт) с пропиской
        check("документ по умолчанию — паспорт",
              t.js("document.getElementById('f-exec-doc').value") == "Паспорт гражданина РФ",
              t.js("document.getElementById('f-exec-doc').value"))
        t.set("f-exec-pser", "45 12 345678")
        t.set("f-exec-pby", "ОВД района Хамовники г. Москвы")
        t.set("f-exec-pdate", "2015-03-12")
        t.set("f-exec-pcode", "770-053")
        t.set("f-exec-addr", "143300, Московская обл., г. Наро-Фоминск, ул. Ленина, д. 1")
        txt = t.text()
        check("паспорт с «кем выдан» в реквизитах",
              "Паспорт гражданина РФ: серия и номер 45 12 345678, выдан ОВД района Хамовники г. Москвы, "
              "12.03.2015, код подразделения 770-053" in txt, txt[-400:])
        check("прописка в реквизитах", "Адрес регистрации: 143300" in txt, "")
        t.toggle("f-exec-pass-on", False)
        check("документ убирается галочкой", "45 12 345678" not in t.text(), "")
        check("поля документа спрятались", t.hidden("w-exec-pser") is True, "")
        t.toggle("f-exec-pass-on", True)
        t.set("f-exec-doc", "Вид на жительство")
        check("тип документа переключается",
              "Вид на жительство: серия и номер 45 12 345678" in t.text(), "")
        t.set("f-exec-doc", "Паспорт гражданина РФ")

        # 3. статусы сторон: ИП, компания, НКО
        t.pick("executor", "ip")
        t.set("f-exec-name", "Иванов Иван Иванович")
        t.set("f-exec-ogrn", "318500700012345")
        t.set("f-exec-inn", "503001234567")
        t.set("f-exec-acc", "40802810000000000000")
        t.set("f-exec-bank", "ПАО Сбербанк")
        t.set("f-exec-bik", "044525225")
        t.set("f-exec-corr", "30101810400000000225")
        txt = t.text()
        check("ИП с ОГРНИП",
              "Индивидуальный предприниматель Иванов Иван Иванович, ОГРНИП 318500700012345" in txt, "")
        check("банковские реквизиты ИП",
              "Р/с: 40802810000000000000, банк: ПАО Сбербанк, БИК: 044525225, к/с: 30101810400000000225" in txt, "")
        t.pick("client", "ooo")
        t.set("f-client-name", "ООО «Ромашка»")
        t.set("f-client-signer", "генерального директора Смирнова П. А.")
        t.set("f-client-basis", "Устава")
        t.set("f-client-kpp", "503001001")
        t.set("f-client-addr", "г. Москва, ул. Тверская, д. 5")
        txt = t.text()
        check("подписант компании",
              "в лице генерального директора Смирнова П. А., действующего на основании Устава" in txt, "")
        check("КПП и юр. адрес компании",
              "КПП: 503001001" in txt and "Юридический адрес: г. Москва" in txt, "")
        check("у компании документ о регистрации",
              t.js("document.getElementById('f-client-doc').value") == "Лист записи ЕГРЮЛ",
              t.js("document.getElementById('f-client-doc').value"))
        t.set("f-client-pser", "2125000123456")
        t.set("f-client-pby", "Межрайонная ИФНС России № 46 по г. Москве")
        t.set("f-client-pdate", "2012-04-05")
        check("лист записи ЕГРЮЛ с органом и датой",
              "Лист записи ЕГРЮЛ: № 2125000123456, выдан Межрайонная ИФНС России № 46 по г. Москве, 05.04.2012"
              in t.text(), "")
        check("кода подразделения у организации нет", t.hidden("w-client-pcode") is True, "")
        t.pick("client", "nko")
        check("НКО отмечена в преамбуле", "(некоммерческая организация)" in t.text(), "")
        check("у НКО документ — свидетельство о регистрации",
              t.js("document.getElementById('f-client-doc').value") == "Свидетельство о регистрации НКО",
              t.js("document.getElementById('f-client-doc').value"))
        t.set("f-client-doc", "Свидетельство о государственной регистрации")
        t.pick("client", "fiz")
        check("выбранный руками документ не сбрасывается статусом",
              t.js("document.getElementById('f-client-doc').value") == "Свидетельство о государственной регистрации",
              t.js("document.getElementById('f-client-doc').value"))
        t.js("(()=>{const e=document.getElementById('f-client-doc');delete e.dataset.touched;})()")
        t.pick("client", "ip")
        t.pick("client", "fiz")

        # 4. дата съёмки: точная, период, по согласованию, без даты
        t.pick("service", "video")
        t.set("f-date", "2026-09-12")
        check("точная дата", "Съёмка проводится «12.09.2026»" in t.text(), "")
        t.pick("datemode", "range")
        t.set("f-date-to", "2026-09-14")
        check("период съёмки",
              "Съёмка проводится в период с «12.09.2026» по «14.09.2026»" in t.text(), "")
        t.pick("datemode", "agree")
        t.set("f-agree-days", "30")
        txt = t.text()
        check("дата по согласованию",
              "Дата съёмки определяется дополнительным согласованием Сторон" in txt
              and "в течение 30 календарных дней" in txt, "")
        check("согласование ссылается на пункт о переписке",
              re.search(r"\(пункт \d+\.\d+ Договора\)", txt) is not None, "")
        t.pick("datemode", "none")
        check("дату можно убрать",
              "Дата, время и место съёмки согласуются Сторонами дополнительно" in t.text(), "")
        t.pick("datemode", "date")

        # 5. время съёмки: окно, лимит часов, без времени
        t.set("f-hours", "с 14:00 до 20:00")
        check("часы «с» и «до»", "с 14:00 до 20:00" in t.text(), "")
        t.pick("timemode", "hours")
        t.set("f-hours-n", "8")
        check("ровно N часов", "продолжительность съёмки — 8 ч. (включая перерывы)" in t.text(), "")
        t.pick("timemode", "none")
        check("время можно убрать", "14:00" not in t.text() and "8 ч." not in t.text(), "")

        # 6. переработка
        t.pick("otmode", "paid")
        t.set("f-overtime", "3000")
        check("переработка по ставке", "3 000 ₽ за каждый начатый час" in t.text(), "")
        t.pick("otmode", "agree")
        check("переработка по согласованию",
              "стоимость такой работы Стороны согласуют до её начала" in t.text(), "")
        t.pick("otmode", "none")
        check("переработку можно убрать", "сверх согласованного времени" not in t.text(), "")

        # 7. хронометраж и срок сдачи
        t.set("f-runtime", "2–4 минуты")
        check("хронометраж в составе результата", "хронометражом 2–4 минуты" in t.text(), "")
        t.set("f-days", "30")
        check("срок в днях", "не позднее 30 календарных дней с даты съёмки" in t.text(), "")
        t.pick("dlmode", "date")
        t.set("f-dl-date", "2026-10-01")
        check("точная дата сдачи", "не позднее «01.10.2026»" in t.text(), "")
        t.pick("dlmode", "agree")
        check("срок сдачи по согласованию с запасом",
              "если срок не согласован, Материалы передаются в течение 30 (тридцати) календарных дней" in t.text(), "")
        t.pick("dlmode", "days")

        # 8. деньги: НДС, задаток, момент оплаты
        t.set("f-price", "120000")
        t.set("f-vat", "22")
        check("НДС 22% выделен из суммы",
              "в том числе НДС 22% — 21 639,34 ₽".replace(" ", "\u00a0") in t.text().replace(" ", "\u00a0"),
              t.text()[t.text().find("Стоимость Услуг"):][:140])
        t.set("f-vat", "5")
        check("НДС 5% пересчитан",
              "5\u00a0714,29" in t.text().replace(" ", "\u00a0"), "")
        t.set("f-vat", "none")
        check("без НДС", "НДС не облагается" in t.text(), "")
        t.pick("bron", "zadatok")
        t.set("f-bron-sum", "60000")
        txt = t.text()
        check("задаток прямо квалифицирован",
              "является именно задатком в смысле статей 380 и 381 ГК РФ, а не авансом" in txt, "")
        check("ссылка на пункт о последствиях задатка живая",
              re.search(r"\(пункт (\d+\.\d+) Договора\)\. При надлежащем", txt) is not None, "")
        check("двойной задаток при отказе исполнителя",
              "уплачивает Заказчику двойную сумму задатка" in txt, "")
        t.set("f-paywhen", "after")
        check("оплата сразу по окончании съёмки",
              "в день съёмки, непосредственно по её окончании" in t.text(), "")
        t.pick("bron", "none")
        check("без предоплаты открывается полная оплата при подписании",
              t.js("!document.querySelector('#f-paywhen option[value=\"prepay\"]').hidden") is True, "")
        t.set("f-paywhen", "prepay")
        check("полная оплата при подписании",
              "Оплата производится в полном объёме при подписании Договора" in t.text(), "")
        t.pick("bron", "avans")
        check("возврат к авансу сбрасывает недопустимый вариант",
              t.js("document.getElementById('f-paywhen').value") != "prepay", "")

        # 9. способы расчётов
        t.pick("pay", "bank")
        check("безнал: момент исполнения обязательства",
              "с момента зачисления денежных средств на счёт Исполнителя" in t.text(), "")
        t.pick("client", "ooo")
        t.pick("pay", "cash")
        check("наличные с ИП и компанией — лимит 100 000 ₽",
              "5348-У" in t.text() and "100 000 (ста тысяч) рублей" in t.text(), "")
        check("подсказка про лимит наличных видна", t.hidden("hint-cash") is False, "")
        t.pick("client", "fiz")
        check("с физлицом лимита наличных нет", "5348-У" not in t.text(), "")
        t.pick("pay", "offset")
        check("взаимозачёт по ст. 410",
              "прекращается зачётом встречного однородного требования" in t.text()
              and "статья 410 ГК РФ" in t.text(), "")
        t.pick("pay", "barter")
        check("бартер: правила о мене", "правила о мене (глава 31 ГК РФ)" in t.text(), "")
        t.pick("pay", "other")
        t.set("f-pay-other", "аккредитив в банке Заказчика")
        check("свой способ расчётов", "аккредитив в банке Заказчика" in t.text(), "")
        t.toggle("f-pay-third", True)
        check("оплата третьим лицом (ст. 313)", "статья 313 ГК РФ" in t.text(), "")
        t.toggle("f-pay-third", False)

        # 10. налоги исполнителя
        t.pick("executor", "selfemp")
        t.pick("pay", "card")
        check("чек НПД на карту — в момент расчёта",
              "чек в приложении «Мой налог» — в момент расчёта" in t.text(), "")
        t.pick("pay", "bank")
        check("чек НПД безналом — до 9-го числа",
              "не позднее 9-го числа месяца, следующего за месяцем" in t.text(), "")
        t.pick("pay", "barter")
        check("бартер и НПД: натуральная форма не облагается",
              "пункт 11 части 2 статьи 6 Федерального закона от 27.11.2018 № 422-ФЗ" in t.text(), "")
        check("подсказка про бартер и НПД видна", t.hidden("hint-barter") is False, "")
        t.pick("pay", "bank")
        t.pick("executor", "fiz")
        t.pick("client", "ooo")
        txt = t.text()
        check("НДФЛ и взносы при исполнителе-физлице",
              "налоговым агентом" in txt and "статья 226 НК РФ" in txt
              and "включает удерживаемый НДФЛ" in txt, "")
        t.pick("executor", "ip")
        t.pick("client", "fiz")

        # 11. права на материалы
        t.pick("rights", "commercial")
        txt = t.text()
        check("лицензия перечисляет способы использования",
              "статья 1270 ГК РФ" in txt and "доведение до всеобщего сведения" in txt, "")
        check("срок и территория лицензии названы",
              "весь срок действия исключительного права, территория — все страны мира" in txt, "")
        t.set("f-lic-term", "five")
        t.set("f-lic-terr", "rf")
        check("срок и территория переключаются",
              "5 (пять) лет с даты подписания Договора, территория — территория Российской Федерации" in t.text(), "")
        t.toggle("f-derive", False)
        check("переработку можно запретить",
              "Переработка Материалов без письменного согласия Исполнителя не допускается" in t.text(), "")
        t.set("f-rights-fee", "10000")
        check("вознаграждение за права выделено суммой",
              "и составляет 10 000 (десять тысяч) рублей" in t.text(), "")
        t.pick("rights", "full")
        check("отчуждение по ст. 1234/1285/1288",
              "отчуждает Заказчику исключительное право на Материалы в полном объёме" in t.text(), "")
        t.pick("rights", "personal")
        check("личная лицензия без коммерции",
              "не связанных с предпринимательской деятельностью целях" in t.text(), "")

        # 12. персональные данные и ответственность
        txt = t.text()
        check("раздел о персональных данных",
              "пункта 5 части 1 статьи 6 Федерального закона от 27.07.2006 № 152-ФЗ" in txt, "")
        check("согласие за несовершеннолетних даёт представитель",
              "в отношении несовершеннолетних согласие даёт законный представитель" in txt, "")
        check("ограничение ответственности не действует против потребителя",
              "Ограничение не применяется, если Заказчик — гражданин" in txt, "")
        check("подсудность потребителя по ЗоЗПП", "статьёй 17 Закона РФ" in txt, "")
        check("отказ исполнителя — с возмещением убытков",
              "возмещает Заказчику убытки в полном объёме" in txt, "")

        # 13. нумерация и плейсхолдеры
        ok, got = numbering_ok(txt)
        check("нумерация пунктов сплошная", ok, got)
        check("перекрёстные ссылки подставлены", "{{" not in txt, "")

        # 14. акт и Word
        t.js("document.getElementById('tab-akt').click()")
        akt = t.text()
        check("акт собирается", "АКТ ОБ ОКАЗАННЫХ УСЛУГАХ" in akt, "")
        check("в акте те же реквизиты", "ОГРНИП 318500700012345" in akt, "")
        check("акт без плейсхолдеров", "{{" not in akt, "")
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check("акт .docx собран (>3 КБ)", size and size > 3000, size)
        t.js("document.getElementById('tab-dogovor').click()")
        size = t.js("PobubnimDocx.build(document.getElementById('paper')).size")
        check("договор .docx собран (>8 КБ)", size and size > 8000, size)
        b64 = t.js("(async()=>{const b=await PobubnimDocx.build(document.getElementById('paper'))"
                   ".arrayBuffer();const u=new Uint8Array(b);let s='';"
                   "for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s);})()"
                   ) or t.js("(()=>{return window.__docx||''})()")
        if not b64:  # promise не развернулся — берём через await-обёртку CDP
            t.js("PobubnimDocx.build(document.getElementById('paper')).arrayBuffer()"
                 ".then(b=>{const u=new Uint8Array(b);let s='';"
                 "for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);window.__docx=btoa(s);})")
            time.sleep(0.6)
            b64 = t.js("window.__docx || ''")
        try:
            zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(b64)))
            bad = zf.testzip()
            doc = zf.read("word/document.xml").decode("utf-8")
            minidom.parseString(doc)
            ok_docx = bad is None and "Паспорт гражданина РФ" in doc and "152-ФЗ" in doc
        except Exception as e:  # noqa: BLE001
            ok_docx, e_txt = False, str(e)
        else:
            e_txt = ""
        check("Word-файл распаковывается, XML валиден, паспорт и ПДн внутри", ok_docx, e_txt)

        # 15. подсветка правки в листе
        t.goto(URL)
        t.js("document.getElementById('paper').scrollTop = 0")
        t.pick("bron", "zadatok")
        time.sleep(0.3)
        check("правка подсвечена в листе",
              t.js("document.querySelectorAll('#paper .hit').length") >= 1,
              t.js("document.querySelectorAll('#paper .hit').length"))
        check("подсвечен именно изменившийся пункт",
              "задаток" in (t.js("document.querySelector('#paper .hit').innerText") or "").lower(),
              t.js("document.querySelector('#paper .hit') && document.querySelector('#paper .hit').innerText.slice(0,60)"))
        check("лист подкрутился к правке",
              t.js("(()=>{const p=document.getElementById('paper'),e=p.querySelector('.hit');"
                   "if(!e)return false;const pr=p.getBoundingClientRect(),er=e.getBoundingClientRect();"
                   "return er.bottom>pr.top && er.top<pr.bottom;})()") is True, "")
        time.sleep(1.9)
        check("подсветка гаснет",
              t.js("document.querySelectorAll('#paper .hit.hit-off').length") >= 1, "")
        t.js("document.getElementById('tab-akt').click()")
        time.sleep(0.3)
        check("смена вкладки не подсвечивает документ целиком",
              t.js("document.querySelectorAll('#paper .hit').length") == 0,
              t.js("document.querySelectorAll('#paper .hit').length"))
        t.js("document.getElementById('tab-dogovor').click()")

        # 16. мобила: лист виден всегда
        t.cmd("Emulation.setDeviceMetricsOverride", width=375, height=850,
              deviceScaleFactor=1, mobile=True)
        t.goto(URL)
        time.sleep(0.6)
        sw = t.js("document.documentElement.scrollWidth")
        cw = t.js("document.documentElement.clientWidth")
        check("мобила 375 без оверфлоу", sw <= cw + 1, f"{sw} > {cw}")
        check("на мобиле лист закреплён",
              t.js("getComputedStyle(document.querySelector('.paper-col')).position") == "sticky",
              t.js("getComputedStyle(document.querySelector('.paper-col')).position"))
        t.js("window.scrollTo(0, document.querySelector('.builder').offsetTop + 1200)")
        time.sleep(0.4)
        check("лист остаётся на экране при прокрутке формы",
              t.js("(()=>{const r=document.getElementById('paper').getBoundingClientRect();"
                   "return r.top < innerHeight && r.bottom > 0 && r.height > 80;})()") is True,
              t.js("JSON.stringify(document.getElementById('paper').getBoundingClientRect())"))

        check("без ошибок в консоли", not t.errors, t.errors[:2])
    finally:
        t.close()

    print(("\nПРОВАЛЕНО: " + ", ".join(fails)) if fails else "\nВсё сошлось")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
