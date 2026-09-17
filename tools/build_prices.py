# -*- coding: utf-8 -*-
"""Сборка цен из единого прайса assets/data/prices.json в страницы.

Зачем (17.09.2026): цены жили россыпью в 15 страницах, и новая страница цен стала бы
шестнадцатой копией — разъехалась бы при первой правке. Теперь цифра живёт в одном
файле, а страница собирается из него. Остальные страницы сверяет check_prices.py.

Страница отмечает места метками, сборка заменяет содержимое между ними:
  <!-- prices:table --> … <!-- /prices:table -->   прайс-лист по группам (видимый текст)
  <!-- prices:data -->  … <!-- /prices:data -->    JSON для подборщика (assets/js/podbor.js)
  <!-- prices:ld -->    … <!-- /prices:ld -->      JSON-LD каталог предложений

Запуск:  python tools/build_prices.py           пересобрать страницы с метками
         python tools/build_prices.py --check   код 1, если страница отстала от прайса
"""
import glob
import html
import json
import os
import re
import sys
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRICES = os.path.join(ROOT, "assets", "data", "prices.json")
TG = "https://t.me/sbphotoshoter"
SITE = "https://pobubnim.ru"


def rub(n):
    return f"{n:,}".replace(",", " ") + " ₽"


def e(s):
    return html.escape(str(s), quote=True)


def price_line(it):
    if not it.get("from"):
        return "по задаче", "считаю после пары вопросов"
    return "от " + rub(it["from"]), it.get("unit") or ""


def table(P):
    out = []
    for g in P["groups"]:
        out.append(f'\n    <div class="price-group" id="g-{g["id"]}">')
        out.append(f'      <h3 class="price-gh">{e(g["name"])}</h3>')
        if g.get("note"):
            out.append(f'      <p class="price-gnote">{e(g["note"])}</p>')
        out.append('      <div class="price-items">')
        for it in g["items"]:
            val, unit = price_line(it)
            also = "".join(f'<small>или от {rub(a["from"])} {e(a["unit"])}</small>' for a in it.get("also", []))
            lis = "".join(f"<li>{e(x)}</li>" for x in it["includes"])
            drv = " ".join(x for x in [
                ("Срок: " + it["term"] + ".") if it.get("term") else "",
                (it["drivers"][0].upper() + it["drivers"][1:] + ".") if it.get("drivers") else ""] if x)
            ask = (f"Здравствуйте! Пишу со страницы цен. Интересует: {it['name']} ({val}).\nЗадача: \nСроки: ")
            more = f'<a href="{e(it["url"])}">Подробнее</a>' if it.get("url") else ""
            out.append(
                f'        <div class="price-item" id="p-{it["id"]}">'
                f'<div class="price-top"><b>{e(it["name"])}</b><span class="price-val">{val}<small>{e(unit)}</small>{also}</span></div>'
                f'<ul>{lis}</ul>'
                + (f'<p class="price-drv">{e(drv)}</p>' if drv else "") +
                f'<div class="price-act">{more}<a href="{TG}?text={quote(ask, safe="")}" target="_blank" rel="noopener">Обсудить в телеграм</a></div>'
                '</div>')
        out.append("      </div>\n    </div>")
    return "\n".join(out) + "\n    "


def data(P):
    slim = {"groups": [{"id": g["id"], "items": [
        {k: it.get(k) for k in ("id", "name", "url", "lead", "from", "unit", "includes")} for it in g["items"]]}
        for g in P["groups"]]}
    return ('<script type="application/json" id="pb-prices">' +
            json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "</script>")


def ld(P):
    cats = []
    for g in P["groups"]:
        offers = []
        for it in g["items"]:
            svc = {"@type": "Service", "name": it["name"]}
            if it.get("url"):
                svc["url"] = SITE + it["url"]
            o = {"@type": "Offer", "itemOffered": svc}
            if it.get("from"):
                o["priceSpecification"] = {"@type": "PriceSpecification", "minPrice": it["from"], "priceCurrency": "RUB"}
            offers.append(o)
        cats.append({"@type": "OfferCatalog", "name": g["name"], "itemListElement": offers})
    node = {
        "@context": "https://schema.org", "@type": "ProfessionalService", "@id": SITE + "/#praktika",
        "name": "ПОБУБНИМ — Савелий Бубнов", "url": SITE + "/", "telephone": "+7 982 905-44-54", "priceRange": "₽₽",
        "image": SITE + "/assets/og/ceny.jpg",
        "address": {"@type": "PostalAddress", "addressLocality": "Наро-Фоминск", "addressRegion": "Московская область", "addressCountry": "RU"},
        "areaServed": [{"@type": "City", "name": "Москва"}, {"@type": "AdministrativeArea", "name": "Московская область"}],
        "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Прайс ПОБУБНИМ", "itemListElement": cats},
    }
    return '<script type="application/ld+json">' + json.dumps(node, ensure_ascii=False, separators=(",", ":")) + "</script>"


BLOCKS = {"table": table, "data": data, "ld": ld}


def build(text, P):
    for name, fn in BLOCKS.items():
        pat = re.compile(r"(<!-- prices:%s -->)(.*?)(<!-- /prices:%s -->)" % (name, name), re.S)
        text = pat.sub(lambda m: m.group(1) + fn(P) + m.group(3), text)
    return text


def main():
    check = "--check" in sys.argv
    P = json.load(open(PRICES, encoding="utf-8"))
    stale = []
    for p in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        t = open(p, encoding="utf-8").read()
        if "<!-- prices:" not in t:
            continue
        new = build(t, P)
        rel = os.path.relpath(p, ROOT).replace("\\", "/")
        if new != t:
            stale.append(rel)
            if not check:
                open(p, "w", encoding="utf-8", newline="").write(new)
    if check:
        print("отстали от прайса: " + ", ".join(stale) if stale else "страницы с метками совпадают с прайсом")
        sys.exit(1 if stale else 0)
    print("пересобраны: " + (", ".join(stale) or "ничего не изменилось"))


if __name__ == "__main__":
    main()
