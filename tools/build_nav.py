# -*- coding: utf-8 -*-
"""Единая верхняя навигация на всех страницах.

Было: 7 разных наборов пунктов, разъехавшихся по 56 файлам вручную (на главной
9 штук плюс два добавлял nav.js — строка переполнялась, «Обо мне» ломалось на
две строки, базовая линия скакала). Стало: один список здесь, статикой в HTML
(робот видит ссылки — JS-меню он не читает).

Запуск:  python tools/build_nav.py

Правило набора: в шапке живут РАЗДЕЛЫ сайта, а не якоря главной. Якоря
(«Цвет», «Кадры», «Продукты», «Обо мне») остаются в бургер-меню — nav.js.
CTA-кнопка в подвале у каждой страницы своя, скрипт её не трогает.

Заодно скрипт держит рабочей кнопку заявки в ШАПКЕ: раньше она вела на
/#zayavka, то есть уносила человека с текущей страницы на главную. Теперь у
неё есть data-lead — assets/js/lead.js перехватывает клик и открывает форму
на месте, а href остаётся запасным путём, если скрипт не загрузился. Файл
lead.js подключается на каждой странице, где есть хоть одна кнопка заявки.
"""
from __future__ import annotations

import glob
import io
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOLUTIONS = [
    ("/services/reklamnyj-rolik.html", "Рекламный ролик"),
    ("/services/imidzhevyj-film.html", "Имиджевый фильм"),
    ("/services/svadebnoe-kino.html", "Свадебное кино"),
    ("/services/muzykalnyj-klip.html", "Музыкальный клип"),
    ("/services/cvetokorrekciya.html", "Цветокоррекция"),
    ("/services/semka-meropriyatij.html", "Съёмка мероприятий"),
    ("/services/sozdanie-sajtov.html", "Создание сайтов"),
    ("/services/boty-avtomatizaciya.html", "Боты и автоматизация"),
]

TEL = ('<a class="nav-tel" href="tel:+79829054454" aria-label="Позвонить: +7 982 905-44-54">'
       '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 '
       '19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1'
       '-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
       '<span>+7 982 905-44-54</span></a>')

LEARN = [
    ("/education.html", "Программы обучения"),
    ("/uroki/", "Уроки DaVinci Resolve"),
]


def link(href: str, text: str, page_url: str, cls: str = "") -> str:
    """Ссылка; текущий раздел помечается aria-current — человек видит, где он."""
    cur = ' aria-current="page"' if href == page_url else ""
    c = f' class="{cls}"' if cls else ""
    return f'<a{c} href="{href}"{cur}>{text}</a>'


def drop(title: str, items: list[tuple[str, str]], page_url: str) -> str:
    inner = "".join(
        f'\n        {link(h, t, page_url)}' for h, t in items)
    here = ' data-here' if any(h == page_url for h, _ in items) else ""
    return (
        f'\n      <div class="nav-drop"{here}>'
        f'\n        <button type="button">{title}<span class="caret">▾</span></button>'
        f'\n        <div class="drop-panel">{inner}\n        </div>'
        f"\n      </div>"
    )


def nav_html(page_url: str) -> str:
    return (
        '<nav class="nav-links" aria-label="Основная">'
        f'\n      {link("/raboty.html", "Работы", page_url)}'
        + drop("Решения", SOLUTIONS, page_url)
        + f'\n      {link("/#services", "Цены", page_url)}'
        + drop("Обучение", LEARN, page_url)
        + f'\n      {link("/articles/", "Статьи", page_url)}'
        f'\n      {link("/instrumenty/", "Инструменты", page_url)}'
        # ВХОД В ШОУРУМ ПРОДУКТА. Без него страница живёт только по прямой ссылке:
        # человек, попавший на любую другую страницу, о ней не узнаёт.
        f'\n      {link("/zakazy-sami.html", "Заказы сами", page_url, cls="hot")}'
        "\n    </nav>"
    )


def page_url_of(path: str) -> str:
    """Путь файла → канонический URL страницы (как в ссылках меню)."""
    rel = path.replace("\\", "/")
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def main() -> None:
    os.chdir(ROOT)
    pages = [p.replace("\\", "/") for p in glob.glob("**/*.html", recursive=True)]
    pages = [p for p in pages if not p.startswith("videos/")]
    changed = skipped = 0
    for p in pages:
        t = open(p, encoding="utf-8").read()
        if '<nav class="nav-links"' not in t:
            skipped += 1
            continue
        new = re.sub(r'<nav class="nav-links"[^>]*>.*?</nav>',
                     lambda _: nav_html(page_url_of(p)), t, count=1, flags=re.S)
        # кнопка «Оставить заявку» приводится к одному виду везде: /#zayavka —
        # запасной путь, data-lead открывает форму прямо на странице.
        # (на статье про блёклую картинку она вела на /#contact — якоря с таким
        # именем на сайте нет, кнопка молча не работала)
        new = re.sub(r'<a class="btn btn-lamp[^"]*" href="/#(?:zayavka|contact)">Оставить заявку</a>',
                     '<a class="btn btn-lamp" href="/#zayavka" data-lead>Оставить заявку</a>', new)
        # телефон в шапке (слово владельца 17.09: «да, везде»). Трафик Директа —
        # телефоны, а номера на сайте не было нигде, кроме JSON-LD для роботов.
        # На узкой шапке остаётся значок, на телефоне — кнопка рядом с бургером.
        # Кнопка шапки на разных страницах своя (<a>/<button>, заявка/запись/обсудить),
        # поэтому якорь — «последняя крем-кнопка перед </header>».
        if p != "admin.html":
            new = re.sub(r'(?:<a class="nav-tel"[^>]*>.*?</a>\s*)?'
                         r'(<(a|button) class="btn btn-lamp[^"]*"[^>]*>[^<]*</\2>\s*'
                         r'(?:<button class="burger"[^>]*>.*?</button>\s*)?</div>\s*</header>)',
                         lambda m: TEL + "\n    " + m.group(1), new, count=1, flags=re.S)
        if "data-lead" in new and "assets/js/lead.js" not in new:
            new = new.replace("</body>",
                              '<script src="/assets/js/lead.js" defer></script>\n</body>', 1)
        if new != t:
            open(p, "w", encoding="utf-8").write(new)
            changed += 1
    print(f"Шапка обновлена: {changed} страниц · без шапки: {skipped}")


if __name__ == "__main__":
    main()
