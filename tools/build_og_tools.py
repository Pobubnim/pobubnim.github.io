# -*- coding: utf-8 -*-
"""OG-превью для инструментов: тёмная карточка с названием и мини-листом.

Зачем отдельно от build_og.py: у инструментов нет «кадра», их превью —
это документ. Раньше все двенадцать ссылок в мессенджерах выглядели
одинаково (общий og/home.jpg), теперь у каждой своя карточка.

Запуск:  python tools/build_og_tools.py   ->  assets/og/tool-<slug>.jpg
"""
import os

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "assets", "og")
os.makedirs(OUT, exist_ok=True)

W, H = 1200, 630
BG = (10, 10, 9)
PAPER = (247, 244, 236)
INK = (245, 239, 226)
MUTE = (138, 133, 122)
LAMP = (240, 214, 150)
DOC_INK = (34, 32, 28)
DOC_LINE = (201, 194, 178)

# slug: (заголовок карточки, надчерк, заголовок «документа», строки листа)
TOOLS = {
    "konstruktor-dogovora": ("Конструктор договоров", "Документы · договор и акт",
                             "ДОГОВОР № ___", ["1. Предмет договора", "2. Результат и сроки",
                                               "3. Стоимость и расчёты"]),
    "smeta-i-schet": ("Смета и счёт на оплату", "Деньги · документы",
                      "СМЕТА № ___", ["Съёмочная смена × 2", "Монтаж, за минуту × 3",
                                      "Итого: 78 000 ₽"]),
    "stavka-frilansera": ("Ставка за смену", "Деньги · расчёт",
                          "СТАВКА ЗА СМЕНУ", ["Доход 120 000 ₽ · 6 смен",
                                              "Налог, расходы, техника", "28 723 ₽ за смену"]),
    "brif-na-semku": ("Бриф на съёмку", "Клиент · документы",
                      "БРИФ НА СЪЁМКУ", ["1. Какая задача у ролика?", "2. Где будет публиковаться?",
                                         "3. Хронометраж и формат"]),
    "modelnyj-reliz": ("Модельный релиз", "Документы · согласие",
                       "СОГЛАСИЕ (РЕЛИЗ)", ["1. Разрешаю съёмку", "2. Объём использования",
                                            "ст. 152.1 ГК РФ"]),
    "shot-list": ("Шот-лист: план кадров", "Планирование · съёмка",
                  "ШОТ-ЛИСТ · СЦЕНА 1", ["1.1 Детали: кольца — ECU", "1.2 Проход — общий (WS)",
                                         "7 кадров · 2 ч 45 мин из 8 ч"]),
    "vyzyvnoj-list": ("Вызывной лист", "Планирование · съёмочный день",
                      "ВЫЗЫВНОЙ ЛИСТ · СМЕНА 1", ["Сбор группы 07:00 · выезд 07:40",
                                                  "Закат 18:54 · золотой час 18:05",
                                                  "Цех, ул. Ленина 14 — с 09:00"]),
    "tajming-svadby": ("Тайминг свадебного дня", "Планирование · свадьба",
                       "ТАЙМИНГ ДНЯ", ["10:30 — Сборы и утро", "13:00 — Церемония",
                                       "14:00 — Прогулка"]),
    "chek-list-semki": ("Чек-лист съёмочного дня", "Съёмка · сборы",
                        "ЧЕК-ЛИСТ", ["☑ Камера · ☑ Батареи", "☐ Петличка · ☐ Гаффер",
                                     "Собрано 12 из 55"]),
    "kalkulyator-grip": ("Калькулятор ГРИП", "Съёмка · оптика",
                         "ГЛУБИНА РЕЗКОСТИ", ["50 мм, f/2,8, фокус 3 м", "Резкость 2,74 – 3,32 м",
                                              "Фон размыт на 20 px"]),
    "kalkulyator-nd-filtra": ("Калькулятор ND-фильтра", "Съёмка · свет",
                              "НУЖНО ND", ["Шаттер 1/50, f/2,8, ISO 800", "Яркое солнце · EV 15",
                                           "9,4 стопа → ND500"]),
    "kalkulyator-karty-pamyati": ("Калькулятор карты памяти", "Съёмка · носители",
                                  "РАСЧЁТ КАРТЫ", ["100 Мбит/с · карта 128 ГБ",
                                                   "≈ 2 ч 50 мин видео", "Нужен класс V30"]),
}

REPO_FONTS = os.path.join(REPO, "assets", "fonts")
FALLBACK = {"bold": "C:/Windows/Fonts/arialbd.ttf", "regular": "C:/Windows/Fonts/arial.ttf",
            "serif": "C:/Windows/Fonts/times.ttf", "serif-bold": "C:/Windows/Fonts/timesbd.ttf"}
VAR = os.path.join(REPO_FONTS, "InterTight-var.ttf")   # переменный, с кириллицей
WEIGHT = {"bold": "Bold", "regular": "Regular"}


def font(kind, size):
    """Фирменный Inter Tight (переменный) из assets/fonts; иначе системный."""
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
    f_title = font("bold", 58)
    f_note = font("regular", 24)
    f_doc_h = font("serif-bold", 22)
    f_doc = font("serif", 21)

    for slug, (title, over, doc_h, doc_lines) in TOOLS.items():
        im = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(im)

        # правая колонка — «лист бумаги»
        px, py, pw = 700, 96, 430
        ph = 92 + len(doc_lines) * 62 + 44
        d.rounded_rectangle([px, py, px + pw, py + ph], radius=18, fill=PAPER)
        d.text((px + 34, py + 40), doc_h, font=f_doc_h, fill=DOC_INK)
        y = py + 92
        for line in doc_lines:
            d.text((px + 34, y), line, font=f_doc, fill=DOC_INK)
            d.line([(px + 34, y + 34), (px + pw - 34, y + 34)], fill=DOC_LINE, width=1)
            y += 62
        # марка «Б» на листе
        d.rounded_rectangle([px + pw - 66, py + ph - 62, px + pw - 26, py + ph - 22],
                            radius=8, fill=(0, 0, 0))
        d.text((px + pw - 57, py + ph - 56), "Б", font=f_doc_h, fill=PAPER)

        # левая колонка — текст
        d.text((70, 74), "ПОБУБНИМ", font=f_brand, fill=INK)
        d.text((70, 118), over.upper(), font=f_over, fill=MUTE)
        lines = wrap(d, title, f_title, 560)
        y = 210
        for line in lines:
            d.text((70, y), line, font=f_title, fill=INK)
            y += 70
        d.text((70, max(y + 24, 470)), "Бесплатно, без регистрации", font=f_note, fill=LAMP)
        d.text((70, max(y + 60, 506)), "Всё считается в браузере — данные никуда не уходят",
               font=f_note, fill=MUTE)

        out = os.path.join(OUT, "tool-" + slug + ".jpg")
        im.save(out, quality=88)
        print("tool-" + slug + ".jpg", os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    build()
