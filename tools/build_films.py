# -*- coding: utf-8 -*-
"""Каталог работ → статический HTML.

Источник правды: data/films.json (темы портфолио, избранное главной, лента кадров).
Скрипт вписывает готовую разметку в raboty.html и index.html между маркерами —
до этого карточки рисовал JS, и для поисковика обе страницы были почти пустыми
(портфолио: 112 слов, ни одного названия работы в HTML).

Запуск:  python tools/build_films.py

Новая работа = строка в data/films.json + прогон скрипта. Поведение (наведение,
плеер) навешивает assets/js/films.js на уже существующие в HTML карточки.
"""
from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "films.json").read_text(encoding="utf-8"))
LIB = "https://seversvet.github.io/assets/film/"


def esc(s: str) -> str:
    """Экранирование для атрибута (в подписях есть кавычки-ёлочки и <em>)."""
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def plain(s: str) -> str:
    """Текст без разметки — для alt и aria."""
    return re.sub(r"<[^>]+>", "", s)


def poster(f: dict) -> str:
    # обложки держим у себя: видео остаётся хотлинком на соседнюю площадку,
    # но её падение больше не превращает портфолио в пустые плашки
    return f"/assets/img/{f['id']}-poster.webp" if f.get("local") else f"/assets/img/film/{f['id']}.webp"


def base(f: dict) -> str:
    return "/assets/video/" if f.get("local") else LIB


def iso_duration(length: str) -> str:
    """«10:47» → PT10M47S (для VideoObject)."""
    parts = [int(p) for p in length.split(":")]
    if len(parts) == 3:
        h, m, s = parts
    else:
        h, (m, s) = 0, parts
    out = "PT" + (f"{h}H" if h else "") + (f"{m}M" if m else "") + f"{s}S"
    return out


def card(f: dict, vert: bool, indent: str = "      ") -> str:
    w, h = ("720", "1280") if vert else ("1280", "720")
    alt = esc(f"{plain(f['t'])} — {f['s']}")
    src = base(f) + f["id"] + ".mp4"
    return (
        f'{indent}<div class="film" data-src="{esc(src)}"{" data-vert" if vert else ""} '
        f'tabindex="0" role="button" aria-label="{alt}, смотреть видео">\n'
        f'{indent}  <img loading="lazy" width="{w}" height="{h}" src="{esc(poster(f))}" alt="{alt}">\n'
        f'{indent}  <video muted loop playsinline preload="none" src="{esc(base(f) + f["id"] + "-loop.mp4")}"></video>\n'
        f'{indent}  <span class="film-len">{f["len"]}</span>\n'
        f'{indent}  <div class="film-cap"><b>{f["t"]}</b><span>{f["s"]}</span></div>\n'
        f"{indent}</div>"
    )


def themes_html() -> str:
    out = []
    for th in DATA["themes"]:
        cards = "\n".join(card(f, bool(th.get("vert")), "        ") for f in th["films"])
        cta_href, cta_text = th["cta"]
        if not cta_href.startswith(("http", "/")):
            cta_href = "/" + cta_href
        out.append(
            f'  <section class="theme" id="{th["id"]}">\n'
            f'    <div class="wrap">\n'
            f'      <div class="sec-head rv">\n'
            f'        <span class="label">{th["n"]} · Работы</span>\n'
            f'        <h2>{th["t"]}</h2>\n'
            f'        <p class="sub">{th["sub"]}</p>\n'
            f"      </div>\n"
            f'      <div class="films{" films-vert" if th.get("vert") else ""} rv" style="margin-top:0">\n'
            f"{cards}\n"
            f"      </div>\n"
            f'      <div class="theme-cta rv"><a class="pill" href="{cta_href}">{cta_text} →</a>'
            f"<span>решение: что входит, цены, ответы</span></div>\n"
            f"    </div>\n"
            f"  </section>"
        )
    return "\n".join(out)


def jsonld_items() -> str:
    """ItemList из тем — описания совпадают с тем, что видит человек."""
    items, pos = [], 0
    for th in DATA["themes"]:
        for f in th["films"]:
            pos += 1
            items.append(json.dumps({
                "@type": "VideoObject",
                "position": pos,
                "name": f"{plain(f['t'])} — {f['s']}",
                "description": f"{f['s']}. Тема: {plain(th['t'])}.",
                "duration": iso_duration(f["len"]),
                "thumbnailUrl": poster(f) if poster(f).startswith("http")
                                else "https://pobubnim.ru" + poster(f),
                "contentUrl": (base(f) + f["id"] + ".mp4") if base(f).startswith("http")
                              else "https://pobubnim.ru" + base(f) + f["id"] + ".mp4",
            }, ensure_ascii=False))
    return ",\n".join(items)


def replace_block(text: str, marker: str, body: str) -> str:
    """Заменяет содержимое между <!-- marker:START --> и <!-- marker:END -->."""
    pat = re.compile(
        rf"(<!-- {marker}:START -->).*?(<!-- {marker}:END -->)", re.S)
    if not pat.search(text):
        raise SystemExit(f"маркер {marker} не найден — вставьте его в файл")
    return pat.sub(lambda m: f"{m.group(1)}\n{body}\n{m.group(2)}", text)


def main() -> None:
    # --- портфолио ---
    p = ROOT / "raboty.html"
    t = p.read_text(encoding="utf-8")
    t = replace_block(t, "THEMES", themes_html())
    # JSON-LD правится подстановкой: комментарий-маркер внутри JSON ломает разметку
    t, n = re.subn(r'("itemListElement":\[\n).*?(\]\}\n</script>)',
                   lambda m: m.group(1) + jsonld_items() + "]}\n</script>", t, flags=re.S)
    if n != 1:
        raise SystemExit("не нашёл itemListElement в raboty.html")
    p.write_text(t, encoding="utf-8")

    # --- главная ---
    p = ROOT / "index.html"
    t = p.read_text(encoding="utf-8")
    home = "\n".join(card(f, False) for f in DATA["home"])
    home += (
        '\n      <a class="film film-more" href="/raboty.html">'
        '<div class="film-more-in"><b>Все работы — по темам</b>'
        "<span>реклама, имидж, события, клипы, свадьбы, ИИ →</span></div></a>"
    )
    t = replace_block(t, "HOME-FILMS", home)
    t = replace_block(t, "HOME-VERT", "\n".join(card(f, True) for f in DATA["homeVert"]))
    strip = "\n".join(
        f'      <figure><img loading="lazy" width="720" height="1280" '
        f'src="/assets/img/{s["img"]}.webp" alt="{esc(s["cap"])}">'
        f'<figcaption>{s["cap"]}</figcaption></figure>'
        for s in DATA["strip"])
    t = replace_block(t, "STRIP", strip)
    p.write_text(t, encoding="utf-8")

    films = sum(len(th["films"]) for th in DATA["themes"])
    print(f"Готово: портфолио — {len(DATA['themes'])} тем и {films} работ, "
          f"главная — {len(DATA['home'])}+{len(DATA['homeVert'])} карточек "
          f"и {len(DATA['strip'])} кадров ленты.")


if __name__ == "__main__":
    main()
