# -*- coding: utf-8 -*-
"""Приёмка формы заявки (assets/js/lead.js) — конверсионная точка сайта.

Проверяет три исхода, а не только счастливый:
  1. без контакта заявка не уходит и человеку говорят, почему;
  2. успех — окно подтверждает отправку, в базу уходит заполненное тело;
  3. отказ сети — окно НЕ закрывается, появляется живая ссылка в телеграм
     с готовым текстом (раньше здесь звали window.open после await, а браузер
     такое окно блокирует — заявка терялась молча).

Запуск:  python tools/test_lead.py [url]     (сервер превью поднять заранее)
Код 1 — есть провалы.
"""
import json
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

from _chrome import CHROME  # Windows или облако — tools/_chrome.py
PORT = 9519
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"

fails = []


def check(name, cond, got=""):
    print(("ok   " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="lead-"),
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
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=90)
        self.mid = 0
        self.cmd("Runtime.enable")
        self.cmd("Page.enable")

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg

    def js(self, expr, wait=False):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=wait, timeout=60000)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            raise RuntimeError(str(res["exceptionDetails"])[:250])
        return res.get("result", {}).get("value")

    def goto(self, url):
        self.cmd("Page.navigate", url=url)
        for _ in range(60):
            time.sleep(0.3)
            if self.js("document.readyState === 'complete'"):
                break
        time.sleep(1.0)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.terminate()


# ответ бэкенда подменяем: настоящую заявку в базу владельца слать нельзя
MOCK = """
window.__sent = null;
window.fetch = function (u, o) {
  /* Метрика тоже ходит через fetch — считаем только обращение к базе заявок */
  if (String(u).indexOf('supabase') === -1) return Promise.resolve(new Response('{}'));
  window.__sent = { url: String(u), body: o && o.body ? String(o.body) : null };
  %s
};
document.querySelector('[data-lead]').click();
!!document.getElementById('lead').open;
"""
OK = ("return Promise.resolve(new Response(JSON.stringify({ok: true, id: 1}), "
      "{status: 200, headers: {'Content-Type': 'application/json'}}));")
FAIL = "return Promise.reject(new Error('нет сети'));"

FILL = """
document.getElementById('lf-name').value = 'Проверка';
document.getElementById('lf-contact').value = '@probe_bot';
document.getElementById('lf-desc').value = 'автопроверка формы, не заявка';
document.getElementById('lf-what').selectedIndex = 2;
document.getElementById('lf-consent').checked = true;
"""

STATE = """JSON.stringify({
  sent: !!window.__sent,
  url: (window.__sent || {}).url || null,
  body: (window.__sent && window.__sent.body) ? JSON.parse(window.__sent.body).p : null,
  status: (document.getElementById('lf-status') || {}).textContent || '',
  open: document.getElementById('lead').open,
  button: (document.getElementById('lf-send') || {}).textContent || '',
  tgHidden: !!((document.getElementById('lf-tg') || {}).hidden),
  tgExists: !!document.getElementById('lf-tg'),
  tgHref: (document.getElementById('lf-tg') || {}).href || ''
})"""


