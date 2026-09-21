# -*- coding: utf-8 -*-
"""OG-превью для уроков-досок: тёмная карточка с названием и строкой приборов.

Зачем отдельно от build_og_tools.py: у урока превью — не «лист бумаги», а доска.
Справа рисуется та же строка показаний, что человек увидит на странице, поэтому
ссылка в мессенджере сразу говорит, что там считают, а не пересказывают.

Числа в чипах — настоящие значения досок при их состоянии по умолчанию
(EDU_BASE §8о). Выдумывать их нельзя: ссылка обещает то, что страница покажет.

Запуск:  python tools/build_og_uroki.py   ->  assets/og/urok-<slug>.jpg
"""
import os

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "assets", "og")
os.makedirs(OUT, exist_ok=True)

W, H = 1200, 630
BG = (10, 10, 9)
PANEL = (18, 17, 16)
INK = (245, 239, 226)
MUTE = (138, 133, 122)
LAMP = (240, 214, 150)
LINE = (46, 44, 40)

# slug: (заголовок, надчерк, подпись панели, [(метка, значение), ...])
UROKI = {
    "petlichka-ili-pushka": (
        "Петличка или пушка: решает расстояние", "Урок 09 · Звук · живая доска",
        "ГОЛОС ПРОТИВ КОМНАТЫ",
        [("ПРЯМОЙ ЗВУК", "−23,5 дБ"), ("ГОЛОС / КОМНАТА", "−13,6 дБ"),
         ("ГРАНИЦА", "0,62 м"), ("НА СЛУХ", "как из бочки")]),
    "myagkij-svet": (
        "Мягкий свет: размер, а не мощность", "Урок 10 · Свет · живая доска",
        "СОФТБОКС 60 СМ В МЕТРЕ",
        [("УГЛОВОЙ РАЗМЕР", "33,4°"), ("ПОЛУТЕНЬ НА ФОНЕ", "90 см"),
         ("ФОН ТЕМНЕЕ", "2,6 ст."), ("СВЕТ", "очень мягко")]),
    "balans-belogo": (
        "Баланс белого и смешанный свет", "Урок 11 · Свет · живая доска",
        "ОКНО 5600 K И ЛАМПА 3000 K",
        [("ЛЕВАЯ ПОЛОВИНА", "нейтрально"), ("ПРАВАЯ ПОЛОВИНА", "в тепло · −2600 K"),
         ("РАЗБЕГ", "2600 K"), ("НА ПОСТЕ", "не свести")]),
    "mercanie-na-video": (
        "Мерцание: откуда в кадре полосы", "Урок 12 · Свет · живая доска",
        "СЕТЬ 50 ГЦ · ВЫДЕРЖКА 1/60",
        [("РАЗМАХ ПОЛОС", "33 %"), ("ПУЛЬСАЦИЯ", "100 Гц"),
         ("ПЕРИОДОВ В ВЫДЕРЖКЕ", "1,67 — не целое"), ("НА ЭКРАНЕ", "полосы")]),
}

NOTE = ("Бесплатно, без регистрации",
        "Считается в браузере: формулы, а не картинка для вида")

REPO_FONTS = os.path.join(REPO, "assets", "fonts")
FALLBACK = {"bold": "C:/Windows/Fonts/arialbd.ttf", "regular": "C:/Windows/Fonts/arial.ttf"}
VAR = os.path.join(REPO_FONTS, "InterTight-var.ttf")
WEIGHT = {"bold": "Bold", "regular": "Regular"}


def font(kind, size):
    if kind in WEIGHT and os.path.exists(VAR):
        f = ImageFont.truetype(VAR, size)
        f.set_variation_by_name(WEIGHT[kind])
        return f
    return ImageFont.truetype(FALLBACK[kind], size)


def wrap(draw, text, f, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        probe = (cur + " " + w).strip()
        if draw.textlength(probe, font=f) <= max_w:
            cur = probe
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def build():
    f_brand = font("bold", 26)
    f_over = font("regular", 22)
    f_title = font("bold", 54)
    f_note = font("regular", 24)
    f_cap = font("regular", 18)
    f_lab = font("regular", 17)
    f_val = font("bold", 26)

    for slug, (title, over, cap, chips) in UROKI.items():
        im = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(im)

        # правая колонка — панель доски
        px, py, pw = 700, 96, 430
        ph = 78 + len(chips) * 78 + 22
        d.rounded_rectangle([px, py, px + pw, py + ph], radius=18, fill=PANEL,
                            outline=LINE, width=1)
        d.text((px + 30, py + 30), cap, font=f_cap, fill=MUTE)
        y = py + 78
        for lab, val in chips:
            d.rounded_rectangle([px + 24, y, px + pw - 24, y + 62], radius=10,
                                fill=(24, 23, 21))
            d.text((px + 40, y + 10), lab, font=f_lab, fill=MUTE)
            d.text((px + 40, y + 30), val, font=f_val, fill=INK)
            y += 78

        # левая колонка — текст
        d.text((70, 74), "ПОБУБНИМ", font=f_brand, fill=INK)
        d.text((70, 118), over.upper(), font=f_over, fill=MUTE)
        y = 210
        for line in wrap(d, title, f_title, 560):
            d.text((70, y), line, font=f_title, fill=INK)
            y += 66
        d.text((70, max(y + 24, 470)), NOTE[0], font=f_note, fill=LAMP)
        for line in wrap(d, NOTE[1], f_note, 560):
            d.text((70, max(y + 60, 506)), line, font=f_note, fill=MUTE)
            break

        out = os.path.join(OUT, "urok-" + slug + ".jpg")
        im.save(out, quality=88)
        print("urok-" + slug + ".jpg", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    build()
