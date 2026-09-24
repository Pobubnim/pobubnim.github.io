# -*- coding: utf-8 -*-
"""Единые шапка и подвал на всех страницах (ДС v2 «Режиссёрский сценарий»).

Было: 7 разных наборов пунктов, разъехавшихся по 56 файлам вручную (на главной
9 штук плюс два добавлял nav.js — строка переполнялась, «Обо мне» ломалось на
две строки, базовая линия скакала). Стало: один список здесь, статикой в HTML
(робот видит ссылки — JS-меню он не читает).

Запуск:  python tools/build_nav.py      (идемпотентен: второй прогон ничего не меняет)

ШАПКА (24.09.2026, docs/design/ §02): четыре раздела вместо семи — Работы ·
Услуги и цены · Обучение · Знания. Справа телефон и одна кнопка «Обсудить
проект». «Услуги и цены» открываются подбором «Видео для бизнеса» (.drop-lead),
дальше 8 услуг и прайс; «Обучение» — программы и уроки DaVinci; «Знания» —
статьи, инструменты и «Заказы сами» с точкой .hot. Ни одна ссылка шапки не
пропала — они стали по полкам.

ПОДВАЛ-НАВИГАТОР (там же): колонка бренда с контактами (телефон, телеграм,
ВКонтакте, канал) и две полки, как на главной v2: «Решения и города» (услуги,
прайс, города — /videosemka-moskva.html обязана быть в подвале каждой страницы,
SEO_RULES 17.09) и «Знания и обучение». Ссылки старого подвала, которых нет на
полках (на главной — статьи и уроки, СЕВЕРСВЕТ, MONOLITH), не выбрасываются:
они остаются на своей странице строкой «Ещё» под полками. Блок призыва
.footer-cta внутри подвала («Работы», «Обучение») сохраняется как есть.

Кнопка заявки в шапке держится рабочей: data-lead — assets/js/lead.js
перехватывает клик и открывает форму на месте, href остаётся запасным путём.
"""
from __future__ import annotations

import glob
import io
import os
import posixpath
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
# «Услуги и цены» (задание 24.09): первым пунктом — вход по задаче «Видео для
# бизнеса: подбор под задачу» (.drop-lead), дальше 8 услуг, последним — прайс
# (.drop-foot): кто пришёл за «сколько стоит», находит его в конце списка услуг.
SERVICES_LEAD = ("/video-dlya-biznesa.html", "Видео для бизнеса: подбор под задачу")
SERVICES = SOLUTIONS + [("/ceny.html", "Цены на все услуги", "drop-foot")]
# «Обучение»: программы и уроки DaVinci — всё, где человек учится сам
LEARN = [
    ("/education.html", "Программы обучения"),
    ("/uroki/", "Уроки DaVinci Resolve"),
]
# «Знания»: всё, что отвечает на вопрос, а не продаёт. «Заказы сами» — шоурум
# продукта; точка-маркер у пункта осталась (раньше он жил отдельным пунктом шапки)
KNOW = [
    ("/articles/", "Статьи и разборы цен"),
    ("/instrumenty/", "Инструменты для съёмки"),
    ("/zakazy-sami.html", "Заказы сами", "hot"),
]

TEL = ('<a class="nav-tel" href="tel:+79829054454" aria-label="Позвонить: +7 982 905-44-54">'
       '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 '
       '19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1'
       '-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
       '<span>+7 982 905-44-54</span></a>')

