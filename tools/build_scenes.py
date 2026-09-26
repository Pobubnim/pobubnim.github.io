# -*- coding: utf-8 -*-
"""Сцены на страницах услуг (ДС v2 «Режиссёрский сценарий», docs/design/).

Главная — фильм из сцен: каждая кончается склейкой «Дальше», в сценах говорит
автор. Услуги получили номер сцены над h2 (CSS), таймлайн и док (nav.js), но
сцены обрывались: человек не видел, что будет дальше и сколько ещё листать.
Этот скрипт раскладывает по 8 страницам services/*.html:

  1. СКЛЕЙКУ «Дальше · сцена 04» перед каждой следующей сценой (h2 в main,
     финальная — «Ваш ход», блок .footer-cta). Ссылка ведёт на якорь заголовка;
     после сцены цен — короткий путь к заявке (кнопка с темой услуги, lead.js).
  2. РЕПЛИКУ автора (.say) в сцене цен и в сцене «что прислать / как
     подготовиться». Тексты ниже — пересказ фактов со своей же страницы и из
     assets/data/prices.json: ни одной новой цифры, обещания или отзыва.
  3. РАЗМЕТКУ VideoObject для роликов, встроенных в страницу (услуги и
     /videosemka-moskva.html): имя и подпись — из подписи ролика на странице,
     длительность и дата выкладки — из data/films.json (как на raboty.html и
     гео-страницах). Ролик, которого нет в каталоге, разметку не получает.

Запуск:  python tools/build_scenes.py   (идемпотентен: второй прогон ничего не меняет)
Всё, что пишет скрипт, помечено data-gen="scenes" и перед прогоном снимается.
"""
from __future__ import annotations

import glob
import io
import json
import os
import posixpath
import re
import sys
from urllib.parse import urljoin

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# реплики: (начало заголовка сцены, текст). Сверено со страницей и прайсом 24.09.
SAY = {
    "reklamnyj-rolik": [
        ("Сколько стоит", "Смету считаю по сменам, людям и локациям, а не по секундам. Напишите, что рекламируем, "
                          "— отвечу в тот же день со сметой по сменам."),
        ("Как подготовиться", "Пришлите одну мысль, которую зритель должен унести, и где ролик будет крутиться. "
                              "С этого начинается смета, остальное соберём по брифу."),
    ],
    "imidzhevyj-film": [
        ("Сколько стоит", "Главный вопрос сметы — сколько нужно смен. Скажите, сколько площадок и кто будет говорить "
                          "в кадре, — число дней назову до подписи, чтобы смета не выросла по дороге."),
        ("Как подготовиться", "Больше всего съёмочного утра съедает проходная. Порядок допуска и список говорящих "
                              "лучше решить до смены — остальное закроет бриф."),
    ],
    "svadebnoe-kino": [
        ("Сколько стоит", "Свадьбу считаю днём, а не часами: уехать в середине нельзя. Летние даты бронируют "
                          "за 2–4 месяца, поэтому сначала пишите дату — проверю, свободен ли я."),
        ("Как подготовиться", "Главное, что мне нужно заранее, — расписание дня с адресами. По нему видно, "
                              "где съёмка не успевает физически, и это решается до свадьбы, а не в ней."),
    ],
    "muzykalnyj-klip": [
        ("Сколько стоит", "Смету собираю после того, как послушаю трек. Массовка, локации и графика идут "
                          "отдельной строкой — видно, за что платите и где можно сэкономить."),
        ("Как подготовиться", "Пришлите финальный мастер трека и дату релиза: под мастер строится план кадров, "
                              "от даты я считаю срок монтажа."),
    ],
    "cvetokorrekciya": [
        ("Сколько стоит", "Цену двигает состояние материала, а не длина ролика. Пришлите пару исходных файлов "
                          "как есть — по ним скажу, что лечится цветом и во что обойдётся."),
        ("Что прислать", "Работаю удалённо по всей России: материал приходит ссылкой, обычно хватает "
                         "одного сообщения с пунктами ниже."),
    ],
    "semka-meropriyatij": [
        ("Сколько стоит", "Считаю день целиком и число камер, а не длину программы. Экспресс-ролик в день "
                          "события возможен — если договоримся о нём до съёмки."),
        ("Как подготовиться", "Пришлите программу с таймингом и залами — по ней скажу, что успевает одна "
                              "камера и где нужна вторая."),
    ],
    "sozdanie-sajtov": [
        ("Сколько стоит", "Дороже делают не страницы, а механики: расчёт, кабинет, интеграции. Опишите, что "
                          "посетитель должен сделать на сайте, — от этого и считается смета."),
        ("Что прислать", "Обычно хватает одного письма по пунктам ниже. По нему назову цену и срок, "
                         "а не «от и до»."),
    ],
    "boty-avtomatizaciya": [
        ("Сколько стоит", "Цену определяют число систем, которые надо подружить, и цена ошибки. Там, где бот "
                          "трогает деньги и заявки, проверки дольше сборки, — это закладываю в смету сразу."),
        ("Что прислать", "Опишите процесс как есть, шаг за шагом. По этим пунктам видно, окупится "
                         "автоматизация или нет, ещё до сметы."),
    ],
}

