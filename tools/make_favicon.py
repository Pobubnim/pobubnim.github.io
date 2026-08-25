# -*- coding: utf-8 -*-
"""Фавиконы ПОБУБНИМ: чёрный скруглённый квадрат + кремовая курсивная «Б» (Georgia Italic).
Повторяет data:-SVG из шапок страниц. Выход: favicon.ico (16/32/48), favicon.svg,
apple-touch-icon.png (180). Запуск: python tools/make_favicon.py"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK, PAPER = (0, 0, 0, 255), (245, 239, 226, 255)  # #000 / #f5efe2
FONT = r"C:\Windows\Fonts\georgiai.ttf"

def render(size):
    # рисуем в 4x и уменьшаем — гладкие кромки на мелких размерах
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=round(s * 12 / 64), fill=INK)
    f = ImageFont.truetype(FONT, round(s * 44 / 64))
    l, t, r, b = d.textbbox((0, 0), "Б", font=f)
    d.text(((s - (r - l)) / 2 - l, (s - (b - t)) / 2 - t), "Б", font=f, fill=PAPER)
    return img.resize((size, size), Image.LANCZOS)

render(48).save(os.path.join(ROOT, "favicon.ico"),
                sizes=[(16, 16), (32, 32), (48, 48)])
render(180).save(os.path.join(ROOT, "apple-touch-icon.png"))

svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
       "<rect width='64' height='64' rx='12' fill='#000'/>"
       "<text x='32' y='45' font-family='Georgia,serif' font-style='italic'"
       " font-size='38' fill='#f5efe2' text-anchor='middle'>Б</text></svg>")
open(os.path.join(ROOT, "favicon.svg"), "w", encoding="utf-8").write(svg)
print("ok: favicon.ico, favicon.svg, apple-touch-icon.png")
