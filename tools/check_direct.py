# -*- coding: utf-8 -*-
"""Проверка пакета Яндекс.Директа и сборка таблиц для кабинета.

Источник один — docs/direct/kampaniya.json. Скрипт:
  1. валит пакет на том, что модерация или интерфейс Директа всё равно не примут
     (длины заголовков, текстов, быстрых ссылок, уточнений, длинные слова);
  2. ловит противоречия, которых глазом не видно: минус-слово режет свой же ключ,
     цена в объявлении не совпадает с прайсом сайта, посадочной или якоря нет;
  3. собирает docs/direct/KAMPANIYA.md — таблицы для ручного ввода в кабинет
     (итоговые ссылки уже с метками, которые понимает assets/js/lead.js).

Лимиты — справка Директа «Технические ограничения» (сверено 17.09.2026).
Запуск: python tools/check_direct.py      Код 1 — есть ошибки.
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "direct", "kampaniya.json")
OUT = os.path.join(ROOT, "docs", "direct", "KAMPANIYA.md")

LIM = {"title": 56, "title2": 30, "text": 81, "word_title": 22, "word_text": 23,
       "sl_title": 30, "sl_desc": 60, "callout": 25, "key_words": 7}

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def norm(s):
    return s.lower().replace("ё", "е")


def stem(w):
    """Грубая основа: минус-слово Директа ловит все словоформы, поэтому режем окончание."""
    return w[:max(4, len(w) - 2)] if len(w) > 4 else w


def words(s):
    return re.findall(r"[a-zа-я0-9]+", norm(s))


def neg_hits(neg, key):
    """Минус-фраза срабатывает, если ВСЕ её слова есть в ключе в любой форме."""
    kw = words(key)
    return all(any(k.startswith(stem(n)) for k in kw) for n in words(neg))


def page_ok(url):
    path, _, anchor = url.partition("#")
    f = os.path.join(ROOT, path.lstrip("/"))
    if path.endswith("/"):
        f = os.path.join(f, "index.html")
    if not os.path.isfile(f):
        return "страницы нет в репозитории"
    if anchor and f'id="{anchor}"' not in open(f, encoding="utf-8").read():
        return f"на странице нет якоря #{anchor}"
    return ""


def final_url(site, url, utm, name):
    path, _, anchor = url.partition("#")
    return site + path + "?" + utm.replace("{name}", name) + ("#" + anchor if anchor else "")


def check_len(where, field, value, limit, word_limit=None):
    if len(value) > limit:
        err(where, f"{field} {len(value)} > {limit}: «{value}»")
    if word_limit:
        for w in re.findall(r"\S+", value):
            if len(w.strip(".,:;!?«»()")) > word_limit:
                err(where, f"слово длиннее {word_limit}: «{w}»")


def main():
    data = json.load(open(SRC, encoding="utf-8"))
    prices = set(data["allowed_prices"])
    if "utm_source=" not in data["utm"] or "utm_medium=" not in data["utm"]:
        err("utm", "в шаблоне нет utm_source или utm_medium")

    md = ["# Кампании Директа — таблицы для кабинета",
          "",
          "Собрано `python tools/check_direct.py` из `docs/direct/kampaniya.json`. Руками не править.",
          "Как это ставить в кабинет и зачем именно так — `docs/DIRECT.md`.", ""]

    for c in data["campaigns"]:
        cw = f"[{c['name']}]"
        for i, s in enumerate(c["sitelinks"]):
            check_len(f"{cw} быстрая ссылка {i + 1}", "заголовок", s["title"], LIM["sl_title"])
            check_len(f"{cw} быстрая ссылка {i + 1}", "описание", s["desc"], LIM["sl_desc"])
            p = page_ok(s["url"])
            if p:
                err(f"{cw} быстрая ссылка «{s['title']}»", p)
        if not 4 <= len(c["sitelinks"]) <= 8:
            err(cw, f"быстрых ссылок {len(c['sitelinks'])}, нужно 4–8")
        for u in c["callouts"]:
            check_len(f"{cw} уточнение", "длина", u, LIM["callout"])

        all_keys = []
        titles = set()
        for g in c["groups"]:
            gw = f"{cw} группа «{g['name']}»"
            p = page_ok(g["url"])
            if p:
                err(gw, p)
            if len(g["ads"]) < 3:
                err(gw, f"объявлений {len(g['ads'])}, нужно не меньше 3 для ротации")
            for a in g["ads"]:
                check_len(gw, "заголовок", a["title"], LIM["title"], LIM["word_title"])
                check_len(gw, "доп. заголовок", a["title2"], LIM["title2"], LIM["word_title"])
                check_len(gw, "текст", a["text"], LIM["text"], LIM["word_text"])
                if a["title"] in titles:
                    err(gw, f"заголовок повторяется в кампании: «{a['title']}»")
                titles.add(a["title"])
                for p_ in re.findall(r"\d[\d\s]*\s?₽", " ".join(a.values())):
                    if re.sub(r"\s+", " ", p_.strip()) not in prices:
                        err(gw, f"цена «{p_.strip()}» не из прайса сайта {sorted(prices)}")
                for bad in ("лучш", "№1", "номер один", "гарант", "самый", "самая", "самое"):
                    if bad in norm(" ".join(a.values())):
                        err(gw, f"«{bad}…» — превосходная степень или гарантия, модерация 38-ФЗ")
            for k in g["keys"]:
                if len(words(k)) > LIM["key_words"]:
                    err(gw, f"в ключе больше {LIM['key_words']} слов: «{k}»")
                for n in c["negatives"]:
                    if neg_hits(n, k):
                        err(gw, f"минус-слово «{n}» режет свой ключ «{k}»")
                all_keys.append(norm(k))
        dup = {k for k in all_keys if all_keys.count(k) > 1}
        if dup:
            err(cw, f"ключи повторяются между группами: {sorted(dup)}")

        # --- таблицы для кабинета ---
        md += [f"## {c['title']}  (`{c['name']}`, этап {c['stage']})", "",
               f"- Тип: {c['type']}",
               f"- Регионы: {', '.join(c['regions'])}",
               f"- Расписание: {c['schedule']}",
               f"- Счётчик Метрики: {data['counter']}, разметка ссылок для Метрики — включить", "",
               "**Минус-фразы на кампанию** (по одной в строке, без минуса — так их принимает поле кампании):", "",
               "```", *c["negatives"], "```", "",
               "**Быстрые ссылки**", "", "| Заголовок | Описание | Ссылка |", "|---|---|---|"]
        md += [f"| {s['title']} | {s['desc']} | {final_url(data['site'], s['url'], data['utm'], c['name'])} |"
               for s in c["sitelinks"]]
        md += ["", "**Уточнения:** " + " · ".join(c["callouts"]), ""]
        for g in c["groups"]:
            md += [f"### Группа «{g['name']}»", "",
                   f"Ссылка: `{final_url(data['site'], g['url'], data['utm'], c['name'])}`", "",
                   "Ключевые фразы:", "", "```", *g["keys"], "```", "",
                   "| # | Заголовок | Доп. заголовок | Текст |", "|---|---|---|---|"]
            md += [f"| {i + 1} | {a['title']} ({len(a['title'])}) | {a['title2']} ({len(a['title2'])}) | "
                   f"{a['text']} ({len(a['text'])}) |" for i, a in enumerate(g["ads"])]
            md.append("")

    if errors:
        print("ОШИБКИ:")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    open(OUT, "w", encoding="utf-8").write("\n".join(md) + "\n")
    n_groups = sum(len(c["groups"]) for c in data["campaigns"])
    n_ads = sum(len(g["ads"]) for c in data["campaigns"] for g in c["groups"])
    n_keys = sum(len(g["keys"]) for c in data["campaigns"] for g in c["groups"])
    print(f"Пакет чистый: кампаний {len(data['campaigns'])}, групп {n_groups}, объявлений {n_ads}, "
          f"ключей {n_keys}. Таблицы: docs/direct/KAMPANIYA.md")


if __name__ == "__main__":
    main()
