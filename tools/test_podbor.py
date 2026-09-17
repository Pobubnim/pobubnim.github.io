# -*- coding: utf-8 -*-
"""Приёмка страницы цен и подбора формата (ceny.html, video-dlya-biznesa.html, assets/js/podbor.js).

Что доказывает:
  1. прайс на странице собран из assets/data/prices.json целиком (каждая позиция на месте);
  2. подбор: задача → форматы с ценой из прайса; бюджет ниже цены — честная пометка;
  3. «Отправить подбор в телеграм» несёт задачу, формат, сроки и бюджет;
  4. «Оставить заявку» из подбора открывает форму с темой и готовым описанием;
  5. цель podbor_pick уходит один раз, а не на каждый клик;
  6. подбор работает и на странице «Видео для бизнеса»; «Цены» в шапке ведут на прайс.

Запуск:  python tools/test_podbor.py [url]   (сервер превью поднять заранее). Код 1 — есть провалы.
"""
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_lead import Tab, check, fails, URL  # noqa: E402  общий браузер и учёт провалов

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPY = ("window.__goals = []; window.ym = function () { window.__goals.push([].slice.call(arguments)); };"
       "addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[target=_blank]');"
       " if (a) e.preventDefault(); }, true);")


def pick(tab, name, text):
    return tab.js("(function () { var l = [].find.call(document.querySelectorAll('input[name=%s]'), function (i) {"
                  " return i.nextElementSibling.textContent === %s; }); if (l) l.click(); return !!l; })()"
                  % (name, json.dumps(text, ensure_ascii=False)))


def main():
    P = json.load(open(os.path.join(ROOT, "assets", "data", "prices.json"), encoding="utf-8"))
    ids = [it["id"] for g in P["groups"] for it in g["items"]]
    base = URL.rstrip("/")
    tab = Tab()
    try:
        tab.goto(base + "/ceny.html")
        tab.js(SPY)
        got = json.loads(tab.js("JSON.stringify([].map.call(document.querySelectorAll('.price-item'), function (x) { return x.id; }))"))
        check("прайс: на странице все позиции прайса и ничего лишнего",
              got == ["p-" + i for i in ids], [len(got), len(ids)])
        reklama = tab.js("document.querySelector('#p-reklama .price-val').textContent")
        check("прайс: цена позиции взята из прайса", (reklama or "").startswith("от 60 000 ₽"), reklama)

        check("подбор: вопросы нарисованы", pick(tab, "pb-task", "Продать товар или услугу"), "нет варианта задачи")
        time.sleep(0.3)
        heads = json.loads(tab.js("JSON.stringify([].map.call(document.querySelectorAll('.pb-item-head'), function (x) { return x.textContent; }))"))
        check("подбор: под продажу — рекламный ролик с ценой из прайса",
              heads and heads[0].startswith("Рекламный ролик под ключ") and "от 60 000 ₽" in heads[0], heads)
        pick(tab, "pb-budget", "до 30 тыс. ₽")
        pick(tab, "pb-when", "Дата уже назначена")
        time.sleep(0.3)
        over = json.loads(tab.js("JSON.stringify([].map.call(document.querySelectorAll('.pb-item'), function (x) { return !!x.querySelector('.pb-over'); }))"))
        check("подбор: ролик дороже бюджета помечен, съёмочный день в бюджете — нет",
              over[:1] == [True] and over[-1] is False, over)
        href = tab.js("decodeURIComponent(document.querySelector('.pb-cta a').href)") or ""
        check("подбор: сообщение в телеграм несёт задачу, формат, сроки и бюджет",
              all(s in href for s in ("Задача: Продать товар или услугу", "Формат: Рекламный ролик под ключ",
                                      "Сроки: Дата уже назначена", "Бюджет: до 30 тыс. ₽")), href[:160])
        tab.js("document.querySelector('[data-pb-lead]').click()")
        time.sleep(0.4)
        form = json.loads(tab.js("JSON.stringify({open: document.getElementById('lead').open,"
                                 " what: document.getElementById('lf-what').value, desc: document.getElementById('lf-desc').value})"))
        check("подбор: «Оставить заявку» открывает форму с темой и описанием",
              form["open"] and form["what"] == "Рекламный ролик" and "Сроки: Дата уже назначена" in form["desc"], form)
        goals = tab.js("window.__goals.filter(function (g) { return g[2] === 'podbor_pick'; }).length")
        check("подбор: цель podbor_pick ушла ровно один раз", goals == 1, goals)

        tab.goto(base + "/video-dlya-biznesa.html")
        pick(tab, "pb-task", "Снять мероприятие")
        time.sleep(0.3)
        first = tab.js("(document.querySelector('.pb-item-head') || {}).textContent || ''")
        check("хаб: подбор работает, мероприятие → съёмка мероприятия", first.startswith("Съёмка мероприятия"), first)
        asks = json.loads(tab.js("JSON.stringify([].map.call(document.querySelectorAll('.biz-ask'), function (a) { return decodeURIComponent(a.href); }))"))
        check("хаб: у каждой из 6 задач своя кнопка с задачей в тексте",
              len(asks) == 6 and all("Задача: " in a for a in asks), len(asks))
    finally:
        tab.close()

    stale = [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)
             if '/#services">Цены' in open(p, encoding="utf-8").read()]
    check("шапка: «Цены» везде ведут на страницу прайса", not stale, stale[:3])

    print()
    if fails:
        print("ПРОВАЛЫ: " + ", ".join(fails))
        sys.exit(1)
    print("Всё сошлось.")


if __name__ == "__main__":
    main()
