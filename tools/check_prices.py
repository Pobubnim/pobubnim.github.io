# -*- coding: utf-8 -*-
"""Гард единого прайса: цены на страницах предложений = assets/data/prices.json.

Зачем (17.09.2026): одна цифра стоит на 15+ страницах (главная, посадочная, гео, услуги,
обучение, FAQ и JSON-LD). Поменяли цену в одном месте — остальные молча врут, а
расхождение цены между страницей и объявлением Директа — это ещё и недостоверная
реклама. Скрипт знает только прайс и ловит любую «чужую» сумму.

Что проверяет:
  1. видимый текст страниц предложений: каждая сумма «N ₽» есть в прайсе;
  2. JSON-LD всех страниц сайта: price / lowPrice / highPrice / minPrice — из прайса или 0
     (бесплатные инструменты), кроме витрины приложения (свой прайс продукта);
  3. страницы с метками prices:* собраны из текущего прайса (build_prices.py --check).

Статьи не сверяются: в разборах цен стоят рыночные вилки чужих студий.
Запуск:  python tools/check_prices.py      код 1 — есть расхождения
"""
import glob
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OFFER_PAGES = ["index.html", "ceny.html", "video-dlya-biznesa.html", "videosemka-moskva.html",
               "education.html"] + ["videograf-*.html", "services/*.html"]
# у витрины приложения МОНОЛИТ свой прайс продукта (оферта приложения), не услуги
PRODUCT_PAGES = {"zakazy-sami.html", "instrumenty/monolit-crm-dlya-videoprodakshena.html"}


def allowed():
    P = json.load(open(os.path.join(ROOT, "assets", "data", "prices.json"), encoding="utf-8"))
    s = set()
    for g in P["groups"]:
        for it in g["items"]:
            if it.get("from"):
                s.add(it["from"])
            for a in it.get("also", []):
                s.add(a["from"])
    return s


def visible(t):
    t = re.sub(r"<script.*?</script>|<style.*?</style>|<head.*?</head>|<!--.*?-->", " ", t, flags=re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t))


def main():
    ok = allowed()
    bad = []
    pages = sorted({p for pat in OFFER_PAGES for p in glob.glob(os.path.join(ROOT, pat))})
    for p in pages:
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        for m in re.finditer(r"(\d{1,3}(?:[   ]\d{3})+|\d+)\s?₽", visible(open(p, encoding="utf-8").read())):
            n = int(re.sub(r"\D", "", m.group(1)))
            if n not in ok:
                bad.append(f"{rel}: «{m.group(0)}» нет в прайсе")
    for p in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        if rel in PRODUCT_PAGES:
            continue
        for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', open(p, encoding="utf-8").read(), re.S):
            for k, v in re.findall(r'"(price|lowPrice|highPrice|minPrice)"\s*:\s*"?([\d.]+)"?', block):
                n = int(float(v))
                if n and n not in ok:
                    bad.append(f"{rel}: JSON-LD {k}={v} нет в прайсе")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_prices.py"), "--check"],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        bad.append(r.stdout.strip() + " — запустить python tools/build_prices.py")
    print(f"страниц предложений: {len(pages)}, сумм в прайсе: {len(ok)}")
    for b in bad:
        print("  " + b)
    print("Расхождений нет." if not bad else f"Расхождений: {len(bad)}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