# что снимается перед прогоном: ровно то, что скрипт пишет (вложенные div не дают
# обойтись одной регуляркой «до </div>», поэтому у каждого блока свой хвост)
GEN = [r'<div class="next scene-next" data-gen="scenes">.*?\n    </div>\n\n  ',
       r'\n    <div class="say scene-say" data-gen="scenes">.*?</p></div>']
H2 = re.compile(r'<h2 class="(?:svc-h2|display)"(?: id="([^"]+)")?>(.*?)</h2>', re.S)


def plain(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html)).strip()


def lower_first(t: str) -> str:
    # «Дальше: сколько стоит…», но аббревиатуры и имена («DaVinci») не трогаем
    return t[0].lower() + t[1:] if len(t) > 1 and t[1] == t[1].lower() else t


def build(t: str, slug: str) -> str:
    for g in GEN:
        t = re.sub(g, "", t, flags=re.S)
    main_a, main_b = t.index("<main"), t.index("</main>")
    body = t[main_a:main_b]
    topic = re.search(r'class="svc-hero".*?data-lead="([^"]+)"', body, re.S).group(1)

    # 1) якоря сцен: у заголовка должен быть id, иначе склейке некуда вести
    n = 1

    def anchor(m: re.Match) -> str:
        # свой якорь автора (id="voprosy") не трогаем; выданный скриптом «scena-NN»
        # перенумеровывается на каждом прогоне: новый раздел в середине страницы
        # иначе получил бы номер соседа, и склейка повела бы не туда
        nonlocal n
        n += 1
        if m.group(1) and not re.fullmatch(r"scena-\d+", m.group(1)):
            return m.group(0)
        tag = re.sub(r' id="scena-\d+"', "", m.group(0))
        return tag.replace('">', f'" id="scena-{n:02d}">', 1)

    body = H2.sub(anchor, body)

    # 2) реплики — сразу под заголовком своей сцены
    for start, text in SAY.get(slug, []):
        m = next((m for m in H2.finditer(body) if plain(m.group(2)).startswith(start)), None)
        if not m:
            raise SystemExit(f"{slug}: нет сцены «{start}…»")
        say = ('\n    <div class="say scene-say" data-gen="scenes">'
               '<img src="/assets/img/say.webp" alt="" width="36" height="36" loading="lazy">'
               f"<p><b>Савелий</b>{text}</p></div>")
        body = body[: m.end()] + say + body[m.end():]

    # 3) склейки: перед контейнером каждой следующей сцены
    heads = list(H2.finditer(body))
    out, last = [], 0
    prev_title = ""
    for i, m in enumerate(heads, start=2):
        cont = max(body.rfind("<section", 0, m.start()), body.rfind('<div class="footer-cta', 0, m.start()))
        final = body.startswith('<div class="footer-cta', cont)
        title = "ваш ход: обсудим задачу" if final else lower_first(plain(m.group(2)))
        alt = ""
        if prev_title.startswith("Сколько стоит"):
            alt = (f'\n      <p class="next-alt">Цена понятна? <button type="button" data-lead="{topic}">'
                   "Обсудить этот формат</button></p>")
        glue = ('<div class="next scene-next" data-gen="scenes">\n      <div class="next-go">'
                f'<span class="kicker">Дальше · сцена {i:02d}</span>'
                f'<a href="#{m.group(1)}">{title[0].upper() + title[1:]}'
                ' <span class="arrow down" aria-hidden="true">↓</span></a></div>' + alt + "\n    </div>\n\n  ")
        out.append(body[last:cont] + glue)
        last = cont
        prev_title = plain(m.group(2))
    body = "".join(out) + body[last:]
    return t[:main_a] + body + t[main_b:]


