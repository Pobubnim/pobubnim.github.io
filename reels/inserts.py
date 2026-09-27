"""Вставки поверх кадра: графика, которую рисует код, а не нейросеть.

Нейросеть не умеет честные приборы и подписи: цифры на экране у неё выдуманные, буквы
плывут. Поэтому всё, где важна точность, рисуется здесь, в стиле сайта (стекло, крем,
янтарь, Inter Tight/JetBrains Mono), и ложится поверх кадра в сборке:

    {"type": "scope"}                                — осциллограмма яркости ЭТОГО кадра (по пикселям)
    {"type": "compare", "left": "LOG", "right": "Rec.709"}
                                                     — левая половина кадра переводится в плоский лог
    {"type": "wheels"}                               — колёса Lift / Gamma / Gain «как в DaVinci»
    {"type": "checklist", "items": ["…", "…"]}      — карточка-список с галочками
    {"type": "chip", "text": "…", "tone": "bad|good|info"} — плашка-вывод

Зона вставок — между титрами и подписью бренда (y 1380…1720 кадра 1080×1920),
чтобы вставка никогда не легла на субтитр.
"""

import colorsys
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
FONTS = ROOT.parent / "assets" / "fonts"

W, H = 1080, 1920
ZONE = (1380, 1720)
CREAM = (245, 239, 226)
AMBER = (232, 180, 94)
DIM = (156, 150, 138)
RED = (255, 90, 106)
GREEN = (35, 201, 140)
GLASS = (10, 10, 12, 205)
EDGE = (255, 255, 255, 26)

TONES = {"bad": RED, "good": GREEN, "info": AMBER}


def _inter(size, weight=600):
    f = ImageFont.truetype(str(FONTS / "InterTight-var.ttf"), size)
    f.set_variation_by_axes([weight])
    return f


def _mono(size):
    try:
        return ImageFont.truetype(str(FONTS / "JetBrainsMono-400-500-latin.woff2"), size)
    except OSError:
        return _inter(size, 500)


def _panel(layer, box, radius=30):
    """Стеклянная карточка: размытая тень + тёмное стекло + кромка 2 px + верхний блик."""
    x0, y0, x1, y1 = box
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x0, y0 + 14, x1, y1 + 14), radius, fill=(0, 0, 0, 150))
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius, fill=GLASS, outline=EDGE, width=2)
    d.line((x0 + radius, y0 + 2, x1 - radius, y0 + 2), fill=(255, 255, 255, 18), width=2)


def _eyebrow(d, xy, text, color=DIM):
    f = _inter(24, 700)
    x, y = xy
    for ch in text:  # разрядка .18em, как надглавия сайта
        d.text((x, y), ch, font=f, fill=color)
        x += d.textlength(ch, font=f) + 4


# ---------------------------------------------------------------- основа кадра

def logify(img):
    """Как выглядит тот же кадр в логе: тени подняты, света прижаты, цвет ушёл (упрощение:
    кривая степени 1/1,6 и 60 % десатурации, а не формула конкретной камеры)."""
    img = img.convert("RGB")
    lut = [int(255 * (0.16 + 0.62 * (i / 255) ** (1 / 1.6))) for i in range(256)]
    flat = img.point(lut * 3)
    gray = flat.convert("L").convert("RGB")
    return Image.blend(flat, gray, 0.6)


