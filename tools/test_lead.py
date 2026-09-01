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

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
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
    finally:
        tab.close()

    print()
    if fails:
        print("ПРОВАЛЫ: " + ", ".join(fails))
        sys.exit(1)
    print("Всё сошлось.")


if __name__ == "__main__":
    main()