VIDEO_LD = re.compile(r'<script type="application/ld\+json" data-gen="scenes-video">.*?</script>\n', re.S)
FIGURE = re.compile(r'<figure class="svc-work">(.*?)</figure>', re.S)


def films() -> dict:
    out: dict = {}

    def walk(x):
        if isinstance(x, dict):
            # у одной работы бывает несколько записей (темы, главная); дата выкладки — только в темах
            if "id" in x and "len" in x and "up" in x:
                out[x["id"]] = x
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(json.load(open("data/films.json", encoding="utf-8")))
    return out


def iso(length: str) -> str:
    parts = [int(x) for x in length.split(":")]
    h, m, s = ([0] * (3 - len(parts)) + parts)[-3:]
    return "PT" + (f"{h}H" if h else "") + (f"{m}M" if m else "") + f"{s}S"


def video_ld(t: str, url: str, cat: dict) -> str:
    """Ролик ищется по имени файла (evergo.mp4 → evergo), порядок атрибутов не важен;
    адреса постера и ролика — как на странице, но абсолютные (локальный «Поля» тоже)."""
    t = VIDEO_LD.sub("", t)
    items = []
    for fig in FIGURE.findall(t):
        src = re.search(r'<video\b[^>]*\ssrc="([^"]+)"', fig)
        poster = re.search(r'<video\b[^>]*\sposter="([^"]+)"', fig)
        cap = re.search(r"<figcaption><b>(.*?)</b><span>(.*?)</span>", fig, re.S)
        if not (src and poster and cap):
            continue
        f = cat.get(posixpath.splitext(posixpath.basename(src.group(1)))[0])
        if not f:
            continue
        thumb = urljoin(url, poster.group(1))
        name, sub = plain(cap.group(1)), plain(cap.group(2))
        items.append({"@type": "VideoObject", "name": f"{name} — {sub}", "description": sub + ".",
                      "thumbnailUrl": thumb, "thumbnail": {"@type": "ImageObject", "url": thumb},
                      "contentUrl": urljoin(url, src.group(1)), "uploadDate": f["up"], "duration": iso(f["len"]),
                      "isFamilyFriendly": True, "url": url})
    if not items:
        return t
    ld = json.dumps({"@context": "https://schema.org", "@graph": items}, ensure_ascii=False)
    return t.replace("</head>", f'<script type="application/ld+json" data-gen="scenes-video">{ld}</script>\n</head>', 1)


def main() -> None:
    os.chdir(ROOT)
    changed = 0
    cat = films()
    # пути — всегда с прямой чертой: на Windows glob отдаёт services\\x.html, и проверка
    # «это услуга?» и адрес страницы в разметке ломались бы молча
    pages = [p.replace(os.sep, "/") for p in sorted(glob.glob("services/*.html"))] + ["videosemka-moskva.html"]
    for p in pages:
        slug = posixpath.basename(p)[:-5]
        t = open(p, encoding="utf-8").read()
        new = build(t, slug) if p.startswith("services/") else t
        new = video_ld(new, "https://pobubnim.ru/" + p, cat)
        if new != t:
            open(p, "w", encoding="utf-8").write(new)
            changed += 1
    print(f"Сцены и разметка роликов обновлены: {changed} страниц")


if __name__ == "__main__":
    main()