# ---------- подвал-навигатор: полки ----------
# Две полки, как на главной v2 (задание 24.09): «Решения и города» и «Знания и
# обучение»; внутри каждой — две колонки с подписью. Контакты — в колонке бренда.
FOOT = [
    ("Решения и города", [
        ("Услуги и цены", [("/video-dlya-biznesa.html", "Видео для бизнеса"), ("/ceny.html", "Цены на видеосъёмку")]
         + SOLUTIONS),
        ("Где снимаю", [("/videosemka-moskva.html", "Видеосъёмка в Москве"),
                        ("/videograf-naro-fominsk.html", "Съёмка в Наро-Фоминске"),
                        ("/videograf-aprelevka.html", "Съёмка в Апрелевке"),
                        ("/videograf-obninsk.html", "Съёмка в Обнинске"),
                        ("/raboty.html", "Работы по темам")]),
    ]),
    ("Знания и обучение", [
        ("Знания", [("/articles/", "Статьи и разборы цен"), ("/instrumenty/", "Инструменты"),
                    ("/konstruktor-dogovora.html", "Конструктор договора"), ("/zakazy-sami.html", "Заказы сами")]),
        ("Учиться", [("/education.html", "Программы обучения"), ("/uroki/", "Уроки DaVinci Resolve"),
                     ("/articles/obuchenie-videosemke-s-nulya.html", "Съёмка с нуля"),
                     ("/articles/kak-snimat-video-na-telefon.html", "Как снимать на телефон"),
                     ("/articles/cvetokorrekciya-video-kak-sdelat.html", "Цветокоррекция своими руками")]),
    ]),
]
TG, VK, CHANNEL = "https://t.me/sbphotoshoter", "https://vk.ru/sbphotoshoter", "https://t.me/pobubnimzavideo"
BASE = [(TG, "Телеграм"), (VK, "ВКонтакте"), (CHANNEL, "Канал"), ("/privacy.html", "Конфиденциальность")]
KNOWN = ({h for _, cols in FOOT for _, items in cols for h, _ in items} | {h for h, _ in BASE}
         | {"/", "tel:+79829054454"})


def link(href: str, text: str, page_url: str, cls: str = "") -> str:
    """Ссылка; текущий раздел помечается aria-current — человек видит, где он."""
    cur = ' aria-current="page"' if href == page_url else ""
    c = f' class="{cls}"' if cls else ""
    return f'<a{c} href="{href}"{cur}>{text}</a>'


def drop(title: str, items: list, page_url: str, lead: tuple[str, str] | None = None) -> str:
    # aria-expanded ведёт nav.js (открыто наведением, фокусом или щелчком); без JS
    # панель всё равно раскрывается по :focus-within — ссылки доступны с клавиатуры
    inner = (f'\n        {link(*lead, page_url, cls="drop-lead")}' if lead else "") + "".join(
        f'\n        {link(it[0], it[1], page_url, cls=it[2] if len(it) > 2 else "")}' for it in items)
    here = ' data-here' if any(it[0] == page_url for it in items) or (lead and lead[0] == page_url) else ""
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
        + drop("Услуги и цены", SERVICES, page_url, lead=SERVICES_LEAD)
        + drop("Обучение", LEARN, page_url)
        + drop("Знания", KNOW, page_url)
        + "\n    </nav>"
    )


def ext(href: str) -> str:
    return ' target="_blank" rel="noopener"' if href.startswith("http") else ""


def abs_url(href: str, page_url: str) -> str:
    """Относительная ссылка старого подвала → путь от корня, как у полок."""
    if re.match(r"^(https?:|tel:|mailto:|/|#)", href):
        return href
    base = page_url if page_url.endswith("/") else posixpath.dirname(page_url).rstrip("/") + "/"
    out = posixpath.normpath(posixpath.join(base, href))
    return out + ("/" if href.endswith("/") and not out.endswith("/") else "")