def main():
    tab = Tab()
    try:
        # 1. без контакта
        tab.goto(URL)
        tab.js(MOCK % OK)
        tab.js("document.getElementById('lf-name').value = 'Без контакта';")
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(0.6)
        s = json.loads(tab.js(STATE))
        check("без контакта заявка не уходит и окно остаётся",
              not s["sent"] and s["open"] and "телефон" in s["status"].lower(), s["status"][:80])

        # 1б. без согласия — отдельной строкой, галочка не стоит заранее (решение владельца 17.09)
        tab.goto(URL)
        tab.js(MOCK % OK)
        consent = json.loads(tab.js("JSON.stringify({checked: document.getElementById('lf-consent').checked, "
                                    "href: document.querySelector('.lead-consent a').getAttribute('href')})"))
        check("согласие: галочка по умолчанию снята и ведёт на текст согласия",
              consent["checked"] is False and consent["href"] == "/soglasie.html", consent)
        tab.js(FILL + "document.getElementById('lf-consent').checked = false;")
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(0.6)
        s = json.loads(tab.js(STATE))
        check("без согласия заявка не уходит и человеку сказали почему",
              not s["sent"] and s["open"] and "согласие" in s["status"].lower(), s["status"][:80])

        # 2. успех
        tab.goto(URL)
        tab.js(MOCK % OK)
        tab.js(FILL)
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(1.2)
        s = json.loads(tab.js(STATE))
        body = s["body"] or {}
        check("успех: заявка ушла с заполненным телом",
              s["sent"] and body.get("contact") == "@probe_bot" and body.get("service")
              and body.get("page") is not None, body)
        check("успех: человеку сказали, что заявка принята",
              "готово" in s["status"].lower() or "у меня" in s["button"].lower(),
              s["button"] + " | " + s["status"][:60])

        # 3. отказ сети
        tab.goto(URL)
        tab.js(MOCK % FAIL)
        tab.js(FILL)
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(1.5)
        s = json.loads(tab.js(STATE))
        check("отказ: окно НЕ закрывается", s["open"], s)
        check("отказ: есть живая ссылка в телеграм с готовым текстом",
              s.get("tgExists") and not s["tgHidden"]
              and "t.me/" in s["tgHref"] and "text=" in s["tgHref"],
              s["tgHref"][:80] or "кнопки нет вовсе")
        check("отказ: человеку сказали правду и предложили повтор",
              "не смог отправить" in s["status"].lower() and "ещё раз" in s["button"].lower(),
              s["button"] + " | " + s["status"][:80])

        # 4. источник: пришёл по рекламе на услугу, заявку оставил с другой страницы.
        #    Без этого расход на Директ не с чем сопоставить (17.09.2026).
        base = URL.rstrip("/")
        tab.goto(base + "/services/semka-meropriyatij.html?utm_source=yandex&utm_medium=cpc"
                 "&utm_campaign=777&utm_term=%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE%D1%81%D1%8A%D1%91%D0%BC%D0%BA%D0%B0"
                 "&yclid=123456789")
        # вернулся из своего телеграма — свежий рекламный источник не перетирается.
        # Реферер подменяется до загрузки страницы: Page.navigate(referrer=https://…)
        # на http://localhost браузер срезает по политике, и проверка была бы пустой.
        fake = tab.cmd("Page.addScriptToEvaluateOnNewDocument",
                       source="Object.defineProperty(document, 'referrer', {get: function () { return 'https://t.me/sbphotoshoter'; }});")
        tab.goto(base + "/raboty.html")
        tab.cmd("Page.removeScriptToEvaluateOnNewDocument", identifier=fake["result"]["identifier"])
        check("проверка реферера: подмена сработала",
              tab.js("document.referrer") == "https://t.me/sbphotoshoter", tab.js("document.referrer"))
        tab.js(MOCK % OK)
        tab.js(FILL)
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(1.2)
        s = json.loads(tab.js(STATE))
        body = s["body"] or {}
        page = body.get("page") or ""
        last = ((body.get("source") or {}).get("last") or {})
        check("источник: в поле page видно рекламу, ключ и страницу входа",
              "yandex/cpc/777" in page and "«видеосъёмка»" in page
              and "вход /services/semka-meropriyatij.html" in page and len(page) <= 200, page)
        check("источник: полный объект с yclid ушёл ключом source",
              last.get("yclid") == "123456789" and last.get("utm_campaign") == "777", body.get("source"))
        check("источник: внутренний переход не перетёр рекламный",
              page.startswith("/raboty.html ← yandex"), page)

        check("источник: возврат из своего телеграма не перетёр рекламу",
              "t.me" not in page, page)

        # 5. звонок из шапки считается целью phone_click — только на тач-экране:
        #    на ПК клик по tel: ничего не набирает, а цель учила бы Директ кликам
        tab.goto(base + "/services/reklamnyj-rolik.html")
        spy = ("window.__goals = []; window.ym = function () { window.__goals.push([].slice.call(arguments)); };"
               "addEventListener('click', function (e) { e.preventDefault(); }, true);")
        got = "JSON.stringify(window.__goals.filter(function (g) { return g[1] === 'reachGoal'; }))"
        tab.js(spy + "document.querySelector('.nav-tel').click();")
        goals_pc = tab.js(got)
        tab.js("window.__goals = []; window.matchMedia = function () { return { matches: true }; };"
               "document.querySelector('.nav-tel').click();")
        goals_touch = tab.js(got)
        check("телефон: на тач-экране клик по номеру шлёт phone_click",
              "phone_click" in (goals_touch or ""), goals_touch)
        check("телефон: на ПК клик по номеру цель не шлёт",
              "phone_click" not in (goals_pc or ""), goals_pc)

        # 6. учёт не роняет заявку: модуль источника бросает исключение
        tab.goto(base + "/services/svadebnoe-kino.html")
        tab.js("window.pbSource = function () { throw new Error('сломан учёт'); };")
        tab.js(MOCK % OK)
        tab.js(FILL)
        tab.js("document.getElementById('lf-send').click()")
        time.sleep(1.2)
        s = json.loads(tab.js(STATE))
        check("учёт: испорченный источник не мешает отправить заявку",
              s["sent"] and "готово" in s["status"].lower(), s["status"][:80])

        # 7. контекст в личку. Живой случай 17.09: человек написал «Хочу на обучение», и
        #    было не понять ни направления, ни страницы — со всех остальных страниц ссылка
        #    открывала пустой чат.
        links = ("JSON.stringify([].map.call(document.querySelectorAll('%s'), "
                 "function (a) { return decodeURIComponent(a.href); }))")
        tab.goto(base + "/services/reklamnyj-rolik.html")
        hrefs = json.loads(tab.js(links % 'a[href*="t.me/sbphotoshoter"]'))
        check("личка: на услуге каждая ссылка в телеграм несёт тему страницы",
              hrefs and all("тема: Рекламный ролик под ключ" in h for h in hrefs), hrefs[:2])

        tab.goto(base + "/education.html")
        edu = json.loads(tab.js(links % 'a[href*="t.me/sbphotoshoter"]'))
        marks = ("Направление (", "обучение: ", "разбор или консультацию", "не знаю, с чего начать")
        check("обучение: ни одна ссылка не шлёт «хочу на обучение» без направления",
              edu and all(any(m in h for m in marks) for h in edu),
              [h for h in edu if not any(m in h for m in marks)][:2])
        chips = json.loads(tab.js(links % ".edu-chip"))
        goes = tab.js("document.querySelectorAll('.prog-go').length")
        check("обучение: у каждой из 6 программ своя кнопка, чип шлёт направление",
              goes == 6 and any("обучение: цветокоррекция" in h for h in chips), [goes, chips[:2]])
        tab.js("document.querySelector('.edu-pick [data-lead]').click();")
        ph = tab.js("document.getElementById('lf-desc').placeholder")
        check("форма: для обучения подсказка спрашивает направление", "Направление" in (ph or ""), ph)

        # 8. выход из формы. Жалоба владельца 17.09: крестик внутри формы «отправлял» её,
        #    браузер требовал заполнить телефон и не выпускал; Enter закрывал окно молча,
        #    и заявка с заполненным телефоном не уходила; запасная кнопка телеграма висела всегда.
        tab.goto(base + "/services/cvetokorrekciya.html")
        tab.js(MOCK % OK)
        tg_shown = tab.js("getComputedStyle(document.getElementById('lf-tg')).display !== 'none'")
        check("форма: запасная кнопка телеграма скрыта, пока отправка не сорвалась", tg_shown is False, tg_shown)
        tab.js("document.querySelector('#lead .lead-close').click()")
        check("форма: крестик закрывает пустую форму", tab.js("document.getElementById('lead').open") is False,
              tab.js("document.getElementById('lead').open"))
        tab.js("document.querySelector('[data-lead]').click();"
               "document.getElementById('lead').dispatchEvent(new MouseEvent('click', {bubbles: true}));")
        check("форма: клик по затемнению закрывает окно", tab.js("document.getElementById('lead').open") is False,
              tab.js("document.getElementById('lead').open"))
        tab.js("document.querySelector('[data-lead]').click();" + FILL +
               "document.querySelector('#lead form').requestSubmit();")
        time.sleep(1.2)
        s = json.loads(tab.js(STATE))
        check("форма: Enter в поле отправляет заявку, а не закрывает окно молча",
              s["sent"] and "готово" in s["status"].lower(), [s["sent"], s["open"], s["status"][:60]])

        # 9. подсказки (слово владельца 17.09). Ожидание 45 с в тесте сжато до 1,5 с через
        #    PB_TIP_WAIT, всё остальное — боевые правила.
        fast = tab.cmd("Page.addScriptToEvaluateOnNewDocument", source="window.PB_TIP_WAIT = 1500;")
        tab.goto(base + "/services/reklamnyj-rolik.html")
        tab.js("localStorage.clear(); sessionStorage.clear();")
        tab.goto(base + "/services/reklamnyj-rolik.html")
        time.sleep(2.5)
        check("подсказка: без прокрутки не появляется", tab.js("!document.querySelector('.pb-tip')"), "появилась сразу")
        tab.js("window.scrollTo(0, document.documentElement.scrollHeight * 0.6)")
        time.sleep(2.2)
        tip = json.loads(tab.js("JSON.stringify((function (t) { return t && {h: t.querySelector('b').textContent,"
                                " cta: t.querySelector('.btn').getAttribute('href'), tg: decodeURIComponent((t.querySelector('.pb-tip-tg') || {}).href || '')}; })"
                                "(document.querySelector('.pb-tip')))"))
        check("подсказка: после вовлечения на услуге ведёт в подбор, телеграм с темой",
              tip and tip["cta"] == "/ceny.html#podbor" and "тема: Рекламный ролик под ключ" in tip["tg"], tip)
        tab.js("document.querySelector('.pb-tip-x').click()")
        off = tab.js("(+localStorage.getItem('pb_tip_off') - Date.now()) / 864e5")
        check("подсказка: закрыл — неделя тишины", tab.js("!document.querySelector('.pb-tip')") and 6.9 < (off or 0) < 7.1, off)
        tab.js("sessionStorage.clear();")
        tab.goto(base + "/services/imidzhevyj-film.html")
        tab.js("window.scrollTo(0, document.documentElement.scrollHeight * 0.6)")
        time.sleep(2.5)
        check("подсказка: в неделю тишины не возвращается на другой странице",
              tab.js("!document.querySelector('.pb-tip')"), "вернулась")

        tab.js("localStorage.clear(); sessionStorage.clear();")
        tab.goto(base + "/ceny.html")
        tab.js("window.scrollTo(0, document.documentElement.scrollHeight * 0.6)")
        time.sleep(2.5)
        check("подсказка: на странице с подбором не показывается", tab.js("!document.querySelector('.pb-tip')"), "показалась")

        tab.js("localStorage.clear(); sessionStorage.clear();")
        tab.goto(base + "/education.html")
        tab.js(MOCK % OK)
        time.sleep(3.2)
        tab.js("document.querySelector('#lead .lead-close').click()")
        time.sleep(1.0)
        ftip = json.loads(tab.js("JSON.stringify((function (t) { return t && {h: t.querySelector('b').textContent,"
                                 " href: decodeURIComponent(t.querySelector('.btn').href)}; })(document.querySelector('.pb-tip')))"))
        check("подсказка: закрыл форму не отправив — предлагает одно сообщение в телеграм с темой",
              ftip and ftip["h"].startswith("Передумали") and "Хочу на обучение" in ftip["href"], ftip)

        tab.js("localStorage.clear(); sessionStorage.clear();")
        tab.goto(base + "/services/svadebnoe-kino.html")
        tab.js(MOCK % OK)
        tab.js(FILL + "document.getElementById('lf-send').click()")
        time.sleep(1.2)
        off = tab.js("(+localStorage.getItem('pb_tip_off') - Date.now()) / 864e5")
        check("подсказка: после заявки месяц тишины", 29.9 < (off or 0) < 30.1, off)
        tab.cmd("Page.removeScriptToEvaluateOnNewDocument", identifier=fast["result"]["identifier"])

        # ссылку, которую дорисовал другой скрипт после загрузки, чиним в момент клика
        tab.goto(base + "/articles/skolko-stoit-klip.html")
        tab.js("var a = document.createElement('a'); a.id = 'probe-tg'; a.href = 'https://t.me/sbphotoshoter';"
               "a.textContent = 'x'; document.body.appendChild(a); window.__href = null;"
               "addEventListener('click', function (e) { if (e.target.id === 'probe-tg') {"
               " e.preventDefault(); window.__href = decodeURIComponent(e.target.href); } });"
               "a.click();")
        got = tab.js("window.__href") or ""
        check("личка: ссылка, добавленная после загрузки, получает тему при клике",
              "Пишу со страницы «Сколько стоит съёмка клипа" in got, got[:90])
    finally:
        tab.close()

    print()
    if fails:
        print("ПРОВАЛЫ: " + ", ".join(fails))
        sys.exit(1)
    print("Всё сошлось.")


if __name__ == "__main__":
    main()
