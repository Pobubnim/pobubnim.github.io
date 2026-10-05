# -*- coding: utf-8 -*-
"""Список городов для расчёта света (assets/js/sun.js, массив CITIES).

Зачем: в листе было 19 городов, остальным приходилось искать широту и долготу
руками. Скрипт берёт координаты и часовую зону у геокодера Open-Meteo (на этапе
сборки, один раз — в браузере посетителя запросов нет), смещение пояса считает
по базе tz и вписывает массив между метками CITIES:BEGIN / CITIES:END.

В список идут только страны без перевода часов: смещение хранится числом, и
летнее время его бы сломало.

Запуск:  python tools/build_cities.py            # пересобрать список
         python tools/build_cities.py --check     # только сверить, что файл собран этим скриптом
"""
from __future__ import annotations

import datetime
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zoneinfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUN = os.path.join(ROOT, "assets", "js", "sun.js")
CACHE = os.path.join(ROOT, "tools", "cities_cache.json")

# Первые девятнадцать выставлены руками 26.08.2026 и сверены verify_sun.py — их не трогаем.
FIXED = [
    ["Москва", 55.7558, 37.6173, 3], ["Наро-Фоминск", 55.3853, 36.7325, 3], ["Обнинск", 55.0968, 36.6104, 3],
    ["Калуга", 54.5293, 36.2754, 3], ["Тула", 54.1961, 37.6182, 3], ["Санкт-Петербург", 59.9311, 30.3609, 3],
    ["Нижний Новгород", 56.3269, 44.0059, 3], ["Казань", 55.7963, 49.1088, 3], ["Ростов-на-Дону", 47.2225, 39.7189, 3],
    ["Краснодар", 45.0355, 38.9753, 3], ["Сочи", 43.5855, 39.7231, 3], ["Калининград", 54.7104, 20.4522, 2],
    ["Самара", 53.1959, 50.1002, 4], ["Екатеринбург", 56.8389, 60.6057, 5], ["Новосибирск", 55.0084, 82.9357, 7],
    ["Красноярск", 56.0153, 92.8932, 7], ["Иркутск", 52.2870, 104.3050, 8], ["Владивосток", 43.1155, 131.8855, 10],
    ["Мурманск", 68.9585, 33.0827, 3],
]

RU = """Апрелевка, Химки, Подольск, Балашиха, Мытищи, Красногорск, Одинцово, Королёв, Люберцы, Зеленоград, Домодедово,
Сергиев Посад, Коломна, Звенигород, Истра, Дмитров, Клин, Серпухов, Электросталь, Жуковский, Раменское, Пушкино,
Долгопрудный, Щёлково, Челябинск, Омск, Уфа, Пермь, Воронеж, Волгоград, Саратов, Тюмень, Тольятти, Ижевск, Барнаул,
Ульяновск, Хабаровск, Ярославль, Махачкала, Томск, Оренбург, Кемерово, Новокузнецк, Рязань, Астрахань, Пенза, Киров,
Липецк, Чебоксары, Курск, Ставрополь, Улан-Удэ, Тверь, Магнитогорск, Брянск, Иваново, Белгород, Сургут, Владимир,
Чита, Архангельск, Смоленск, Волжский, Череповец, Вологда, Орёл, Саранск, Якутск, Владикавказ, Грозный, Тамбов,
Петрозаводск, Кострома, Новороссийск, Йошкар-Ола, Таганрог, Сыктывкар, Нальчик, Нижневартовск, Псков,
Великий Новгород, Южно-Сахалинск, Петропавловск-Камчатский, Благовещенск, Анапа, Геленджик, Севастополь,
Симферополь, Ялта, Кисловодск, Пятигорск, Минеральные Воды, Суздаль, Выборг, Зеленоградск, Светлогорск,
Нижний Тагил, Набережные Челны, Старый Оскол, Абакан, Майкоп, Элиста, Горно-Алтайск, Салехард, Ханты-Мансийск"""
ABROAD = [("Минск", "BY"), ("Алматы", "KZ"), ("Астана", "KZ"), ("Ташкент", "UZ"), ("Бишкек", "KG"),
          ("Ереван", "AM"), ("Тбилиси", "GE"), ("Батуми", "GE"), ("Баку", "AZ"), ("Дубай", "AE"),
          ("Стамбул", "TR"), ("Анталья", "TR")]


