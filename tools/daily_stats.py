# -*- coding: utf-8 -*-
"""Ежедневная сводка по сайту pobubnim.github.io в личку Савелия.

Источники: Яндекс.Метрика (счётчик 111935483) + Яндекс.Вебмастер
(хост под рабочим аккаунтом). Только stdlib.

Секреты НЕ в репо: OAuth-токен Яндекса читается из
  C:/Users/User/.pobubnim/yandex_oauth.txt
(токен со скоупами metrika:read + webmaster:verify + webmaster:hostinfo).
Отправка в ТГ — через готовый бот монолита:
  python C:/src/monolith_assistant/scripts/notify_founder.py --text-file ...

Запуск:
  python tools/daily_stats.py            показать сводку за вчера в консоли
  python tools/daily_stats.py --send     собрать и отправить в ТГ
  python tools/daily_stats.py --today    период "сегодня" вместо "вчера"

Планировщик Windows: задача PobubnimDailyStats, ежедневно 09:00 (--send).
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

COUNTER = 111935483
HOST_ID = "https:pobubnim.github.io:443"
TOKEN_FILE = Path.home() / ".pobubnim" / "yandex_oauth.txt"
NOTIFY = Path("C:/src/monolith_assistant/scripts/notify_founder.py")

TRAFFIC_RU = {
    "organic": "поиск", "direct": "прямые заходы", "internal": "внутренние",
    "referral": "ссылки с сайтов", "social": "соцсети", "ad": "реклама",
    "recommend": "рекомендательные", "messenger": "мессенджеры", "email": "почта",
    "saved": "сохранённые страницы", "undefined": "не определён",
}
GOAL_RU = {
    "lead_send": "заявка отправлена", "lead_open": "открыта форма заявки",
    "tg_click": "клик в телеграм", "vk_click": "клик во ВКонтакте",
    "channel_click": "переход в канал", "tool_word": "скачали Word",
    "tool_pdf": "печать/PDF", "tool_copy": "копия документа",
    "lesson_board": "работа с доской урока", "lesson_slider": "ползунки уроков",
}


def token() -> str:
    return TOKEN_FILE.read_text(encoding="utf-8").strip()


PAUSES = (5, 30, 90)  # сеть здесь падает волнами по несколько минут


def api(url: str, params: dict | None = None) -> dict:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Authorization": "OAuth " + token()})
    last: Exception | None = None
    for attempt in range(len(PAUSES) + 1):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError:
            raise  # ошибка запроса, повторять бессмысленно
        except Exception as e:  # сетевой транзиент — ждём окно
            last = e
            if attempt < len(PAUSES):
                import time
                time.sleep(PAUSES[attempt])
    raise last  # type: ignore[misc]


def metrika(params: dict) -> dict:
    base = {"ids": COUNTER, "accuracy": "full"}
    base.update(params)
    return api("https://api-metrika.yandex.net/stat/v1/data", base)


def fmt_time(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 60}:{sec % 60:02d}"


def plural(n: int, forms: tuple[str, str, str]) -> str:
    u = n % 100
    if 10 < u < 20:
        return forms[2]
    u %= 10
    return forms[0] if u == 1 else forms[1] if 1 < u < 5 else forms[2]


def collect(d1: str, d2: str, label: str) -> str:
    lines: list[str] = []

    # --- Метрика: общие числа ---
    tot = metrika({
        "metrics": "ym:s:visits,ym:s:users,ym:s:pageviews,"
                   "ym:s:avgVisitDurationSeconds,ym:s:bounceRate",
        "date1": d1, "date2": d2,
    }).get("totals") or [0, 0, 0, 0, 0]
    visits, users, views, avg, bounce = (list(tot) + [0] * 5)[:5]
    lines.append(f"📊 <b>ПОБУБНИМ — сводка за {label}</b>")
    lines.append("")
    lines.append(f"Визиты: <b>{int(visits)}</b> · посетители: <b>{int(users)}</b> "
                 f"· просмотры: <b>{int(views)}</b>")
    lines.append(f"Время на сайте: <b>{fmt_time(avg)}</b> · отказы: {bounce:.0f}%")

    if int(visits) == 0:
        lines.append("")
        lines.append("Пока тихо: визитов за период нет.")
    else:
        # --- источники ---
        src = metrika({
            "metrics": "ym:s:visits", "dimensions": "ym:s:trafficSource",
            "date1": d1, "date2": d2, "sort": "-ym:s:visits", "limit": 5,
        })["data"]
        if src:
            lines.append("")
            lines.append("<b>Откуда пришли</b>")
            for row in src:
                sid = row["dimensions"][0].get("id", "")
                nm = TRAFFIC_RU.get(sid, row["dimensions"][0].get("name", sid))
                lines.append(f"· {nm} — {int(row['metrics'][0])}")

        # --- топ страниц ---
        pages = metrika({
            "metrics": "ym:pv:pageviews", "dimensions": "ym:pv:URLPath",
            "date1": d1, "date2": d2, "sort": "-ym:pv:pageviews", "limit": 5,
        })["data"]
        if pages:
            lines.append("")
            lines.append("<b>Топ страниц</b>")
            for row in pages:
                path = row["dimensions"][0]["name"] or "/"
                lines.append(f"· {path} — {int(row['metrics'][0])}")

        # --- цели: список из management API, достижения одним stat-запросом ---
        try:
            glist = api(f"https://api-metrika.yandex.net/management/v1/counter/{COUNTER}/goals").get("goals", [])
            if glist:
                metrics = ",".join(f"ym:s:goal{g['id']}reaches" for g in glist[:18])
                vals = metrika({"metrics": metrics, "date1": d1, "date2": d2}).get("totals") or []
                hits = [(GOAL_RU.get(g["name"], g["name"]), int(v))
                        for g, v in zip(glist, vals) if v]
                if hits:
                    lines.append("")
                    lines.append("<b>Действия (цели)</b>")
                    for nm, n in sorted(hits, key=lambda x: -x[1]):
                        lines.append(f"· {nm} — {n}")
        except Exception:
            pass  # цели не должны ронять сводку

    # --- Вебмастер: индексация и поиск ---
    try:
        uid = api("https://api.webmaster.yandex.net/v4/user")["user_id"]
        base = f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{HOST_ID}"
        s = api(base + "/summary")
        lines.append("")
        lines.append("<b>Поиск Яндекса</b>")
        lines.append(f"Страниц в поиске: <b>{s.get('searchable_pages_count', '?')}</b> "
                     f"· исключено: {s.get('excluded_pages_count', '?')} "
                     f"· ИКС: {s.get('sqi', '?')}")
        q = api(base + "/search-queries/popular",
                {"order_by": "TOTAL_SHOWS",
                 "query_indicator": ["TOTAL_SHOWS", "TOTAL_CLICKS"],
                 "date_from": d1, "date_to": d2, "limit": 5})
        rows = q.get("queries", [])
        shows = sum(int(r.get("indicators", {}).get("TOTAL_SHOWS", 0)) for r in rows)
        clicks = sum(int(r.get("indicators", {}).get("TOTAL_CLICKS", 0)) for r in rows)
        if rows:
            lines.append(f"Показы (топ-запросы): {shows} · клики: {clicks}")
            lines.append("<b>Топ запросов</b>")
            for r in rows:
                ind = r.get("indicators", {})
                lines.append(f"· «{r.get('query_text', '?')}» — "
                             f"{int(ind.get('TOTAL_SHOWS', 0))} показов, "
                             f"{int(ind.get('TOTAL_CLICKS', 0))} кликов")
        else:
            lines.append("Запросов с показами за период пока нет.")
    except Exception as e:  # Вебмастер не должен ронять сводку Метрики
        lines.append("")
        lines.append(f"Вебмастер недоступен: {type(e).__name__}")

    lines.append("")
    lines.append('<a href="https://metrika.yandex.ru/dashboard?id=111935483">Метрика</a> · '
                 '<a href="https://webmaster.yandex.ru/site/https:pobubnim.github.io:443/">Вебмастер</a>')
    return "\n".join(lines)


def main() -> None:
    args = sys.argv[1:]
    if "--today" in args:
        d1 = d2 = date.today().isoformat()
        label = f"сегодня ({date.today():%d.%m})"
    else:
        y = date.today() - timedelta(days=1)
        d1 = d2 = y.isoformat()
        label = f"{y:%d.%m.%Y}"

    text = collect(d1, d2, label)
    print(text)

    if "--send" in args:
        tmp = Path(__file__).with_name("_daily_stats_msg.txt")
        tmp.write_text(text, encoding="utf-8")
        r = subprocess.run([sys.executable, str(NOTIFY), "--text-file", str(tmp)],
                           capture_output=True, text=True)
        tmp.unlink(missing_ok=True)
        print("SENT" if r.returncode == 0 else f"SEND FAILED: {r.stdout} {r.stderr}")
        sys.exit(r.returncode)


if __name__ == "__main__":
    main()
