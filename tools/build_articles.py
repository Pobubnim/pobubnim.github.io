# -*- coding: utf-8 -*-
"""Генератор статей-разборов ПОБУБНИМ: articles/<slug>.html из ARTICLES.
Запуск: python tools/build_articles.py — перезаписывает все статьи.
Новая статья = новый словарь в ARTICLES -> перегенерировать -> закоммитить."""
import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "articles")
os.makedirs(OUT, exist_ok=True)

SITE = "https://pobubnim.github.io"

# Тело статьи — список блоков: ("h2", текст) | ("p", html) | ("table", [[...], ...]) | ("ul", [...])
ARTICLES = [
    {
        "slug": "skolko-stoit-reklamnyj-rolik",
        "title": "Сколько стоит рекламный ролик — разбор цены от видеографа | ПОБУБНИМ",
        "desc": "Из чего складывается цена рекламного ролика: съёмочный день, монтаж, цветокоррекция, звук. Реальные вилки от практикующего видеографа, на чём можно сэкономить, а на чём нельзя.",
        "h1": "Сколько стоит рекламный <em>ролик</em>",
        "label": "Разбор · Цены",
        "date": "2026-08-24",
        "lead": "Разбираю цену по частям — без «зависит от задачи» на полстраницы. Я снимаю рекламу сам, цифры ниже — мои реальные вилки.",
        "service": ("../services/reklamnyj-rolik.html", "Рекламный ролик под ключ — состав и цены"),
        "og_frame": "hz-watch-1.webp",
        "body": [
            ("p", "Короткий ответ: у меня ролик под ключ стоит <b>от 60 000 ₽</b> — это идея, съёмочный день, монтаж, цветокоррекция и звук. Только съёмочный день с материалом на руки — <b>от 30 000 ₽</b>. Дальше — из чего эта цена складывается и когда она вырастет."),
            ("h2", "Из чего складывается цена"),
            ("table", [
                ["Этап", "Что происходит", "Доля в бюджете"],
                ["Подготовка", "Идея, раскадровка, план съёмки, подбор локации", "≈ 10–15%"],
                ["Съёмочный день", "Камера, оптика, свет, работа на площадке", "≈ 40%"],
                ["Монтаж", "Отбор, сборка, ритм, версии под площадки", "≈ 20%"],
                ["Цветокоррекция", "Грейд: глубина, настроение, единый вид", "≈ 15%"],
                ["Звук", "Музыка, эффекты, сведение", "≈ 10%"],
            ]),
            ("p", "Когда студия называет цену втрое выше, это не обман — в смете появляются продюсер, аренда павильона, актёры и бригада из пяти человек. Для федеральной кампании это оправдано. Для ролика на сайт, в соцсети или на выставочный экран — чаще нет. Я работаю один и закрываю весь цикл сам, поэтому моя смета — это техника, время и опыт, без наценки за посредников."),
            ("h2", "Что делает ролик дороже"),
            ("ul", [
                "Вторая и третья локация — это переезды и свет заново, то есть часы съёмочного дня",
                "Массовка и актёры — кастинг, гонорары, договоры",
                "Сложная графика и 3D — отдельное ремесло с отдельным ценником",
                "Срочность: «нужно к пятнице» означает работу по ночам, и это честно стоит денег",
                "Права на известную музыку — лицензия может стоить дороже съёмки",
            ]),
            ("h2", "На чём можно сэкономить"),
            ("p", "Одна локация и один насыщенный съёмочный день закрывают большинство задач малого и среднего бизнеса. Вертикальные версии для Reels и Shorts я снимаю тем же днём — кадр строится под оба формата сразу, отдельная съёмка не нужна. А сцены, которые физически не снять — город с воздуха, массовку, фантастику — сейчас разумнее собрать на генеративном видео: у меня в <a href=\"../raboty.html#ai\">портфолио есть такие ролики</a>, и они дешевле съёмочного дня."),
            ("h2", "На чём экономить нельзя"),
            ("p", "На звуке и цвете. Зритель простит простую картинку, но выключит ролик с плохим звуком за три секунды. А без грейда материал из камеры выглядит блёклым — так устроена съёмка в log. Если из сметы предлагают «убрать цветокоррекцию для экономии», это значит, что вам отдадут полуфабрикат."),
        ],
        "faq": [
            ("Сколько времени занимает производство ролика?", "Типовой ролик — 2–3 недели от брифа до готового файла: неделя на подготовку, съёмочный день, неделя-полторы на монтаж и цвет. Срочнее — обсуждается."),
            ("Что нужно от меня как от заказчика?", "Полчаса на бриф, доступ к месту съёмки и один человек, который принимает решения. Остальное — моя работа."),
            ("Можно заказать только съёмку, без монтажа?", "Да, съёмочный день с передачей материала — от 30 000 ₽. Такой формат подходит, если у вас свой монтажёр."),
            ("Ролик снимается за один день?", "Большинство роликов из моего портфолио сняты за один съёмочный день с грамотным планом. Две локации за день — реально."),
        ],
    },
    {
        "slug": "kak-vybrat-svadebnogo-videografa",
        "title": "Как выбрать свадебного видеографа и сколько это стоит | ПОБУБНИМ",
        "desc": "На что смотреть в портфолио свадебного видеографа, какие вопросы задать до брони, что должно входить в цену и когда бронировать дату. Советы от практикующего видеографа.",
        "h1": "Как выбрать свадебного <em>видеографа</em>",
        "label": "Разбор · Свадьбы",
        "date": "2026-08-24",
        "lead": "Пишу как видеограф, который снимает свадьбы сам: на что смотреть в портфолио, какие вопросы задать до предоплаты и почему дешёвое видео почти всегда пересматривают со вздохом.",
        "service": ("../services/svadebnoe-kino.html", "Свадебное кино — состав и цены"),
        "og_frame": "hz-wedding.webp",
        "body": [
            ("p", "Свадьба — единственная съёмка, которую нельзя переснять. Платье можно перемерить, банкет повторить нельзя. Поэтому выбор видеографа — это не поиск «кто дешевле», а проверка, кому вы доверяете единственный дубль своего дня."),
            ("h2", "Сколько это стоит"),
            ("p", "У меня полный свадебный день — 10–12 часов от сборов до танцев — стоит <b>от 60 000 ₽</b>. В цену входит фильм на 2–4 минуты, полные записи церемонии и тостов, вертикальные фрагменты для соцсетей и цвет кинокачества. Вторая камера и дополнительные часы считаются отдельно."),
            ("p", "Цены на рынке разные, и низкие тоже бывают честными — например, у начинающих, которым нужно портфолио. Важно понимать, что именно вы получаете за эти деньги: часы на площадке, состав результата и сроки сдачи. Дальше — как это проверить."),
            ("h2", "Как смотреть портфолио"),
            ("ul", [
                "Просите полный свадебный фильм, а не только тизеры: минуту красивых кадров соберёт почти любой, держать историю 3–4 минуты — уже ремесло",
                "Слушайте звук: в хорошем фильме слышны клятвы, тосты и зал, а не только музыка поверх всего",
                "Смотрите цвет: кожа должна быть живой, белое платье — белым, а не серым и не оранжевым",
                "Проверьте, один ли человек снимал и монтировал то, что вам показывают — сборные шоурилы студий не говорят о том, кто приедет к вам",
            ]),
            ("h2", "Пять вопросов до брони"),
            ("ul", [
                "Сколько часов вы на площадке и что будет, если день затянется?",
                "Что именно я получу: хронометраж фильма, полные записи, вертикали?",
                "Когда будет готов фильм и зафиксировано ли это в договоре?",
                "Как вы работаете с фотографом — не будете ли мешать друг другу?",
                "Что будет, если вы заболеете в мой день?",
            ]),
            ("p", "Нормальный видеограф отвечает на эти вопросы спокойно и конкретно. Если в ответ звучит «да всё будет хорошо, не переживайте» — переживайте."),
            ("h2", "Красные флаги"),
            ("ul", [
                "Нет договора: сроки, состав и предоплата существуют только на словах",
                "Обещание отдать фильм «через неделю» в разгар сезона — либо конвейер, либо сроки сорвутся",
                "В портфолио только чужая музыка из трендов, под которую смонтированы все фильмы подряд — ваш день соберут по тому же шаблону",
                "Видеограф не спрашивает про вас: хороший фильм начинается с вопросов о паре, а не с прайса",
            ]),
            ("h2", "Когда бронировать"),
            ("p", "Летние и сентябрьские даты у видеографов уходят за 2–4 месяца. Если свадьба в сезон — начинайте искать сразу после того, как выбрали площадку. На осень и зиму свободы больше, а у некоторых видеографов, включая меня, вне сезона мягче условия."),
        ],
        "faq": [
            ("Обязательно ли брать и фото, и видео?", "Это разные результаты: фото — карточки на стену и в рамки, видео — голоса, клятвы и движение дня. Пары, которые сэкономили на видео, чаще всего жалеют именно о звуке — его не восстановить."),
            ("Сколько ждать готовый фильм?", "У меня тизер выходит в течение недели, полный фильм — до месяца. Сроки зафиксированы в договоре."),
            ("Нужна ли вторая камера?", "На церемонии она даёт запасной ракурс и живые реакции гостей. На камерной свадьбе до 30 гостей можно обойтись одной — честно скажу после разговора о вашем дне."),
            ("Вы работаете вместе с фотографом пары?", "Да, постоянно. Мы заранее договариваемся о зонах и ключевых моментах, чтобы не попадать друг другу в кадр."),
        ],
    },
]


