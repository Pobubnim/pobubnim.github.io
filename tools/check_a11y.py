# -*- coding: utf-8 -*-
"""Проверка доступности всех страниц движком axe-core (WCAG 2.1 A/AA).

Ловит то, что глазом не поймать: недостаточный контраст, кнопки без имени,
поля без подписи, порядок заголовков, landmarks, атрибуты ARIA. Прогоняется
на двух ширинах — телефон и десктоп: часть нарушений вылезает только в одной.

Движок ставится один раз:  npm i -g axe-core
Запуск:  python tools/check_a11y.py [url ...]   (по умолчанию весь sitemap
         с http://localhost:8765; сервер поднимать заранее)
Код 1 — есть нарушения.
"""
import json
import os
import re
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9503
LOCAL = os.environ.get("POBUBNIM_URL", "http://localhost:8765/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTHS = ((390, 844, "телефон"), (1440, 900, "десктоп"))

AXE = os.path.join(
    subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, shell=True).stdout.strip(),
    "axe-core", "axe.min.js")

RUN = """
axe.run(document, {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  resultTypes: ['violations']
}).then(r => JSON.stringify(r.violations.map(v => ({
  id: v.id, impact: v.impact, help: v.help,
  nodes: v.nodes.slice(0, 3).map(n => ({ t: n.target.join(' '), m: (n.failureSummary || '').split('\\n').slice(1, 3).join(' ') }))
}))))
"""


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="a11y-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             "--window-size=1440,900", "about:blank"],
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
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=120)
        self.mid = 0
        self.cmd("Runtime.enable")
        self.cmd("Page.enable")
        self.axe = open(AXE, encoding="utf-8").read()

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg

    def js(self, expr, wait=False):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=wait, timeout=120000)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            raise RuntimeError(str(res["exceptionDetails"])[:200])
        return res.get("result", {}).get("value")

    def size(self, w, h, mobile):
        self.cmd("Emulation.setDeviceMetricsOverride", width=w, height=h,
                 deviceScaleFactor=2 if mobile else 1, mobile=mobile)

    def scan(self, url, open_js=None):
        """open_js — как открыть состояние (окно заявки, плеер, бургер) перед проверкой."""
        self.cmd("Page.navigate", url=url)
        for _ in range(60):
            time.sleep(0.3)
            if self.js("document.readyState === 'complete'"):
                break
        if open_js:
            time.sleep(1.0)
            if not self.js(open_js):
                return None
            time.sleep(0.6)
        self.js(self.axe)
        return json.loads(self.js(RUN, wait=True))

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.terminate()


STATES = [
    ("окно заявки", "(() => { const b = document.querySelector('[data-lead]');"
                    " if (!b) return false; b.click();"
                    " return !!(document.getElementById('lead') || {}).open; })()"),
    ("плеер работ", "(() => { const c = document.querySelector('.film[data-src]');"
                    " if (!c) return false; c.dispatchEvent(new MouseEvent('click', {bubbles: true}));"
                    " return !!(document.getElementById('player') || {}).open; })()"),
    ("бургер-меню", "(() => { const b = document.querySelector('.burger');"
                    " if (!b) return false; b.click(); return true; })()"),
]


def urls_from_sitemap():
    sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    return [re.sub(r"^https://(?:pobubnim\.ru|pobubnim\.github\.io)/", LOCAL, loc)
            for loc in re.findall(r"<loc>(.*?)</loc>", sm)]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--states" in sys.argv:
        return states(args[0] if args else LOCAL)
    urls = args or urls_from_sitemap()
    tab = Tab()
    found = {}
    try:
        for w, h, name in WIDTHS:
            tab.size(w, h, name == "телефон")
            for url in urls:
                for v in tab.scan(url):
                    key = (v["id"], v["nodes"][0]["t"] if v["nodes"] else "")
                    rec = found.setdefault(key, {"v": v, "pages": set(), "where": name})
                    rec["pages"].add(url.replace(LOCAL, "/"))
                print(".", end="", flush=True)
            print(f"  [{name}] пройдено {len(urls)}")
    finally:
        tab.close()

    if not found:
        print("\nНарушений нет.")
        return
    order = {"critical": 0, "serious": 1, "moderate": 2, "minor": 3}
    print(f"\nНАРУШЕНИЙ (уникальных): {len(found)}\n")
    for rec in sorted(found.values(), key=lambda r: order.get(r["v"]["impact"], 9)):
        v = rec["v"]
        pages = sorted(rec["pages"])
        print(f"[{v['impact']}] {v['id']} — {v['help']}")
        print(f"    страниц: {len(pages)} ({', '.join(pages[:4])}{'…' if len(pages) > 4 else ''})")
        for n in v["nodes"]:
            print(f"    {n['t']}  {n['m'][:150]}")
        print()
    sys.exit(1)


def states(url):
    """Диалоги и меню: axe их не видит, пока они закрыты."""
    tab = Tab()
    found = 0
    try:
        for name, opener in STATES:
            res = tab.scan(url, opener)
            if res is None:
                print(f"[{name}] на этой странице нет — пропуск")
                continue
            print(f"[{name}] нарушений: {len(res)}")
            found += len(res)
            for v in res:
                print(f"    [{v['impact']}] {v['id']} — {v['help']}")
                for n in v["nodes"]:
                    print(f"      {n['t']}  {n['m'][:130]}")
    finally:
        tab.close()
    if found:
        sys.exit(1)
    print("\nВ открытых состояниях чисто.")


if __name__ == "__main__":
    main()
