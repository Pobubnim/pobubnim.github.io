# -*- coding: utf-8 -*-
"""Скорость страниц на телефоне: вес, LCP, сдвиг вёрстки, самый тяжёлый файл.

Меряется живым Chrome с эмуляцией мобильного канала (медленный 4G, 1,6 Мбит/с,
задержка 150 мс) — на офисном интернете все страницы «быстрые», и разницы не
видно. Пороги: LCP до 2,5 с хорошо, до 4 с терпимо, дальше плохо; CLS до 0,1.

Запуск:  python tools/check_speed.py [url ...]   (по умолчанию — ключевые
         страницы с http://localhost:8765; сервер поднимать заранее)
Код 1 — какая-то страница вышла за пороги.
"""
import json
import os
import subprocess
import tempfile
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9509
LOCAL = os.environ.get("POBUBNIM_URL", "http://localhost:8765/")
KEY = ["", "raboty.html", "zakazy-sami.html", "education.html", "instrumenty/",
       "articles/", "konstruktor-dogovora.html", "videograf-naro-fominsk.html",
       "services/svadebnoe-kino.html", "uroki/kak-rabotaet-iso.html"]
LCP_BAD, CLS_BAD = 4.0, 0.1


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--autoplay-policy=no-user-gesture-required",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="spd-"),
             f"--remote-debugging-port={PORT}", "--remote-allow-origins=*",
             "--window-size=390,844", "about:blank"],
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
        self.cmd("Network.enable")
        # Наблюдатель сажается ОДИН раз на всю сессию: если ставить его перед
        # каждым переходом, на N-й странице один и тот же сдвиг посчитается
        # N раз (ловилось как «вёрстка скачет на 0.547» там, где скачет на 0.068).
        self.cmd("Page.addScriptToEvaluateOnNewDocument", source="""
          window.__lcp = 0; window.__cls = 0;
          new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; })
            .observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(l => { for (const e of l.getEntries())
            if (!e.hadRecentInput) window.__cls += e.value; })
            .observe({ type: 'layout-shift', buffered: true });
        """)

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
        return r.get("result", {}).get("result", {}).get("value")

    def measure(self, url):
        self.cmd("Network.clearBrowserCache")
        self.cmd("Emulation.setDeviceMetricsOverride", width=390, height=844,
                 deviceScaleFactor=2, mobile=True)
        self.cmd("Network.emulateNetworkConditions", offline=False, latency=150,
                 downloadThroughput=1600 * 1024 // 8, uploadThroughput=750 * 1024 // 8)
        self.cmd("Page.navigate", url=url)
        for _ in range(120):
            time.sleep(0.25)
            if self.js("document.readyState === 'complete'"):
                break
        time.sleep(2.5)                       # добираем поздние ресурсы и сдвиги
        return json.loads(self.js("""JSON.stringify((() => {
          const res = performance.getEntriesByType('resource');
          const lcp = window.__lcp;
          const nav = performance.getEntriesByType('navigation')[0] || {};
          const bytes = res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav.transferSize || 0);
          const heavy = res.slice().sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))[0];
          return {
            bytes,
            lcp: lcp ? Math.round(lcp) : null,
            cls: Math.round((window.__cls || 0) * 1000) / 1000,
            dcl: Math.round(nav.domContentLoadedEventEnd || 0),
            heavy: heavy ? heavy.name.split('/').pop() + ' ' + Math.round((heavy.transferSize || 0) / 1024) + ' КБ' : '',
            requests: res.length
          };
        })())"""))

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.terminate()


def main():
    urls = sys.argv[1:] or [LOCAL + p for p in KEY]
    tab = Tab()
    bad = []
    try:
        print(f"{'страница':38} {'скачано':>9} {'LCP':>8} {'сдвиг':>7}  самый тяжёлый файл")
        for url in urls:
            m = tab.measure(url)
            lcp = (m["lcp"] or 0) / 1000
            name = url.replace(LOCAL, "/")
            print(f"{name:38} {m['bytes']/1048576:6.2f} МБ {lcp:7.2f}с {m['cls']:7.3f}  {m['heavy']}")
            if lcp > LCP_BAD:
                bad.append(f"{name}: LCP {lcp:.1f} с (порог {LCP_BAD})")
            if m["cls"] > CLS_BAD:
                bad.append(f"{name}: вёрстка скачет на {m['cls']:.3f} (порог {CLS_BAD})")
    finally:
        tab.close()
    if bad:
        print("\nЗА ПОРОГОМ:\n" + "\n".join(" · " + b for b in bad))
        sys.exit(1)
    print("\nВсе страницы в пороге.")


if __name__ == "__main__":
    main()
