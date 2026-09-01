# -*- coding: utf-8 -*-
"""Приёмка превью работ (raboty.html, главная, гео-страницы).

Проверяет ровно то, что ломалось: карточка не должна проявлять петлю раньше
первого кадра (иначе поверх постера стоит пустой видеослой всё время загрузки),
на тач-экране петля обязана оживать сама (наведения там нет), плеер — открываться
с постером и индикатором, а любое закрытие — отцеплять ролик.

Сеть режется до 400 Кбит/с с задержкой 300 мс: на быстром канале дефект
не виден, он вылезает ровно на мобильном интернете.

Запуск:  python tools/test_films.py [url]      (сервер превью поднять заранее)
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
PORT = 9497
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/raboty.html"

fails = []


def check(name, cond, got=""):
    print(("ok   " if cond else "ФЕЙЛ ") + name + ("" if cond else "  -> " + str(got)))
    if not cond:
        fails.append(name)


class Tab:
    def __init__(self):
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--autoplay-policy=no-user-gesture-required",
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
        self.ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=90)
        self.mid = 0
        self.cmd("Runtime.enable")
        self.cmd("Page.enable")
        self.cmd("Network.enable")

    def cmd(self, method, **params):
        self.mid += 1
        self.ws.send(json.dumps({"id": self.mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.mid:
                return msg

    def js(self, expr, wait=True):
        r = self.cmd("Runtime.evaluate", expression=expr, returnByValue=True,
                     awaitPromise=wait, timeout=90000)
        res = r.get("result", {})
        if "exceptionDetails" in res:
            raise RuntimeError(str(res["exceptionDetails"])[:300])
        return res.get("result", {}).get("value")

    def slow_net(self, on=True):
        if on:
            self.cmd("Network.emulateNetworkConditions", offline=False, latency=300,
                     downloadThroughput=400 * 1024 // 8, uploadThroughput=200 * 1024 // 8)
        else:
            self.cmd("Network.emulateNetworkConditions", offline=False, latency=0,
                     downloadThroughput=-1, uploadThroughput=-1)

    def phone(self, on=True):
        """Телефон: узкий экран, тач и никакого hover — как у половины визитов."""
        if on:
            self.cmd("Emulation.setDeviceMetricsOverride", width=390, height=844,
                     deviceScaleFactor=2, mobile=True)
            self.cmd("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
        else:
            self.cmd("Emulation.clearDeviceMetricsOverride")
            self.cmd("Emulation.setTouchEmulationEnabled", enabled=False)
        # headless сам просит «поменьше движения» — иначе автозапуск петли выключен
        self.cmd("Emulation.setEmulatedMedia",
                 features=[{"name": "prefers-reduced-motion", "value": "no-preference"}])

    def goto(self, url):
        """Страницу тянем на полной скорости — режем канал уже под сами петли."""
        self.slow_net(False)
        self.cmd("Page.navigate", url=url)
        for _ in range(60):
            time.sleep(0.3)
            if self.js("document.readyState === 'complete' && "
                       "document.querySelectorAll('.film[data-src]').length >= 3", wait=False):
                return
        raise RuntimeError("карточки работ не появились: " + url)

    def close(self):
        try:
            self.ws.close()
        finally:
            self.proc.terminate()


CARDS_PROBE = """
(async () => {
  const rows = [];
  for (const f of [...document.querySelectorAll('.film[data-src]')].slice(1, 4)) {
    const v = f.querySelector('video');
    f.classList.remove('playing');
    const t0 = performance.now();
    let classAt = null;
    const mo = new MutationObserver(() => {
      if (classAt === null && f.classList.contains('playing')) classAt = Math.round(performance.now() - t0);
    });
    mo.observe(f, { attributes: true, attributeFilter: ['class'] });
    const frameAt = await new Promise(r => {
      v.addEventListener('playing', () => r(Math.round(performance.now() - t0)), { once: true });
      setTimeout(() => r(null), 30000);
      f.dispatchEvent(new MouseEvent('mouseenter'));
    });
    mo.disconnect();
    rows.push({ clip: v.src.split('/').pop(), classAt, frameAt });
    f.dispatchEvent(new MouseEvent('mouseleave'));
  }
  return JSON.stringify(rows);
})()
"""

PHONE_PROBE = """
(async () => {
  const card = [...document.querySelectorAll('.film[data-src]')][1];
  card.scrollIntoView({ block: 'center' });
  const v = card.querySelector('video');
  await new Promise(r => {
    if (v.readyState >= 3 && !v.paused) return r();
    v.addEventListener('playing', r, { once: true });
    setTimeout(r, 25000);
  });
  return JSON.stringify({ hoverNone: matchMedia('(hover: none)').matches,
    playing: card.classList.contains('playing'), paused: v.paused, t: v.currentTime });
})()
"""

PLAYER_PROBE = """
(async () => {
  const card = [...document.querySelectorAll('.film[data-src]')][1];
  card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const p = document.getElementById('player'), v = p.querySelector('video');
  const open = { open: p.open, loading: p.hasAttribute('data-loading'), poster: !!v.poster,
                 spin: getComputedStyle(p, '::after').animationName,
                 h: Math.round(v.getBoundingClientRect().height) };
  p.close();                                   /* так же уходит Esc */
  await new Promise(r => setTimeout(r, 250));
  return JSON.stringify({ ...open, closed: !p.open, src: v.getAttribute('src'), posterAfter: v.getAttribute('poster') });
})()
"""


def main():
    tab = Tab()
    try:
        tab.phone(False)
        tab.goto(URL)
        tab.slow_net(True)
        rows = json.loads(tab.js(CARDS_PROBE))
        black = [r for r in rows if r["frameAt"] is None or r["classAt"] is None
                 or r["frameAt"] - r["classAt"] > 60]
        check("петля проявляется только с готовым кадром", not black,
              "; ".join(f"{r['clip']}: кадр {r['frameAt']}мс, класс {r['classAt']}мс" for r in rows))

        tab.phone(True)
        tab.goto(URL)
        ph = json.loads(tab.js(PHONE_PROBE))
        check("на телефоне петля оживает сама",
              ph["hoverNone"] and ph["playing"] and not ph["paused"], ph)

        tab.phone(False)
        tab.goto(URL)
        tab.slow_net(True)
        pl = json.loads(tab.js(PLAYER_PROBE))
        check("плеер открывается с постером и индикатором",
              pl["open"] and pl["poster"] and pl["loading"]
              and pl["spin"] == "player-spin" and pl["h"] > 200, pl)
        check("закрытие отцепляет ролик от плеера",
              pl["closed"] and not pl["src"] and not pl["posterAfter"], pl)
    finally:
        tab.close()

    print()
    if fails:
        print("ПРОВАЛЫ: " + ", ".join(fails))
        sys.exit(1)
    print("Всё сошлось.")


if __name__ == "__main__":
    main()
