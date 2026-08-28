# -*- coding: utf-8 -*-
"""Генератор og-превью 1200x630 на каждую страницу: кадр + скрим + подпись.
Запуск: python tools/build_og.py  -> assets/og/<slug>.jpg
Источники кадров: assets/img/*.webp либо файл по абсолютному пути."""
import os
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(REPO, "assets", "img")
OUT = os.path.join(REPO, "assets", "og")
SCRATCH = r"C:\Users\User\AppData\Local\Temp\claude\C--src\4d0d3ace-d5ee-4e90-b428-7ba5fd17a02c\scratchpad"
os.makedirs(OUT, exist_ok=True)

# slug -> (файл кадра, заголовок на карточке)
PAGES = {
    "home":              (os.path.join(IMG, "hero-poster.webp"), "Видео · цвет · цифровые продукты"),
    "reklamnyj-rolik":   (os.path.join(SCRATCH, "evergo.webp"), "Рекламный ролик под ключ"),
    "imidzhevyj-film":   (os.path.join(IMG, "hz-therapy-1.webp"), "Имиджевый фильм о компании"),
    "svadebnoe-kino":    (os.path.join(IMG, "hz-wedding.webp"), "Свадебное кино"),
    "muzykalnyj-klip":   (os.path.join(SCRATCH, "banshee.webp"), "Музыкальный клип"),
    "cvetokorrekciya":   (os.path.join(IMG, "hz-field-still.webp"), "Цветокоррекция видео"),
    "semka-meropriyatij":(os.path.join(IMG, "ftx-poster.webp"), "Съёмка мероприятий"),
    "sozdanie-sajtov":   (os.path.join(IMG, "case-seversvet.webp"), "Создание сайтов"),
    "boty-avtomatizaciya":(os.path.join(SCRATCH, "monolith-shot.jpg"), "Боты и автоматизация"),
    "education":         (os.path.join(IMG, "about-camera.webp"), "Обучение съёмке и цвету"),
    "raboty":            (os.path.join(IMG, "tri-cine-portraits.webp"), "Работы: реклама, клипы, свадьбы"),
    "skolko-stoit-reklamnyj-rolik": (os.path.join(IMG, "hz-watch-1.webp"), "Сколько стоит рекламный ролик"),
    "kak-vybrat-svadebnogo-videografa": (os.path.join(IMG, "hz-wedding.webp"), "Как выбрать свадебного видеографа"),
    "case-monolith":     (os.path.join(SCRATCH, "monolith-shot.jpg"), "Кейс: приложение MONOLITH"),
    "case-seversvet":    (os.path.join(IMG, "case-seversvet.webp"), "Кейс: сайт СЕВЕРСВЕТ"),
    "uroki":             (os.path.join(IMG, "about-monitor.webp"), "Уроки DaVinci Resolve"),
}

W, H = 1200, 630

def cover(im):
    """Кроп-заполнение 1200x630 по центру."""
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))

def build():
    f_brand = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 34)
    f_title = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 56)
    for slug, (src, title) in PAGES.items():
        if not os.path.exists(src):
            # кадр из чужого скретчпада мог пропасть — готовый og при этом уже лежит в assets/og
            print(slug + ".jpg: источник пропал, пропускаю (" + src + ")")
            continue
        im = cover(Image.open(src).convert("RGB"))
        # скрим снизу
        overlay = Image.new("L", im.size, 0)
        d = ImageDraw.Draw(overlay)
        for y in range(340, H):
            d.line([(0, y), (W, y)], fill=int((y - 340) / (H - 340) * 190))
        im.paste(Image.new("RGB", im.size, (0, 0, 0)), (0, 0), overlay)
        d = ImageDraw.Draw(im)
        d.text((60, 470), "ПОБУБНИМ", font=f_brand, fill=(200, 196, 186))
        d.text((60, 516), title, font=f_title, fill=(245, 239, 226))
        out = os.path.join(OUT, slug + ".jpg")
        im.save(out, quality=86)
        print(slug + ".jpg", os.path.getsize(out) // 1024, "KB")

if __name__ == "__main__":
    build()
