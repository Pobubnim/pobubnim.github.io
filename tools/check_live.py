# -*- coding: utf-8 -*-
"""Живая проверка страниц в браузере (headless Chrome по CDP).

Ловит то, что статический аудит не видит: горизонтальный оверфлоу на мобиле,
ошибки в консоли, не загрузившиеся ресурсы, искажённые пропорции картинок
(width/height против натуральных), налезающие друг на друга блоки.

Запуск:  python tools/check_live.py [url ...]      (по умолчанию — весь sitemap
         с http://localhost:8765; сервер поднимать заранее)
Ширины: 375 (мобила) и 1280 (десктоп).
Код 1 — есть находки.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9334
LOCAL = "http://localhost:8765/"
WIDTHS = (375, 1280)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROBE = r"""
(() => {
  const de = document.documentElement, vw = de.clientWidth, out = {
    scrollW: de.scrollWidth, clientW: vw, over: [], imgs: [], missing: []
  };
  // кто вылезает за правый край
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      let p = el.parentElement, hidden = false;
      while (p) { const pc = getComputedStyle(p);
        if (pc.overflowX === 'hidden' || pc.overflowX === 'auto' || pc.overflowX === 'scroll') { hidden = true; break; }
        p = p.parentElement; }
      if (!hidden) out.over.push({
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
             ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        left: Math.round(r.left), right: Math.round(r.right)
      });
    }
  }
  out.over = out.over.slice(0, 6);
  // картинки: загрузились и не искажены
  for (const i of document.images) {
    const src = (i.currentSrc || i.src || '').split('/').pop();
    if (!i.complete || i.naturalWidth === 0) { out.missing.push(src); continue; }
    const cs = getComputedStyle(i);
    if (cs.objectFit === 'cover' || cs.objectFit === 'contain') continue;
    const r = i.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const arNat = i.naturalWidth / i.naturalHeight, arBox = r.width / r.height;
    if (Math.abs(arBox - arNat) / arNat > 0.03)
      out.imgs.push({ src, nat: +arNat.toFixed(3), box: +arBox.toFixed(3),
                      w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
})()
"""


class Chrome:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
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
        self.events = []
        self.cmd("Runtime.enable")
        self.cmd("Log.enable")
        self.cmd("Network.enable")

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg
            if "method" in msg:
                self.events.append(msg)

    def drain(self):
        self.ws.settimeout(0.4)
        try:
            while True:
                msg = json.loads(self.ws.recv())
                if "method" in msg:
                    self.events.append(msg)
        except Exception:
            pass
        self.ws.settimeout(60)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.kill()


def urls_from_sitemap():
    sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    out = []
    for loc in re.findall(r"<loc>(.*?)</loc>", sm):
        out.append(re.sub(r"^https://pobubnim\.github\.io/", LOCAL, loc))
    return out


def main():
    urls = sys.argv[1:] or urls_from_sitemap()
    ch = Chrome()
    findings = 0
    try:
        for url in urls:
            for w in WIDTHS:
                ch.cmd("Emulation.setDeviceMetricsOverride", width=w, height=850,
                       deviceScaleFactor=1, mobile=(w < 700))
                ch.events.clear()
                ch.cmd("Page.navigate", url=url)
                time.sleep(2.0)
                # снять lazy и разбудить всё пошаговым скроллом (как в fullshot.py)
                ch.cmd("Runtime.evaluate",
                       expression="[...document.images].forEach(i => i.loading = 'eager')")
                h = ch.cmd("Runtime.evaluate", expression="document.body.scrollHeight",
                           returnByValue=True)["result"]["result"]["value"]
                y = 0
                while y < h:
                    y += 600
                    ch.cmd("Runtime.evaluate", expression=f"window.scrollTo(0, {y})")
                    time.sleep(0.25)
                ch.cmd("Runtime.evaluate", expression="window.scrollTo(0, 0)")
                # дождаться, пока картинки реально декодируются
                ch.cmd("Runtime.evaluate", awaitPromise=True, returnByValue=True, expression=(
                    "Promise.race(["
                    "Promise.all([...document.images].map(i => i.decode().catch(() => {}))),"
                    "new Promise(r => setTimeout(r, 8000))])"))
                time.sleep(0.4)
                ch.drain()
                r = ch.cmd("Runtime.evaluate", expression=PROBE, returnByValue=True)
                res = r.get("result", {}).get("result", {}).get("value")
                # часть плиток рисует JS по скроллу — даём догрузиться и перепроверяем
                if res and res["missing"]:
                    time.sleep(4)
                    r = ch.cmd("Runtime.evaluate", expression=PROBE, returnByValue=True)
                    res = r.get("result", {}).get("result", {}).get("value") or res
                name = url.replace(LOCAL, "/") + f" @{w}"
                if not res:
                    print(f"X {name}: страница не ответила")
                    findings += 1
                    continue
                msgs = []
                for e in ch.events:
                    m = e.get("method")
                    if m == "Log.entryAdded":
                        en = e["params"]["entry"]
                        if en.get("level") in ("error",) and "favicon" not in en.get("url", ""):
                            msgs.append("консоль: " + en.get("text", "")[:120])
                    elif m == "Runtime.exceptionThrown":
                        d = e["params"]["exceptionDetails"]
                        msgs.append("JS-исключение: " + (d.get("text", "") + " " +
                                    str(d.get("exception", {}).get("description", ""))[:120]))
                    elif m == "Network.loadingFailed":
                        msgs.append("не загрузилось: " + e["params"].get("errorText", ""))
                if res["scrollW"] > res["clientW"] + 1:
                    msgs.append(f"оверфлоу по горизонтали: scrollW {res['scrollW']} > {res['clientW']}"
                                + (" — виновники: " + ", ".join(
                                    f"{o['tag']}[{o['left']}..{o['right']}]" for o in res["over"])
                                   if res["over"] else ""))
                for i in res["imgs"]:
                    msgs.append(f"картинка искажена {i['src']}: {i['w']}x{i['h']} "
                                f"(бокс {i['box']} против натуральных {i['nat']})")
                for s in res["missing"]:
                    msgs.append(f"картинка не загрузилась: {s}")
                if msgs:
                    findings += len(msgs)
                    print(f"X {name}")
                    for m in msgs:
                        print("    -", m)
                else:
                    print(f"ok {name}")
    finally:
        ch.close()
    print(f"\nНаходок: {findings}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
