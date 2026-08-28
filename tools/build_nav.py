# -*- coding: utf-8 -*-
"""Единая верхняя навигация на всех страницах.

Было: 7 разных наборов пунктов, разъехавшихся по 56 файлам вручную (на главной
9 штук плюс два добавлял nav.js — строка переполнялась, «Обо мне» ломалось на
две строки, базовая линия скакала). Стало: один список здесь, статикой в HTML
(робот видит ссылки — JS-меню он не читает).

Запуск:  python tools/build_nav.py

Правило набора: в шапке живут РАЗДЕЛЫ сайта, а не якоря главной. Якоря
(«Цвет», «Кадры», «Продукты», «Обо мне») остаются в бургер-меню — nav.js.
CTA-кнопка у каждой страницы своя, скрипт её не трогает.
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
        '<nav class="nav-links">'
        f'\n      {link("/raboty.html", "Работы", page_url)}'
        + drop("Решения", SOLUTIONS, page_url)
        + f'\n      {link("/#services", "Цены", page_url)}'
        + drop("Обучение", LEARN, page_url)
        + f'\n      {link("/articles/", "Статьи", page_url)}'
        f'\n      {link("/instrumenty/", "Инструменты", page_url)}'
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
        if '<nav class="nav-links">' not in t:
            skipped += 1
            continue
        new = re.sub(r'<nav class="nav-links">.*?</nav>',
                     lambda _: nav_html(page_url_of(p)), t, count=1, flags=re.S)
        if new != t:
            open(p, "w", encoding="utf-8").write(new)
            changed += 1
    print(f"Шапка обновлена: {changed} страниц · без шапки: {skipped}")


if __name__ == "__main__":
    main()
