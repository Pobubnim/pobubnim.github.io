# -*- coding: utf-8 -*-
"""Забирает шрифты сайта к себе: woff2-подмножества + assets/css/fonts.css.

Зачем: страницы тянули CSS и файлы с fonts.googleapis.com и fonts.gstatic.com —
это два лишних домена на каждой загрузке, а из России они регулярно
подтормаживают. Свои файлы отдаются с того же GitHub Pages и кэшируются.

Запуск:  python tools/fetch_fonts.py   (нужен интернет; сеть — только сюда)
Результат: assets/fonts/*.woff2 + assets/css/fonts.css
"""
import os
import re
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(REPO, "assets", "fonts")
CSS_OUT = os.path.join(REPO, "assets", "css", "fonts.css")
os.makedirs(FONTS, exist_ok=True)

# как на страницах: Inter Tight 300/400/500/600, Playfair italic 500, JetBrains Mono 400/500
# диапазоны весов, а не список: Google отдаёт ОДИН переменный woff2 на семейство
# вместо файла на каждый вес — для четырёх весов Inter Tight это втрое легче
FAMILIES = ("Inter+Tight:wght@300..600"
            "&family=Playfair+Display:ital,wght@1,500"
            "&family=JetBrains+Mono:wght@400..500")
# latin-ext и cyrillic-ext русскому сайту не нужны: это редкие диакритики,
# которые тянут по 87 КБ на вес и на наших страницах не встречаются
KEEP_SUBSETS = ("cyrillic", "latin")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def get(url, ua=UA):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": ua}), timeout=60).read()


def main():
    css = get("https://fonts.googleapis.com/css2?family=" + FAMILIES + "&display=swap").decode()

    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})", css, re.S)
    out, saved = [], 0
    out.append("/* Шрифты сайта, свои файлы (сгенерировано tools/fetch_fonts.py).\n"
               "   Google Fonts больше не запрашивается: меньше доменов и стабильнее из России.\n"
               "   Лицензии — SIL Open Font License, шрифты Inter Tight, Playfair Display,\n"
               "   JetBrains Mono. */\n")
    for subset, block in blocks:
        if subset not in KEEP_SUBSETS:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        weight = re.search(r"font-weight:\s*([\d ]+);", block).group(1).strip()
        style = re.search(r"font-style:\s*(\w+);", block).group(1)
        src = re.search(r"src:\s*url\((https://[^)]+)\)", block).group(1)
        name = "%s-%s%s-%s.woff2" % (fam.replace(" ", ""), weight.replace(" ", "-"),
                                     "i" if style == "italic" else "", subset)
        path = os.path.join(FONTS, name)
        if not os.path.exists(path):
            open(path, "wb").write(get(src))
        saved += os.path.getsize(path)
        block = block.replace(src, "../fonts/" + name).replace("font-display: swap;", "")
        block = re.sub(r"\s*\n\s*", "\n  ", block.strip())
        out.append(block.replace("{", "{\n  font-display: swap;", 1))
        print(name, os.path.getsize(path) // 1024, "КБ")

    open(CSS_OUT, "w", encoding="utf-8", newline="").write("\n".join(out) + "\n")
    print("\nfonts.css собран, файлов на", saved // 1024, "КБ")


if __name__ == "__main__":
    main()