# Геокодер ошибается на тёзках (Ялта в Тульской области, Ставрополь-хутор) и не знает части
# названий — эти точки выставлены руками по карте, пояс у всех UTC+3.
MANUAL = [["Ставрополь", 45.0428, 41.9734, 3], ["Севастополь", 44.6167, 33.5254, 3],
          ["Симферополь", 44.9521, 34.1024, 3], ["Ялта", 44.4952, 34.1663, 3], ["Анталья", 36.8969, 30.7133, 3]]


def names() -> list:
    fixed = set(r[0] for r in FIXED + MANUAL)
    ru = [" ".join(n.split()) for n in RU.split(",")]
    return [(n, "RU") for n in ru if n and n not in fixed] + [a for a in ABROAD if a[0] not in fixed]


def geocode(name: str, cc: str, cache: dict) -> dict | None:
    key = cc + ":" + name
    if key in cache:
        return cache[key]
    u = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
        {"name": name, "count": 10, "language": "ru", "format": "json", "countryCode": cc})
    res = json.load(urllib.request.urlopen(u, timeout=30)).get("results") or []
    exact = [r for r in res if r.get("name", "").lower().replace("ё", "е") == name.lower().replace("ё", "е")] or res
    if not exact:
        return None
    best = max(exact, key=lambda r: r.get("population") or 0)       # тёзок много — берём самый населённый
    cache[key] = {"lat": best["latitude"], "lng": best["longitude"], "tz": best["timezone"],
                  "admin": best.get("admin1"), "pop": best.get("population")}
    time.sleep(0.15)
    return cache[key]


def offset(zone: str) -> float:
    """Смещение пояса в часах. Летом и зимой оно обязано совпадать — иначе страна переводит часы."""
    z = zoneinfo.ZoneInfo(zone)
    a = datetime.datetime(2026, 1, 15, 12, tzinfo=z).utcoffset().total_seconds() / 3600
    b = datetime.datetime(2026, 7, 15, 12, tzinfo=z).utcoffset().total_seconds() / 3600
    if a != b:
        raise ValueError(zone + ": переводит часы, в список не годится")
    return a


def build() -> list:
    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    rows, miss = list(FIXED) + list(MANUAL), []
    for name, cc in names():
        g = geocode(name, cc, cache)
        # без числа жителей или с деревенским числом — почти наверняка тёзка, а не город
        if not g or not g["pop"] or g["pop"] < 10000:
            miss.append(name)
            continue
        tz = offset(g["tz"])
        rows.append([name, round(g["lat"], 4), round(g["lng"], 4), int(tz) if tz == int(tz) else tz])
    json.dump(cache, io.open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    if miss:
        raise SystemExit("не найдены или сомнительны, впишите в MANUAL: " + ", ".join(miss))
    return rows


def js(rows: list) -> str:
    return "  var CITIES = [\n" + ",\n".join(
        "    " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n  ];\n"


def main() -> int:
    src = io.open(SUN, encoding="utf-8").read()
    a, z = src.index("/* CITIES:BEGIN */"), src.index("/* CITIES:END */")
    rows = build()
    block = "/* CITIES:BEGIN */\n" + js(rows) + "  "
    if "--check" in sys.argv:
        ok = src[a:z] == block
        print("список городов собран скриптом" if ok else "sun.js расходится с build_cities.py — пересоберите")
        return 0 if ok else 1
    io.open(SUN, "w", encoding="utf-8", newline="\n").write(src[:a] + block + src[z:])
    print("городов:", len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
