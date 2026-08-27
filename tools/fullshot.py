# -*- coding: utf-8 -*-
"""Полностраничный скриншот через Chrome CDP (headless).
Запуск: python tools/fullshot.py <url> <out.jpg> [width] [scale]"""
import base64, json, subprocess, sys, time, urllib.request
import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9333

def main():
    url, out = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
    scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.62
    proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--user-data-dir=" + tempfile.mkdtemp(prefix="pbchrome-"),
        "--force-prefers-reduced-motion", f"--remote-debugging-port={PORT}",
        "--remote-allow-origins=*", f"--window-size={width},900", url],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        tabs = None
        for _ in range(60):
            try:
                allt = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
                tabs = [t for t in allt if t.get("type") == "page"]
                if tabs: break
            except Exception: pass
            time.sleep(0.25)
        ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        mid = [0]
        def cmd(method, **params):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get("id") == mid[0]: return msg
        cmd("Emulation.setDeviceMetricsOverride", width=width, height=900,
            deviceScaleFactor=1, mobile=(width < 700))
        time.sleep(4)
        # пошаговый скролл -- будит lazy-load и даёт картинкам догрузиться
        h = int(cmd("Runtime.evaluate", expression="document.body.scrollHeight", returnByValue=True)["result"]["result"]["value"])
        y = 0
        while y < h:
            y += 700
            cmd("Runtime.evaluate", expression=f"window.scrollTo(0, {y})")
            time.sleep(0.5)
        time.sleep(3)
        cmd("Runtime.evaluate", expression="window.scrollTo(0, 0)")
        time.sleep(2)
        h = int(cmd("Runtime.evaluate", expression="document.body.scrollHeight", returnByValue=True)["result"]["result"]["value"])
        shot = cmd("Page.captureScreenshot", format="jpeg", quality=82, captureBeyondViewport=True,
                   clip={"x": 0, "y": 0, "width": width, "height": min(h, 16000), "scale": scale})
        if "result" in shot and "data" in shot["result"]:
            open(out, "wb").write(base64.b64decode(shot["result"]["data"]))
            print(f"saved {out} h={h}")
        else:
            print("error:", shot.get("error")); sys.exit(1)
    finally:
        proc.kill()

if __name__ == "__main__":
    main()