def esc_text(s):
    return s.replace("<em>", "").replace("</em>", "").replace("<b>", "").replace("</b>", "")


def article_jsonld(a):
    return json.dumps({
        "@context": "https://schema.org", "@type": "Article",
        "headline": esc_text(a["h1"]),
        "description": a["desc"],
        "datePublished": a["date"],
        "inLanguage": "ru",
        "author": {"@type": "Person", "name": "Савелий Бубнов", "url": SITE + "/",
                   "jobTitle": "Оператор-постановщик, колорист"},
        "mainEntityOfPage": f"{SITE}/articles/{a['slug']}.html",
        "image": f"{SITE}/assets/og/{a['slug']}.jpg",
    }, ensure_ascii=False)


def faq_jsonld(faq):
    return json.dumps({
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq],
    }, ensure_ascii=False)


def breadcrumbs_jsonld(a):
    return json.dumps({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Главная", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": esc_text(a["h1"]),
             "item": f"{SITE}/articles/{a['slug']}.html"},
        ],
    }, ensure_ascii=False)


def body_html(blocks):
    out = []
    for kind, data in blocks:
        if kind == "h2":
            out.append(f'<h2 class="art-h2">{data}</h2>')
        elif kind == "p":
            out.append(f"<p>{data}</p>")
        elif kind == "ul":
            items = "".join(f"<li>{i}</li>" for i in data)
            out.append(f'<ul class="art-list">{items}</ul>')
        elif kind == "table":
            head = "".join(f"<th>{c}</th>" for c in data[0])
            rows = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in data[1:])
            out.append(f'<div class="art-table-wrap"><table class="art-table"><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>')
    return "\n      ".join(out)


