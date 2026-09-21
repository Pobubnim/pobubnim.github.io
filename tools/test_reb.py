# -*- coding: utf-8 -*-
"""Приёмка конструктора согласия на съёмку ребёнка
(instrumenty/soglasie-na-semku-rebenka.html).

Главная проверка — та, ради которой инструмент и сделан: согласие на
РАСПРОСТРАНЕНИЕ персональных данных оформляется ОТДЕЛЬНЫМ документом
(ч. 6 ст. 10.1 Федерального закона № 152-ФЗ). Значит второй лист обязан
появляться ровно тогда, когда отмечено хотя бы одно место публикации,
и исчезать, когда публикации нет. Плюс: кем приходится представитель
меняет и формулировку, и документ-основание; запрещённые категории данных
помечены «нет» ВСЕГДА; ссылки на нормы стоят там, где должны.

Запуск:  python tools/test_reb.py [url]
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9486
URL = sys.argv[1] if len(sys.argv) > 1 else \
    "http://localhost:8765/instrumenty/soglasie-na-semku-rebenka.html"

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

    def tick(self, el_id, on):
        self.js("(()=>{const e=document.getElementById('%s');if(e.checked!==%s)e.click();})()"
                % (el_id, "true" if on else "false"))

    def pick(self, name, value):
        self.js("document.querySelector('input[name=%s][value=%s]').click()" % (name, value))

    def text(self):
        return self.js("document.getElementById('paper').innerText")

    def sheet(self, which):
        self.js("PobubnimReb.setMode('%s')" % which)
        time.sleep(0.3)
        return self.text()

    def resize(self, w, h):
        self.cmd("Emulation.setDeviceMetricsOverride", width=w, height=h,
                 deviceScaleFactor=1, mobile=w < 700)

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(25):
            time.sleep(0.4)
            if self.js("typeof window.PobubnimReb") == "object":
                return
        raise RuntimeError("страница не поднялась: нет PobubnimReb")

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


PLACES = ["p-site", "p-soc", "p-stend", "p-smi", "p-ad"]


def main():
    t = Tab()
    try:
        t.goto(URL)
        t.set("f-org", "МБОУ «Школа № 1»")
        t.set("f-inn", "7700000001")
        t.set("f-addr", "Москва, ул. Ленина, 1")
        t.set("f-child", "Петров Пётр Петрович")
        t.set("f-birth", "2016-05-12")
        t.set("f-parent", "Петрова Анна Сергеевна")
        t.set("f-passport", "45 00 123456, выдан ОВД")
        t.set("f-goal", "освещение мероприятий и достижений учащихся")
        t.set("f-city", "Москва")
        time.sleep(0.3)

        # --- 1. ГЛАВНОЕ: второй лист появляется только при публикации ---
        for p in PLACES:
            t.tick(p, False)
        time.sleep(0.3)
        check("без публикации: вкладка второго листа не подсвечена",
              t.js("document.getElementById('tab-rasp').classList.contains('need')") is False)
        check("без публикации: подсказка «хватит одного документа» видна",
              t.js("document.getElementById('hint-norasp').hidden") is False)
        osn = t.sheet("osn")
        check("без публикации: в основном согласии прямо сказано, что публикации нет",
              "публикация персональных данных и изображения Ребёнка настоящим согласием не предусмотрена".lower() in osn.lower())
        rasp = t.sheet("rasp")
        check("без публикации: второй лист объясняет, что он не нужен",
              "не отмечено ни одного места публикации" in rasp and "не нужен" in rasp)

        t.tick("p-site", True)
        time.sleep(0.3)
        check("с публикацией: вкладка второго листа подсвечена",
              t.js("document.getElementById('tab-rasp').classList.contains('need')") is True)
        check("с публикацией: подсказка про ст. 10.1 показана",
              t.js("document.getElementById('hint-rasp').hidden") is False)
        osn = t.sheet("osn")
        check("с публикацией: основное согласие ссылается на отдельный документ",
              "10.1" in osn and "ОТДЕЛЬНЫМ документом" in osn)
        rasp = t.sheet("rasp")
        check("второй лист собрался и назван согласием на распространение",
              "разрешённых субъектом для распространения" in rasp)
        check("второй лист ссылается на ч. 6 ст. 10.1", "10.1" in rasp and "отдельно от иных согласий" in rasp)

        # --- 2. места публикации перечисляются поимённо ---
        for p in PLACES:
            t.tick(p, True)
        time.sleep(0.3)
        rasp = t.sheet("rasp")
        for word in ["официальном сайте", "социальных сетях", "стендах", "средствах массовой информации", "рекламных"]:
            check(f"место публикации перечислено: {word}", word in rasp)
        check("прямо сказано, что иные ресурсы не разрешены",
              "Иные информационные ресурсы" in rasp and "не разрешены" in rasp)
        t.tick("p-smi", False)
        t.tick("p-ad", False)
        time.sleep(0.3)
        rasp = t.sheet("rasp")
        check("снятая галочка убирает место из документа",
              "средствах массовой информации" not in rasp and "официальном сайте" in rasp)

        # --- 3. запрещённые категории помечены «нет» ВСЕГДА ---
        check("дата рождения и контакты к распространению запрещены",
              "Дата рождения, адрес, контактные данные" in rasp and "нет" in rasp)
        check("специальные категории запрещены", "Сведения о здоровье" in rasp)
        check("ссылка на ч. 8 ст. 10.1 про обязательность запретов субъекта",
              "обязательны для оператора" in rasp)

        # --- 4. галочки данных отражаются в обоих листах ---
        t.tick("d-group", True)
        t.tick("d-age", True)
        time.sleep(0.3)
        rasp = t.sheet("rasp")
        check("класс и возраст попали в разрешённые",
              "Класс, группа" in rasp and "Возраст" in rasp)
        t.tick("d-age", False)
        time.sleep(0.3)
        rasp = t.sheet("rasp")
        check("снятый возраст ушёл из разрешённых", "Возраст (число полных лет)" not in rasp)
        t.tick("d-group", False)
        t.tick("d-contact", True)
        time.sleep(0.3)
        osn = t.sheet("osn")
        check("контакты представителя попали в перечень обрабатываемых",
              "контактные данные законного представителя" in osn)
        check("снятый класс ушёл из перечня обрабатываемых",
              "класс (группа, объединение)" not in osn)

        # --- 5. кем приходится представитель: слово и документ-основание ---
        cases = [("mother", "матерью", "свидетельством о рождении"),
                 ("father", "отцом", "свидетельством о рождении"),
                 ("guardian", "опекуном (попечителем)", "органа опеки"),
                 ("adoptive", "усыновителем", "об усыновлении")]
        for value, word, doc in cases:
            t.pick("kin", value)
            time.sleep(0.25)
            osn = t.sheet("osn")
            check(f"представитель «{word}»: слово и документ-основание",
                  word in osn and doc in osn, osn[:120])
        check("ссылка на ст. 64 СК РФ про законное представительство", "64" in t.text())

        # --- 6. оператор: организация против частного лица ---
        t.pick("who", "org")
        time.sleep(0.25)
        check("у организации поле адреса показано",
              t.js("document.getElementById('wrap-addr').hidden") is False)
        check("адрес организации попал в документ", "Москва, ул. Ленина, 1" in t.sheet("osn"))
        t.pick("who", "person")
        time.sleep(0.25)
        check("у частного лица поле адреса спрятано",
              t.js("document.getElementById('wrap-addr').hidden") is True)
        check("адрес в документ не идёт", "ул. Ленина" not in t.sheet("osn"))
        t.pick("who", "org")

        # --- 7. срок действия тремя вариантами ---
        t.pick("term", "revoke")
        time.sleep(0.25)
        check("срок «до отзыва»", "до отзыва настоящего согласия" in t.sheet("osn"))
        t.pick("term", "study")
        time.sleep(0.25)
        check("срок «на период обучения плюс три года»",
              "периода обучения" in t.sheet("osn") and "трёх лет" in t.sheet("osn"))
        t.pick("term", "years")
        t.set("f-years", 5)
        time.sleep(0.3)
        check("свой срок попал в документ", "5 лет" in t.sheet("osn"))
        check("поле срока показано только для своего варианта",
              t.js("document.getElementById('wrap-years').hidden") is False)

        # --- 8. отзыв согласия описан в обоих листах ---
        check("основной лист: отзыв по ч. 2 ст. 9", "отозвано" in t.sheet("osn") and "9" in t.sheet("osn"))
        rasp = t.sheet("rasp")
        check("лист распространения: отзыв по ч. 12 ст. 10.1",
              "прекратить передачу" in rasp and "12" in rasp)

        # --- 9. формат съёмки ---
        t.pick("media", "photo")
        time.sleep(0.25)
        osn = t.sheet("osn")
        check("только фото: видеозаписи не упоминаются как результат",
              "фотографические изображения" in osn and "видеозаписи с участием" not in osn)
        t.pick("media", "both")
        time.sleep(0.25)
        check("фото и видео вместе", "фото- и видеосъёмки" in t.sheet("osn"))

        # --- 10. цель и данные ребёнка попали в документ ---
        osn = t.sheet("osn")
        check("цель обработки в документе", "освещение мероприятий и достижений учащихся" in osn)
        check("ФИО ребёнка и представителя в документе",
              "Петров Пётр Петрович" in osn and "Петрова Анна Сергеевна" in osn)
        check("дата рождения ребёнка в русском формате", "12.05.2016" in osn)
        check("ссылка на ст. 5 152-ФЗ про конкретность цели", "5" in osn and "152-ФЗ" in osn)
        check("ссылка на ст. 152.1 ГК РФ", "152.1" in osn)
        check("оговорка про недопустимые способы использования",
              "порочащими его честь" in osn)

        # --- 11. мобильная раскладка ---
        t.resize(375, 800)
        time.sleep(0.5)
        sw = t.js("document.documentElement.scrollWidth")
        check("на 375 px страница не разъезжается", sw <= 376, sw)
        t.resize(1280, 900)

        # --- 12. консоль чистая ---
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