def compare_base(src, dst):
    """Кадр для сравнения: вырез 9:16 как в сборке, левая половина — лог, шов кремовый."""
    img = Image.open(src).convert("RGB")
    w, h = img.size
    cw = int(h * 9 / 16)
    img = img.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h))
    left = logify(img.crop((0, 0, cw // 2, h)))
    img.paste(left, (0, 0))
    d = ImageDraw.Draw(img)
    d.line((cw // 2, 0, cw // 2, h), fill=CREAM, width=3)
    img.save(dst)


# ---------------------------------------------------------------- вставки

def scope(frame, left=90, width=900):
    """Осциллограмма яркости по столбцам кадра (Rec.709: 0.2126 R + 0.7152 G + 0.0722 B).
    Считается по уменьшенному кадру — форма та же, что у прибора, считать быстрее."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    top, bottom = ZONE[0], ZONE[0] + 320
    _panel(layer, (left, top, left + width, bottom))
    d = ImageDraw.Draw(layer)
    _eyebrow(d, (left + 34, top + 26), "WAVEFORM · ЯРКОСТЬ")
    px, py = left + 96, top + 76
    pw, ph = width - 130, bottom - top - 104
    mono = _mono(22)
    for ire in (0, 25, 50, 75, 100):
        y = py + ph - ph * ire / 100
        d.line((px, y, px + pw, y), fill=(255, 255, 255, 22), width=1)
        d.text((left + 30, y - 13), f"{ire:>3}", font=mono, fill=DIM)
    small = frame.convert("RGB").resize((pw // 2, 360))
    cols, rows = small.size[0], 120
    grid = [[0] * rows for _ in range(cols)]
    data = small.load()
    for x in range(cols):
        for y in range(small.size[1]):
            r, g, b = data[x, y]
            luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            grid[x][min(rows - 1, int(luma * rows))] += 1
    peak = math.log1p(max(max(c) for c in grid))
    trace = Image.new("RGBA", (cols, rows), (0, 0, 0, 0))
    tp = trace.load()
    for x in range(cols):
        for b in range(rows):
            if grid[x][b]:
                a = int(255 * min(1, 0.25 + math.log1p(grid[x][b]) / peak))
                tp[x, rows - 1 - b] = (*AMBER, a)
    trace = trace.resize((pw, ph), Image.BILINEAR)
    glow = trace.filter(ImageFilter.GaussianBlur(3))
    layer.alpha_composite(glow, (px, py))
    layer.alpha_composite(trace, (px, py))
    return layer


def compare_labels(left="LOG", right="Rec.709"):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = _inter(40, 750)
    for text, cx, col in ((left, W // 4, DIM), (right, 3 * W // 4, AMBER)):
        tw = d.textlength(text, font=f)
        box = (cx - tw / 2 - 30, ZONE[0] + 20, cx + tw / 2 + 30, ZONE[0] + 96)
        _panel(layer, tuple(int(v) for v in box), radius=38)
        d = ImageDraw.Draw(layer)
        d.text((cx - tw / 2, ZONE[0] + 34), text, font=f, fill=col)
    return layer


def wheels(values=((-0.18, 0.1), (0.05, -0.08), (0.22, 0.12))):
    """Три колеса первичной коррекции: кольцо оттенков, тёмный центр, перекрестье, шайба."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    top, bottom = ZONE[0], ZONE[0] + 330
    _panel(layer, (70, top, W - 70, bottom))
    d = ImageDraw.Draw(layer)
    names = ("LIFT", "GAMMA", "GAIN")
    r_out, ring = 104, 16
    for i, (name, (dx, dy)) in enumerate(zip(names, values)):
        cx = 70 + (W - 140) * (i + 0.5) / 3
        cy = top + 150
        wheel = Image.new("RGBA", (r_out * 2 + 2, r_out * 2 + 2), (0, 0, 0, 0))
        wp = wheel.load()
        for y in range(wheel.size[1]):
            for x in range(wheel.size[0]):
                vx, vy = x - r_out, y - r_out
                dist = math.hypot(vx, vy)
                if r_out - ring <= dist <= r_out:
                    hue = (math.atan2(-vy, vx) / (2 * math.pi)) % 1
                    rr, gg, bb = colorsys.hsv_to_rgb(hue, 0.55, 0.78)
                    edge = min(1, (r_out - dist) / 1.5, (dist - (r_out - ring)) / 1.5)
                    wp[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), int(230 * edge))
                elif dist < r_out - ring - 6:
                    wp[x, y] = (16, 16, 20, 235)
        layer.alpha_composite(wheel, (int(cx - r_out), int(cy - r_out)))
        d = ImageDraw.Draw(layer)
        inner = r_out - ring - 6
        d.line((cx - inner, cy, cx + inner, cy), fill=(255, 255, 255, 30), width=2)
        d.line((cx, cy - inner, cx, cy + inner), fill=(255, 255, 255, 30), width=2)
        px, py = cx + dx * inner, cy - dy * inner
        d.ellipse((px - 11, py - 11, px + 11, py + 11), fill=CREAM, outline=(0, 0, 0, 200), width=3)
        f = _mono(24)
        tw = d.textlength(name, font=f)
        d.text((cx - tw / 2, cy + r_out + 20), name, font=f, fill=DIM)
    return layer


def checklist(items):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    row = 82
    top = ZONE[0]
    bottom = top + 44 + row * len(items)
    _panel(layer, (90, top, W - 90, bottom))
    d = ImageDraw.Draw(layer)
    f = _inter(40, 600)
    for i, text in enumerate(items):
        y = top + 30 + i * row
        d.ellipse((130, y + 6, 176, y + 52), outline=AMBER, width=3)
        d.line((142, y + 30, 151, y + 39), fill=AMBER, width=5)
        d.line((151, y + 39, 166, y + 19), fill=AMBER, width=5)
        d.text((204, y + 6), text, font=f, fill=CREAM)
    return layer


def chip(text, tone="info"):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f = _inter(40, 700)
    col = TONES.get(tone, AMBER)
    tw = d.textlength(text, font=f)
    x0 = (W - tw) / 2 - 78
    box = (int(x0), ZONE[0] + 20, int(x0 + tw + 132), ZONE[0] + 104)
    _panel(layer, box, radius=42)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, 42, outline=(*col, 110), width=2)
    cy = (box[1] + box[3]) / 2
    d.ellipse((box[0] + 34, cy - 9, box[0] + 52, cy + 9), fill=col)
    d.text((box[0] + 72, box[1] + 18), text, font=f, fill=CREAM)
    return layer


def render(spec, frame):
    """Слой вставки 1080×1920 (RGBA) по описанию из сценария; frame — кадр сцены 1080×1920."""
    kind = spec["type"]
    if kind == "scope":
        return scope(frame)
    if kind == "compare":
        return compare_labels(spec.get("left", "LOG"), spec.get("right", "Rec.709"))
    if kind == "wheels":
        return wheels()
    if kind == "checklist":
        return checklist(spec["items"])
    if kind == "chip":
        return chip(spec["text"], spec.get("tone", "info"))
    raise ValueError(f"неизвестная вставка {kind}")