def page(a):
    faq_html = "".join(
        f'<details class="svc-faq"><summary>{q}</summary><p>{ans}</p></details>' for q, ans in a["faq"])
    svc_href, svc_title = a["service"]
    return f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000000">
<title>{a["title"]}</title>
<meta name="description" content="{a["desc"]}">
<link rel="canonical" href="{SITE}/articles/{a["slug"]}.html">
<meta property="og:title" content="{a["title"]}">
<meta property="og:description" content="{a["desc"]}">
<meta property="og:image" content="{SITE}/assets/og/{a["slug"]}.jpg">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}/articles/{a["slug"]}.html">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23000'/%3E%3Ctext x='32' y='45' font-family='Georgia,serif' font-style='italic' font-size='38' fill='%23f5efe2' text-anchor='middle'%3EБ%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600&family=Playfair+Display:ital,wght@1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
<script type="application/ld+json">{article_jsonld(a)}</script>
<script type="application/ld+json">{faq_jsonld(a["faq"])}</script>
<script type="application/ld+json">{breadcrumbs_jsonld(a)}</script>
<style>
  .art-hero {{ padding-top: 150px; max-width: 760px; }}
  .art-hero .label {{ margin-bottom: 14px; display: block; }}
  .art-hero p.lead {{ color: var(--smoke); font-weight: 300; font-size: 19px; margin-top: 20px; text-wrap: pretty; }}
  .art-hero time {{ display: block; margin-top: 16px; font-size: 12.5px; color: var(--mute); letter-spacing: 0.06em; }}
  .art-body {{ max-width: 720px; margin-top: clamp(40px, 6vw, 64px); }}
  .art-body p {{ color: var(--smoke); font-weight: 300; font-size: 17px; text-wrap: pretty; margin-bottom: 16px; }}
  .art-body p b {{ color: var(--ink); font-weight: 500; }}
  .art-body a {{ text-decoration: underline; }}
  .art-h2 {{ font-size: clamp(24px, 2.6vw, 32px); margin: clamp(32px, 5vw, 48px) 0 16px; }}
  .art-list {{ list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }}
  .art-list li {{ font-size: 16px; color: var(--smoke); font-weight: 300; padding-left: 18px; position: relative; text-wrap: pretty; }}
  .art-list li::before {{ content: "·"; position: absolute; left: 2px; color: var(--mute); }}
  .art-table-wrap {{ overflow-x: auto; margin-bottom: 16px; }}
  .art-table {{ width: 100%; border-collapse: collapse; font-size: 15px; }}
  .art-table th {{ text-align: left; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mute); padding: 10px 14px 10px 0; border-bottom: 1px solid var(--line); }}
  .art-table td {{ color: var(--smoke); font-weight: 300; padding: 12px 14px 12px 0; border-bottom: 1px solid var(--line-soft); vertical-align: top; }}
  .art-table td:first-child {{ color: var(--ink); font-weight: 500; white-space: nowrap; }}
  .svc-faq {{ border-top: 1px solid var(--line-soft); padding: 18px 4px; }}
  .svc-faq:last-of-type {{ border-bottom: 1px solid var(--line-soft); }}
  .svc-faq summary {{ font-size: 16.5px; font-weight: 500; cursor: pointer; list-style: none; position: relative; padding-right: 30px; }}
  .svc-faq summary::after {{ content: "+"; position: absolute; right: 4px; top: 0; color: var(--mute); font-weight: 300; font-size: 20px; }}
  .svc-faq[open] summary::after {{ content: "–"; }}
  .svc-faq p {{ margin-top: 10px; color: var(--smoke); font-weight: 300; font-size: 15.5px; max-width: 640px; text-wrap: pretty; }}
  .art-svc {{ margin-top: clamp(40px, 6vw, 56px); display: flex; flex-direction: column; gap: 6px; padding: 26px; background: var(--char); border-radius: var(--r-card); max-width: 720px; }}
  .art-svc b {{ font-size: 17px; font-weight: 500; }}
  .art-svc span {{ font-size: 13px; color: var(--mute); letter-spacing: 0.05em; text-transform: uppercase; }}
