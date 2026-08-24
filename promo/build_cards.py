# -*- coding: utf-8 -*-
"""Генератор вертикальных карточек для соцсетей (1080x1350, стиль сайта).

Карточка = словарь в CARDS. Запуск: python build_cards.py [альбом]
Рендер PNG — headless Chrome. Выход: promo/out/<альбом>-<n>.png
"""
import os, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "out"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Playfair+Display:ital,wght@1,500&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:#131311;color:#f2efe8;font-family:'Inter Tight',system-ui,sans-serif;font-weight:300;position:relative}
.bg{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
.veil{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(19,19,17,.62) 0%,rgba(19,19,17,.55) 40%,rgba(19,19,17,.94) 100%)}
.veil.solid{background:#131311}
.frame{position:absolute;inset:44px;border:1px solid rgba(255,253,245,.16);z-index:2;pointer-events:none}
.card{position:relative;z-index:3;height:100%;display:flex;flex-direction:column;padding:110px 104px}
.top{display:flex;justify-content:space-between;align-items:baseline;letter-spacing:.32em;font-size:26px;color:#a39e93;text-transform:uppercase;font-weight:400}
.kicker{margin-top:auto;letter-spacing:.3em;font-size:26px;color:#c9b98a;text-transform:uppercase;font-weight:400}
h1{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:500;font-size:96px;line-height:1.08;margin:36px 0 0}
h1 .plain{font-family:'Inter Tight';font-style:normal;font-weight:500}
.sub{font-size:37px;line-height:1.45;color:#cfcabd;margin-top:40px;max-width:800px}
.rows{margin-top:84px;display:flex;flex-direction:column}
.row{padding:36px 0;border-top:1px solid rgba(255,253,245,.1)}
.row:first-child{border-top:0;padding-top:0}
.row .h{display:flex;justify-content:space-between;align-items:baseline}
.row .name{font-size:39px;font-weight:500;letter-spacing:.01em}
.row .tag{font-family:'Playfair Display';font-style:italic;font-size:31px;color:#c9b98a;white-space:nowrap;margin-left:40px}
.row .d{font-size:28px;line-height:1.42;color:#a39e93;margin-top:12px;max-width:800px}
.row.plain{padding:41px 0}
.row.plain .name{font-size:50px;font-weight:400}
.bottom{margin-top:auto;padding-top:36px;border-top:1px solid rgba(255,253,245,.12);display:flex;justify-content:space-between;align-items:baseline;font-size:28px;color:#a39e93;letter-spacing:.06em}
.bottom.tight{margin-top:52px}
.bottom b{color:#f2efe8;font-weight:500}
.big-cta{margin-top:44px}
.big-cta .lead{font-size:40px;color:#cfcabd;line-height:1.5;max-width:820px}
.pill{display:inline-block;margin-top:52px;background:#f5efe2;color:#131311;font-weight:500;font-size:42px;padding:30px 64px;border-radius:999px}
.contacts{margin-top:46px;font-size:37px;line-height:1.75;color:#cfcabd}
.contacts b{color:#f2efe8;font-weight:500}
.note{margin-top:40px;font-size:30px;color:#6b675e;line-height:1.5}
"""

def page(body, bg=None, solid=False):
    veil = "veil solid" if solid else "veil"
    bgdiv = f'<div class="bg" style="background-image:url(\'{bg}\')"></div>' if bg else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body>{bgdiv}<div class="{veil}"></div><div class="frame"></div><div class="card">{body}</div></body></html>"""

def top(n, total, label="ПОБУБНИМ"):
    return f'<div class="top"><span>{label}</span><span>{n:02d} / {total:02d}</span></div>'

def rows(items):
    out = []
    for name, tag, d in items:
        cls = "row" if d else "row plain"
        tag_html = f'<span class="tag">{tag}</span>' if tag else ""
        d_html = f'<div class="d">{d}</div>' if d else ""
        out.append(f'<div class="{cls}"><div class="h"><span class="name">{name}</span>{tag_html}</div>{d_html}</div>')
    return f'<div class="rows">{"".join(out)}</div>'

def bottom(left="pobubnim.github.io", right="тг: <b>@sbphotoshoter</b>", tight=False):
    cls = "bottom tight" if tight else "bottom"
    return f'<div class="{cls}"><span>{left}</span><span>{right}</span></div>'

IMG = "../assets/img"

ALBUMS = {
  "edu": [
    page(
      top(1,4) +
      '<div class="kicker">Обучение · индивидуально · онлайн или очно</div>'
      '<h1>Научу<br>видеть кадр</h1>'
      '<div class="sub">Съёмка, свет, монтаж и цветокоррекция в DaVinci Resolve. Без воды — на настоящих проектах: моих и ваших.</div>'
      + bottom(tight=True),
      bg=f"{IMG}/about-camera.webp"),
    page(
      top(2,4) +
      '<div class="kicker" style="margin-top:70px">Кому подойдёт</div>'
      '<h1 style="font-size:74px">Четыре точки старта</h1>'
      + rows([
        ("Новичок","с нуля","База: экспозиция, композиция, свет. Камера не обязательна."),
        ("Видеограф","дороже","Постановочный свет, широкий кадр, log и RAW — за это платят больше."),
        ("Монтажёр","в цвет","Скоупы, ноды Resolve, look-дизайн по референсам."),
        ("Бизнес","сам себе продакшен","Ролики для соцсетей своими силами, без подрядчика на каждый пост."),
      ]) + bottom(), solid=True),
    page(
      top(3,4) +
      '<div class="kicker" style="margin-top:70px">Как устроено</div>'
      '<h1 style="font-size:74px">Программа —<br>под вашу цель</h1>'
      + rows([
        ("Занятие 90 минут","от 3 000 ₽","Разбор на практике, домашка по вашему материалу."),
        ("Онлайн или очно","","Созвон с разбором экрана — или живая съёмка на площадке."),
        ("Темы под вас","","База съёмки · свет · монтаж · цвет в DaVinci Resolve — собираем из блоков, а не по общей методичке."),
      ]) + bottom(), solid=True),
    page(
      top(4,4) +
      '<div class="kicker">Сентябрь — набор открыт</div>'
      '<h1 style="font-size:96px">Беру трёх<br>учеников</h1>'
      '<div class="big-cta"><div class="lead">Напишите, с чего стартуете и куда хотите прийти — соберу программу и скажу честно, сколько занятий нужно.</div>'
      '<div class="contacts">Телеграм — <b>@sbphotoshoter</b><br>Подробно: <b>pobubnim.github.io/education</b></div></div>',
      bg=f"{IMG}/about-steadicam.webp"),
  ],
  "svc": [
    page(
      top(1,4) +
      '<div class="kicker">Видеопродакшен полного цикла</div>'
      '<h1>Снимаю рекламу,<br>кино и людей</h1>'
      '<div class="sub">Идея, съёмка, монтаж, цвет и звук — один исполнитель от брифа до мастер-файла.</div>'
      + bottom(tight=True),
      bg=f"{IMG}/hero-poster.webp"),
    page(
      top(2,4) +
      '<div class="kicker" style="margin-top:70px">Снимал для</div>'
      '<h1 style="font-size:74px">Бренды и проекты</h1>'
      + rows([
        ("Альфа-Банк","",""),
        ("ГК ОСТОВ","",""),
        ("EverGO","",""),
        ("Абилимпикс","",""),
        ("Конвергентум · ERP Channel","",""),
      ]) + bottom(), solid=True),
    page(
      top(3,4) +
      '<div class="kicker" style="margin-top:70px">Что делаю</div>'
      '<h1 style="font-size:74px">Форматы и цены</h1>'
      + rows([
        ("Рекламный ролик под ключ","от 60 000 ₽","Идея, съёмочный день, монтаж, цвет, звук. 2–3 недели до мастера."),
        ("Свадебное кино","от 60 000 ₽","Полный день, фильм 2–4 минуты, церемония и тосты целиком."),
        ("Цветокоррекция","от 15 000 ₽","Грейд вашего материала в Resolve, удалённо, с раундами правок."),
        ("Смета — после брифа","бесплатно","Опишите задачу — посчитаю в тот же день."),
      ]) + bottom(), solid=True),
    page(
      top(4,4) +
      '<div class="kicker">Сентябрь–октябрь бронируются сейчас</div>'
      '<h1 style="font-size:96px">Обсудим<br>вашу задачу?</h1>'
      '<div class="big-cta"><div class="lead">Что снимаем или строим, сроки, ориентир бюджета — отвечу со сметой в тот же день.</div>'
      '<div class="contacts">Телеграм — <b>@sbphotoshoter</b><br>Работы и цены: <b>pobubnim.github.io</b></div></div>',
      bg=f"{IMG}/tri-bts-cam.webp"),
  ],
}

def build(album):
    OUT.mkdir(exist_ok=True)
    for i, html in enumerate(ALBUMS[album], 1):
        src = ROOT / f"{album}-{i:02d}.html"
        src.write_text(html, encoding="utf-8")
        png = OUT / f"{album}-{i:02d}.png"
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                        "--window-size=1080,1350", "--virtual-time-budget=12000",
                        f"--screenshot={png}", src.as_uri()],
                       check=True, capture_output=True)
        print("OK", png.name)

if __name__ == "__main__":
    targets = sys.argv[1:] or list(ALBUMS)
    for a in targets:
        build(a)
