# -*- coding: utf-8 -*-
"""Образцы результата на страницах инструментов: снимок заполненного листа.

Зачем (разбор поиска 05.10.2026, docs/research/seo_razbor_2026-10-05.md §5): запросы
«образец», «пример», «как выглядит» — зрительные, а на 14 инструментах из 15 не было
ни одной картинки. Образец — вход в поиск по картинкам и ответ человеку, который
хочет увидеть результат до того, как начнёт заполнять.

Скрипт открывает инструмент в Chrome, заполняет его данными-примером, снимает лист
и вписывает на страницу блок с картинкой (между метками obrazec:begin / obrazec:end,
перед вторым заголовком текста — определение остаётся первым) и поле screenshot в
разметку WebApplication. Повторный запуск пересобирает картинки и ничего не плодит.
Перезапускать, когда изменился вид листа.

Запуск:  python tools/build_tool_samples.py          (сервер на http://localhost:8765)
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

import websocket
from PIL import Image

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9479
LOCAL = os.environ.get("POBUBNIM_URL", "http://localhost:8765/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pobubnim.ru/"
CLIP_H = 1010          # сколько листа по высоте попадает в образец, CSS-пикселей

HELP = ("const S=(id,v)=>{const e=document.getElementById(id);if(!e)return;e.value=v;"
        "e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};"
        "const C=(sel)=>{const e=document.querySelector(sel);if(e)e.click();};")
CAP_DOC = "Так выглядит готовый лист. Заполните поля выше — получите такой же со своими данными."
CAP_NUM = "Так выглядит расчёт на листе. Поставьте свои числа выше — лист пересчитается сразу."

# страница: (имя картинки, заголовок блока, alt, подпись, подготовка)
SAMPLES = {
    "instrumenty/shot-list.html": ("shot-list", "Образец шот-листа: как выглядит план кадров",
        "Образец шот-листа на съёмку: сцена, кадры с крупностью, ракурсом, движением камеры и минутами", CAP_DOC,
        "S('f-proj','Свадьба Ани и Миши');S('f-date','14 сентября');S('f-loc','Усадьба, Наро-Фоминск');"
        "S('f-crew','Оператор, второй оператор');C('#chips .chip.all');"),
    "instrumenty/chek-list-semki.html": ("chek-list", "Образец чек-листа съёмки",
        "Образец чек-листа съёмочного дня: камера, оптика, свет, звук, питание и документы по разделам", CAP_DOC, ""),
    "instrumenty/brif-na-semku.html": ("brif", "Образец брифа на видеосъёмку",
        "Образец брифа на видеосъёмку: вопросы клиенту о задаче ролика, хронометраже, сроках и бюджете", CAP_DOC, ""),
    "instrumenty/tajming-svadby.html": ("tajming", "Пример тайминга свадебного дня",
        "Пример тайминга свадебного дня по часам: сборы, церемония, прогулка, банкет, закат и золотой час", CAP_NUM,
        "S('f-city','Москва');S('f-date','2026-06-20');"),
    "instrumenty/smeta-i-schet.html": ("smeta", "Образец сметы на видеосъёмку",
        "Образец сметы на видеосъёмку: съёмочная смена и монтаж со ставками, итог цифрами и прописью", CAP_DOC,
        "S('f-exec','Иванов Иван Иванович');S('f-client','ООО «Ромашка»');S('f-city','Москва');S('f-num','14/2026');"
        "C('#chips .chip:nth-child(4)');"
        "(()=>{const p=document.querySelectorAll('#rows .price'),q=document.querySelectorAll('#rows .qty');"
        "const set=(e,v)=>{if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));};"
        "set(p[0],30000);set(q[1],3);set(p[1],5000);})();"),
    "instrumenty/stavka-frilansera.html": ("stavka", "Пример расчёта ставки за съёмочную смену",
        "Пример расчёта ставки видеографа за смену: доход, налог, расходы, амортизация техники и резерв", CAP_NUM, ""),
    "instrumenty/kalkulyator-grip.html": ("grip", "Пример расчёта глубины резкости",
        "Пример расчёта ГРИП: ближняя и дальняя границы резкости, гиперфокальное расстояние и размытие фона", CAP_NUM, ""),
    "instrumenty/kalkulyator-nd-filtra.html": ("nd", "Пример расчёта ND-фильтра",
        "Пример расчёта ND-фильтра: сколько стопов нужно под шаттер 180° и какой фильтр ставить", CAP_NUM, ""),
    "instrumenty/kalkulyator-karty-pamyati.html": ("karta", "Пример расчёта карты памяти",
        "Пример расчёта карты памяти: сколько минут видео влезет и сколько весит час записи", CAP_NUM, ""),
    "instrumenty/modelnyj-reliz.html": ("reliz", "Образец модельного релиза",
        "Образец модельного релиза: согласие модели на съёмку и публикацию изображения", CAP_DOC,
        "S('f-author','Иванов Иван Иванович');S('f-model','Петрова Анна Сергеевна');S('f-city','Москва');"),
    "instrumenty/soglasie-na-semku-rebenka.html": ("soglasie-rebenka", "Образец согласия на съёмку ребёнка",
        "Образец согласия родителя на фото- и видеосъёмку ребёнка с обработкой персональных данных", CAP_DOC,
        "S('f-org','Иванов Иван Иванович, фотограф');S('f-child','Петров Пётр Петрович');"
        "S('f-parent','Петрова Анна Сергеевна');S('f-city','Москва');"),
    "instrumenty/dogovor-arendy-tehniki.html": ("arenda", "Образец договора аренды техники",
        "Образец договора аренды фото- и видеотехники: стороны, предмет, срок и плата", CAP_DOC,
        "S('f-aname','Иванов Иван Иванович');S('f-bname','Петров Пётр Петрович');S('f-city','Москва');"),
    "konstruktor-dogovora.html": ("dogovor", "Образец договора на фото- и видеосъёмку",
        "Образец договора на фото- и видеосъёмку: предмет, сроки, стоимость и порядок расчётов", CAP_DOC,
        "S('f-exec-name','Иванов Иван Иванович');S('f-client-name','Петрова Анна Сергеевна');S('f-price','45000');"
        "S('f-city','Москва');S('f-place','Москва, усадьба Архангельское');"),
}

BLOCK = re.compile(r"\n?    <!-- obrazec:begin -->.*?<!-- obrazec:end -->\n", re.S)
APP = re.compile(r'(<script type="application/ld\+json">)(\{"@context": "https://schema.org", "@type": "WebApplication".*?\})(</script>)', re.S)


def chrome():
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-prefers-no-reduced-motion",
         "--user-data-dir=" + tempfile.mkdtemp(prefix="pbsample-"), f"--remote-debugging-port={PORT}",
         "--remote-allow-origins=*", "--window-size=1440,900", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        try:
            tabs = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t.get("type") == "page"]
            if tabs:
                return proc, websocket.create_connection(tabs[0]["webSocketDebuggerUrl"], timeout=60)
        except Exception:
            pass
        time.sleep(0.25)
    proc.kill()
    raise RuntimeError("Chrome не поднялся")


def main() -> int:
    proc, ws = chrome()
    mid = [0]

    def cmd(method, **params):
        mid[0] += 1
        ws.send(json.dumps({"id": mid[0], "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == mid[0]:
                return m

    def js(expr):
        return cmd("Runtime.evaluate", expression=expr, returnByValue=True).get("result", {}).get("result", {}).get("value")

    try:
        cmd("Page.enable")
        cmd("Runtime.enable")
        cmd("Emulation.setDeviceMetricsOverride", width=1440, height=900, deviceScaleFactor=1, mobile=False)
        for rel, (slug, h2, alt, cap, prep) in SAMPLES.items():
            cmd("Page.navigate", url=LOCAL + rel)
            for _ in range(30):
                time.sleep(0.4)
                if js("document.readyState") == "complete" and js("!!(document.querySelector('.paper')||{}).innerText"):
                    break
            time.sleep(0.4)
            js("(()=>{" + HELP + prep + "})()")
            time.sleep(0.8)
            js("(()=>{const st=document.createElement('style');st.textContent='.paper{max-height:none!important;flex:none!important}"
               ".paper-col{position:static!important;max-height:none!important}.paper-shell{border-radius:0!important}"
               ".paper .hit{background:transparent!important;box-shadow:none!important}"
               "header.nav,.route-bar,.dock,.pb-tip,.pb-toast{display:none!important}';document.head.appendChild(st);})()")
            time.sleep(0.3)
            r = json.loads(js("JSON.stringify((function(){var p=[...document.querySelectorAll('.paper')].find(e=>e.getClientRects().length);"
                              "var r=p.getBoundingClientRect();return [r.left+scrollX,r.top+scrollY,r.width,r.height]})())"))
            h = min(r[3], CLIP_H)
            data = cmd("Page.captureScreenshot", format="png", captureBeyondViewport=True,
                       clip={"x": r[0], "y": r[1], "width": r[2], "height": h, "scale": 2})["result"]["data"]
            im = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB")
            name = f"obrazec-{slug}.webp"
            im.save(os.path.join(ROOT, "assets", "img", name), "WEBP", quality=82, method=6)
            w, hh = im.width // 2, im.height // 2

            path = os.path.join(ROOT, rel)
            src = io.open(path, encoding="utf-8").read()
            pre = "" if rel.startswith("instrumenty/") else "assets/img/"
            img_src = ("../assets/img/" if rel.startswith("instrumenty/") else "assets/img/") + name
            block = ("\n    <!-- obrazec:begin -->\n"
                     f'    <h2 class="art-h2">{h2}</h2>\n'
                     f'    <figure class="tool-sample"><img src="{img_src}" width="{w}" height="{hh}" loading="lazy" decoding="async" alt="{alt}">'
                     f"<figcaption>{cap}</figcaption></figure>\n"
                     "    <!-- obrazec:end -->\n")
            src = BLOCK.sub("\n", src)
            a = src.index('<div class="seo-body">')
            heads = [m.start() for m in re.finditer(r'    <h2 class="art-h2"', src[a:])]
            if len(heads) < 2:
                print("ПРОПУСК (в тексте меньше двух заголовков):", rel)
                continue
            at = a + heads[1]
            src = src[:at].rstrip("\n") + block + src[at:]
            m = APP.search(src)
            if m:
                d = json.loads(m.group(2))
                d["screenshot"] = {"@type": "ImageObject", "url": SITE + "assets/img/" + name,
                                   "width": im.width, "height": im.height, "caption": alt}
                src = src[:m.start(2)] + json.dumps(d, ensure_ascii=False) + src[m.end(2):]
            io.open(path, "w", encoding="utf-8", newline="\n").write(src)
            print(f"ok  {rel}: {name} {im.width}×{im.height}, {os.path.getsize(os.path.join(ROOT, 'assets', 'img', name)) // 1024} КБ")
    finally:
        proc.kill()
    return 0


if __name__ == "__main__":
    sys.exit(main())