def footer_html(inner: str, page_url: str) -> str:
    # призыв внутри подвала («Работы», «Обучение») — остаётся первым, как был
    m = re.search(r'<div class="footer-cta[^"]*">.*?<div class="cta-row">.*?</div>\s*(?:<p class="cta-after">.*?</p>\s*)?</div>',
                  inner, re.S)
    cta = m.group(0) if m else ""
    rest = inner.replace(cta, "") if cta else inner
    extra, seen = [], set()
    for a in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', rest, re.S):
        href = abs_url(a.group(1), page_url)
        if href in KNOWN or href in seen or not re.sub(r"<[^>]+>", "", a.group(2)).strip():
            continue
        seen.add(href)
        extra.append(f'<a href="{href}"{ext(href)}>{a.group(2).strip()}</a>')
    shelves = "".join(
        f'\n      <div class="foot-shelf"><span class="label foot-shelf-t">{title}</span><div class="foot-shelf-in">'
        + "".join(f'<nav class="foot-col" aria-label="{sub}"><span class="foot-sub">{sub}</span>'
                  + "".join(link(h, t, page_url) for h, t in items) + "</nav>" for sub, items in cols)
        + "</div></div>"
        for title, cols in FOOT)
    return (
        '<footer class="footer">\n  <div class="wrap">'
        + (f"\n    {cta}" if cta else "")
        + '\n    <div class="foot-grid">'
        '\n      <div class="foot-col foot-brand">'
        '<a class="wordmark" href="/">ПОБУБНИМ<span>?</span></a>'
        "<p>Видеосъёмка, цвет и цифровые продукты. Москва, область, Обнинск — лично или командой продакшена MONOLITH7.</p>"
        '<a class="foot-tel" href="tel:+79829054454">+7 982 905-44-54</a>'
        f'<a href="{TG}" target="_blank" rel="noopener">Телеграм · @sbphotoshoter</a>'
        f'<a href="{VK}" target="_blank" rel="noopener">ВКонтакте — если телеграм не открывается</a>'
        f'<a href="{CHANNEL}" target="_blank" rel="noopener">Канал «Побубним за видео» →</a></div>'
        + shelves
        + "\n    </div>"
        + (f'\n    <nav class="foot-extra" aria-label="Ещё по теме"><span class="label">Ещё</span>{"".join(extra)}</nav>'
           if extra else "")
        + '\n    <div class="foot-base"><span>© 2026 Савелий Бубнов · ПОБУБНИМ</span>'
        '<nav aria-label="Контакты">' + "".join(f'<a href="{h}"{ext(h)}>{t}</a>' for h, t in BASE) + "</nav></div>"
        "\n  </div>\n</footer>"
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
    pages = [p for p in pages if not p.startswith(("videos/", "docs/", "promo/"))]
    changed = skipped = 0
    for p in pages:
        t = open(p, encoding="utf-8").read()
        if '<nav class="nav-links"' not in t:
            skipped += 1
            continue
        url = page_url_of(p)
        new = re.sub(r'<nav class="nav-links"[^>]*>.*?</nav>', lambda _: nav_html(url), t, count=1, flags=re.S)
        # кнопка заявки в шапке: одна на все страницы — «Обсудить проект» (ДС v2).
        # /#zayavka — запасной путь, data-lead открывает форму прямо на странице.
        # Кнопки с темой (обучение, приложение) и «Записаться» не трогаются.
        # (на статье про блёклую картинку она вела на /#contact — якоря с таким
        # именем на сайте нет, кнопка молча не работала)
        def head_btn(m: re.Match) -> str:
            h = re.sub(r'<a class="btn btn-lamp[^"]*" href="/#(?:zayavka|contact)"(?: data-lead)?>(?:Оставить заявку|Обсудить проект)</a>',
                       '<a class="btn btn-lamp" href="/#zayavka" data-lead>Обсудить проект</a>', m.group(0))
            return re.sub(r'<button class="btn btn-lamp"( type="button")? data-lead>Оставить заявку</button>',
                          r'<button class="btn btn-lamp"\1 data-lead>Обсудить проект</button>', h)
        new = re.sub(r"<header\b.*?</header>", head_btn, new, count=1, flags=re.S)
        # телефон в шапке (слово владельца 17.09: «да, везде»). Трафик Директа —
        # телефоны, а номера на сайте не было нигде, кроме JSON-LD для роботов.
        # Кнопка шапки на разных страницах своя (<a>/<button>, заявка/запись/обсудить),
        # поэтому якорь — «последняя крем-кнопка перед </header>».
        if p != "admin.html":
            new = re.sub(r'(?:<a class="nav-tel"[^>]*>.*?</a>\s*)?'
                         r'(<(a|button) class="btn btn-lamp[^"]*"[^>]*>[^<]*</\2>\s*'
                         r'(?:<button class="burger"[^>]*>.*?</button>\s*)?</div>\s*</header>)',
                         lambda m: TEL + "\n    " + m.group(1), new, count=1, flags=re.S)
            new = re.sub(r'<footer class="footer">(.*?)</footer>', lambda m: footer_html(m.group(1), url),
                         new, count=1, flags=re.S)
        if "data-lead" in new and "assets/js/lead.js" not in new:
            new = new.replace("</body>",
                              '<script src="/assets/js/lead.js" defer></script>\n</body>', 1)
        if new != t:
            open(p, "w", encoding="utf-8").write(new)
            changed += 1
    print(f"Шапка и подвал обновлены: {changed} страниц · без шапки: {skipped}")


if __name__ == "__main__":
    main()