</style>
</head>
<body>

<header class="nav solid">
  <div class="nav-in">
    <a class="wordmark" href="../index.html">ПОБУБНИМ<span>?</span></a>
    <nav class="nav-links">
      <a href="../raboty.html">Работы</a>
      <a href="../index.html#services">Цены</a>
      <a href="../education.html">Обучение</a>
    </nav>
    <a class="btn btn-lamp" href="../index.html#zayavka">Оставить заявку</a>
  </div>
</header>

<div class="wrap">
  <section class="art-hero">
    <span class="label">{a["label"]}</span>
    <h1 class="display">{a["h1"]}</h1>
    <p class="lead">{a["lead"]}</p>
    <time datetime="{a["date"]}">Обновлено {a["date"][8:10]}.{a["date"][5:7]}.{a["date"][0:4]}</time>
  </section>

  <div class="art-body">
      {body_html(a["body"])}
  </div>

  <a class="art-svc" href="{svc_href}"><b>{svc_title}</b><span>Смотреть решение →</span></a>

  <section class="svc-sec" style="margin-top: clamp(52px, 7vw, 80px); max-width: 720px;">
    <h2 class="art-h2" style="margin-top:0">Частые вопросы</h2>
    {faq_html}
  </section>

  <div class="footer-cta" style="padding-top:70px">
    <h2 class="display">Обсудим <em>задачу</em>?</h2>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      <a class="btn btn-lamp" href="https://t.me/sbphotoshoter" target="_blank" rel="noopener">Написать в телеграм</a>
      <a class="btn btn-ghost" href="https://vk.ru/sbphotoshoter" target="_blank" rel="noopener">Написать в ВК</a>
    </div>
  </div>
</div>

<footer class="footer">
  <div class="wrap footer-links">
    <span>© 2026 Савелий Бубнов · ПОБУБНИМ</span>
    <nav>
      <a href="../index.html">На главную</a>
      <a href="../raboty.html">Работы</a>
      <a href="../education.html">Обучение</a>
      <a href="https://t.me/pobubnimzavideo" target="_blank" rel="noopener">Канал</a>
    </nav>
  </div>
</footer>

<script src="../assets/js/nav.js" defer></script>
</body>
</html>
'''


if __name__ == "__main__":
    for a in ARTICLES:
        path = os.path.join(OUT, a["slug"] + ".html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(page(a))
        print(a["slug"] + ".html")
    print(f"итого {len(ARTICLES)} статей")
