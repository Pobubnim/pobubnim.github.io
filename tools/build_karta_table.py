# -*- coding: utf-8 -*-
"""Таблица готовых ответов «сколько видео влезет на карту» для калькулятора.

Числа НЕ пишутся руками: битрейты берутся из assets/js/karta-db.js (та же база,
что у калькулятора), длительность считается той же формулой, что и в karta.js
(маркировка карт 1 ГБ = 1000 МБ, округление вниз до минуты). Если строка ниже
не найдена в базе — скрипт валится: значит база изменилась и таблица врёт.

Запуск: python tools/build_karta_table.py   (перезаписывает блок в HTML)
"""
import io
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "assets" / "js" / "karta-db.js"
PAGE = ROOT / "instrumenty" / "kalkulyator-karty-pamyati.html"
CARDS = [64, 128, 256, 512]

# (подпись в таблице, камера в базе, начало названия режима)
ROWS = [
    ("Телефон · 4K 30p, HEVC", "iPhone (Pro)", "4K 30p · HEVC"),
    ("Телефон · 4K 60p, HEVC", "iPhone (Pro)", "4K 60p · HEVC"),
    ("Беззеркалка · Full HD 50p", "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)", "1080 50p · XAVC S HD"),
    ("Экшн-камера · 4K (GoPro)", "GoPro HERO 12 / 13", "5.3K/4K · HEVC"),
    ("Беззеркалка · 4K 24p, H.264", "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)", "4K 24p · XAVC S ("),
    ("Беззеркалка · 4K 60p", "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)", "4K 60p · XAVC S / HS"),
    ("All-Intra · 4K 30p", "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)", "4K 30p · XAVC S-I"),
    ("All-Intra · 4K 60p", "Sony Alpha / FX (a7S III, a7 IV, FX3, FX30)", "4K 60p · XAVC S-I"),
    ("ProRes 422 HQ · UHD 30p", "Внешний рекордер (Atomos и др.)", "UHD 30p · ProRes 422 HQ"),
    ("BRAW 6K 8:1 · Blackmagic", "BMD Pocket 6K / 6K Pro", "6K · BRAW 8:1"),
]


def load_db():
    """karta-db.js -> {камера: {режим: Мбит/с}}.

    Это JS-литерал (ключи без кавычек), json его не берёт: идём по файлу
    сверху вниз — очередное `name: "…"` открывает камеру, все `["режим", N]`
    после него принадлежат ей.
    """
    src = re.sub(r"/\*.*?\*/", "", DB.read_text(encoding="utf-8"), flags=re.S)
    out, cam = {}, None
    for m in re.finditer(r'name:\s*"([^"]+)"|\[\s*"([^"]+)"\s*,\s*(\d+)\s*\]', src):
        if m.group(1):
            cam = m.group(1)
            out[cam] = {}
        elif cam:
            out[cam][m.group(2)] = int(m.group(3))
    return out


def bitrate(db, cam, mode_prefix):
    modes = db.get(cam)
    if not modes:
        raise SystemExit(f"НЕТ КАМЕРЫ в базе: {cam}")
    hits = [v for k, v in modes.items() if k.startswith(mode_prefix)]
    if len(hits) != 1:
        raise SystemExit(f"режим «{mode_prefix}» у {cam}: совпадений {len(hits)}, нужно ровно 1")
    return hits[0]


def dur(seconds):
    """Как fmtDur в karta.js: вниз до минуты, часы через 'ч'."""
    m = int(seconds // 60)
    if m < 60:
        return f"{m} мин"
    return f"{m // 60} ч {m % 60:02d} мин"


def gb(mbytes):
    g = mbytes / 1000
    return (f"{round(g)}" if g >= 100 else f"{round(g * 10) / 10:g}").replace(".", ",") + " ГБ"


def main():
    db = load_db()
    head = "".join(f"<th>{c} ГБ</th>" for c in CARDS)
    body = []
    for label, cam, prefix in ROWS:
        mbit = bitrate(db, cam, prefix)
        speed = mbit / 8.0  # МБ/с
        cells = "".join(f"<td>{dur(c * 1000 / speed)}</td>" for c in CARDS)
        body.append(
            f'<tr><th scope="row">{label}</th><td>{mbit}</td>'
            f"<td>{gb(speed * 3600)}</td>{cells}</tr>"
        )
    table = (
        '<div class="dtable-wrap">\n<table class="dtable">\n'
        '<caption class="sr-caption">Сколько минут видео влезает на карту памяти при разных режимах записи</caption>\n'
        '<thead><tr><th scope="col">Режим записи</th><th scope="col">Мбит/с</th>'
        f'<th scope="col">Час записи</th>{head}</tr></thead>\n<tbody>\n'
        + "\n".join(body)
        + "\n</tbody>\n</table>\n</div>"
    )
    html = PAGE.read_text(encoding="utf-8")
    new = re.sub(
        r"(<!-- KARTA-TABLE:BEGIN -->).*?(<!-- KARTA-TABLE:END -->)",
        lambda m: m.group(1) + "\n" + table + "\n" + m.group(2),
        html, flags=re.S,
    )
    if new == html and "KARTA-TABLE:BEGIN" not in html:
        raise SystemExit("в странице нет маркеров <!-- KARTA-TABLE:BEGIN/END -->")
    PAGE.write_text(new, encoding="utf-8")
    print(table)
    print(f"\nОК: строк {len(ROWS)}, карт {len(CARDS)}")


if __name__ == "__main__":
    main()
