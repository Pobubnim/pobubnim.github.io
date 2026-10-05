# -*- coding: utf-8 -*-
"""Блок «Что ещё пригодится» на страницах инструментов: ссылки на соседей по работе.

Зачем (аудит 05.10.2026, docs/research/audit_2026-10-05.md): ссылки между инструментами
стояли неровно. У договора аренды и согласия на съёмку ребёнка было по одной входящей
ссылке из текста страниц — и согласие в поиск не взято. Блок ставит каждой странице
пять-шесть соседей по ходу работы: бриф → смета → договор → шот-лист → вызывной →
чек-лист, рядом документы и расчёты. У каждой ссылки своя строка «зачем», поэтому
блок на каждой странице свой, а не сквозной.

Блок живёт между метками dalshe:begin / dalshe:end перед призывом внизу страницы.
Повторный запуск ничего не плодит. Новый инструмент = строка в TOOLS и в NEXT.

Запуск:  python tools/build_tool_chain.py          проставить
         python tools/build_tool_chain.py --check  показать расхождения (код 1)
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent

# ключ: (адрес, название, зачем)
TOOLS = {
    "brif": ("/instrumenty/brif-na-semku.html", "Бриф на съёмку", "собрать вводные у клиента до сметы и договора"),
    "smeta": ("/instrumenty/smeta-i-schet.html", "Смета и счёт", "посчитать работу по строкам и выставить счёт"),
    "dogovor": ("/konstruktor-dogovora.html", "Договор на съёмку", "закрепить сроки, деньги и права на материалы"),
    "reliz": ("/instrumenty/modelnyj-reliz.html", "Модельный релиз", "согласие героя на съёмку и публикацию"),
    "rebenok": ("/instrumenty/soglasie-na-semku-rebenka.html", "Согласие на съёмку ребёнка",
                "подпись родителя, если в кадре дети: школа, сад, студия"),
    "arenda": ("/instrumenty/dogovor-arendy-tehniki.html", "Договор аренды техники",
               "если берёте или сдаёте камеру, оптику и свет"),
    "shot": ("/instrumenty/shot-list.html", "Шот-лист", "разложить съёмку по кадрам и проверить, влезает ли план в смену"),
    "vyzyvnoj": ("/instrumenty/vyzyvnoj-list.html", "Вызывной лист", "время, адрес и телефоны — каждому в группе"),
    "chek": ("/instrumenty/chek-list-semki.html", "Чек-лист съёмки", "проверить по списку, что техника собрана и доехала"),
    "grip": ("/instrumenty/kalkulyator-grip.html", "Калькулятор ГРИП", "что попадёт в резкость и насколько размоется фон"),
    "nd": ("/instrumenty/kalkulyator-nd-filtra.html", "Калькулятор ND-фильтра", "какой фильтр ставить, чтобы удержать выдержку"),
    "karta": ("/instrumenty/kalkulyator-karty-pamyati.html", "Калькулятор карты памяти",
              "сколько минут влезет на карту и сколько карт брать"),
    "pribory": ("/instrumenty/pribory-onlajn.html", "Приборы онлайн", "проверить кадр по вейвформу, вектроскопу и false color"),
    "tajming": ("/instrumenty/tajming-svadby.html", "Тайминг свадьбы", "расписание свадебного дня по часам с закатом"),
    "stavka": ("/instrumenty/stavka-frilansera.html", "Ставка за смену", "сколько брать, чтобы работа окупала технику и налог"),
    "crm": ("/instrumenty/monolit-crm-dlya-videoprodakshena.html", "МОНОЛИТ", "заказы, клиенты и деньги в одном приложении"),
}

# страница → соседи по ходу работы
NEXT = {
    "brif": ["smeta", "dogovor", "shot", "vyzyvnoj", "tajming", "stavka"],
    "smeta": ["brif", "dogovor", "stavka", "arenda", "crm"],
    "dogovor": ["smeta", "reliz", "rebenok", "arenda", "tajming", "brif"],
    "reliz": ["rebenok", "dogovor", "arenda", "vyzyvnoj", "shot"],
    "rebenok": ["reliz", "dogovor", "vyzyvnoj", "chek", "smeta"],
    "arenda": ["chek", "dogovor", "karta", "smeta", "reliz"],
    "shot": ["vyzyvnoj", "chek", "brif", "grip", "tajming"],
    "vyzyvnoj": ["shot", "chek", "reliz", "rebenok", "arenda", "tajming"],
    "chek": ["vyzyvnoj", "karta", "nd", "arenda", "shot"],
    "grip": ["nd", "karta", "pribory", "shot", "chek"],
    "nd": ["grip", "karta", "pribory", "chek", "shot"],
    "karta": ["chek", "nd", "grip", "arenda", "pribory"],
    "pribory": ["grip", "nd", "karta", "shot", "stavka"],
    "tajming": ["vyzyvnoj", "shot", "dogovor", "chek", "rebenok"],
    "stavka": ["smeta", "dogovor", "brif", "crm", "arenda"],
    "crm": ["smeta", "stavka", "dogovor", "brif", "vyzyvnoj"],
}

BLOCK = re.compile(r"  <!-- dalshe:begin -->.*?<!-- dalshe:end -->\n", re.S)
ANCHOR = '  <div class="footer-cta"'


def block(key: str) -> str:
    items = "".join(f'      <li><a href="{TOOLS[k][0]}">{TOOLS[k][1]}</a> — {TOOLS[k][2]}.</li>\n' for k in NEXT[key])
    return ("  <!-- dalshe:begin -->\n"
            '  <div class="tool-next">\n'
            '    <h2 class="art-h2">Что ещё пригодится</h2>\n'
            f"    <ul>\n{items}    </ul>\n"
            "  </div>\n"
            "  <!-- dalshe:end -->\n")


def main() -> int:
    check = "--check" in sys.argv
    assert set(NEXT) == set(TOOLS), "TOOLS и NEXT разошлись"
    bad = 0
    for key, (href, _, _) in TOOLS.items():
        path = ROOT / href.lstrip("/")
        src = path.read_text(encoding="utf-8")
        clean = BLOCK.sub("", src)
        if clean.count(ANCHOR) != 1:
            print(f"ПРОПУСК {href}: призыв внизу страницы не найден или их несколько")
            bad += 1
            continue
        new = clean.replace(ANCHOR, block(key) + ANCHOR)
        if new != src:
            bad += 1
            if check:
                print("расходится:", href)
            else:
                path.write_text(new, encoding="utf-8", newline="\n")
                print("ok ", href)
    if check:
        print("страниц с расхождением:", bad)
        return 1 if bad else 0
    inbound = {k: sum(k in v for v in NEXT.values()) for k in TOOLS}
    print("входящих из блока: " + ", ".join(f"{k} {n}" for k, n in sorted(inbound.items(), key=lambda x: x[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
