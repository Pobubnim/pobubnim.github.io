# -*- coding: utf-8 -*-
"""Запросная строка в H1 услуг и слова спроса в title (правка 05.10.2026).

Основание — docs/research/seo_razbor_2026-10-05.md, §2–3: у всех восьми услуг в H1
стоял только арт-заголовок («Музыкальный клип», «Свадебное кино»), а закон
docs/SEO_RULES.md требует запросную строку с городом ВНУТРИ <h1> первым
<span class="label">. Пять услуг Яндекс держит вне поиска как малоценные; у трёх
из них (клип, свадьба, мероприятия) в title не было слов, которыми заказывают:
«снять», «заказать», «цены».

Дистанционные услуги (цвет, сайты, боты) — без города: честное «удалённо».
Title трёх услуг, которые уже в поиске (реклама, имидж, цвет), не меняются.

Таблица — источник, страницы — производное.
Запуск:  python tools/seo_services_head.py --check   показать расхождения
         python tools/seo_services_head.py           привести страницы к таблице
"""
from __future__ import annotations

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = " | ПОБУБНИМ"

# страница: (запросная строка H1, новый title без бренда или None — не трогать)
HEAD = {
    "services/reklamnyj-rolik.html": ("Съёмка рекламного ролика в Москве и области", None),
    "services/imidzhevyj-film.html": ("Имиджевый фильм о компании: съёмка в Москве и области", None),
    "services/cvetokorrekciya.html": ("Цветокоррекция видео: колорист DaVinci Resolve, удалённо", None),
    "services/svadebnoe-kino.html": ("Свадебный видеограф в Москве и Московской области",
                                     "Свадебный видеограф в Москве — цены, заказать съёмку"),
    "services/muzykalnyj-klip.html": ("Съёмка клипа в Москве и области",
                                      "Снять клип в Москве — заказать съёмку клипа, цены"),
    "services/semka-meropriyatij.html": ("Видеосъёмка мероприятий в Москве и области",
                                         "Видеосъёмка мероприятий в Москве — заказать, цены"),
    "services/sozdanie-sajtov.html": ("Создание сайтов под ключ: удалённо, по всей России", None),
    "services/boty-avtomatizaciya.html": ("Телеграм-боты и автоматизация: удалённо, по всей России", None),
}

H1 = re.compile(r'(<h1 class="display">)(?:<span class="label">.*?</span> )?(.*?</h1>)', re.S)
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
OG = re.compile(r'(<meta property="og:title" content=")(.*?)(">)', re.S)


def main() -> int:
    check, bad = "--check" in sys.argv, 0
    for rel, (label, title) in HEAD.items():
        path = os.path.join(ROOT, rel)
        src = io.open(path, encoding="utf-8").read()
        new, n = H1.subn(lambda m: m.group(1) + '<span class="label">' + label + "</span> " + m.group(2), src, count=1)
        if n != 1:
            print("нет <h1 class=\"display\">:", rel)
            bad += 1
        if title:
            full = title + BRAND
            if not 50 <= len(full) <= 65:
                print(f"ВНЕ ВИЛКИ title {len(full)}: {rel}")
                bad += 1
            new = TITLE.sub("<title>" + full + "</title>", new, count=1)
            new = OG.sub(lambda m: m.group(1) + full + m.group(3), new, count=1)
        if new != src:
            if check:
                print("расходится с таблицей:", rel)
                bad += 1
            else:
                io.open(path, "w", encoding="utf-8", newline="\n").write(new)
                print("обновлено:", rel)
    print("услуг в таблице:", len(HEAD), "· замечаний:", bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
