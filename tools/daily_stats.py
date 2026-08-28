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


PAUSES = (5, 20, 60, 120, 180)  # сеть здесь падает волнами по несколько минут
NET_WAIT_MIN = 40  # сколько минут ждать окна сети перед сбором (задача в 09:00)


def wait_for_network(minutes: int = NET_WAIT_MIN) -> bool:
    """Ждёт, пока API Метрики начнёт отвечать. Сеть на машине падает волнами,
    и утренний запуск не должен молча пропадать из-за провала."""
    import time
    deadline = time.time() + minutes * 60
    probe = urllib.request.Request(
        "https://api-metrika.yandex.net/management/v1/counters?per_page=1",
        headers={"Authorization": "OAuth " + token()})
    while True:
        try:
            with urllib.request.urlopen(probe, timeout=20):
                return True
        except urllib.error.HTTPError:
            return True  # сервис отвечает, дальше разберёмся по месту
        except Exception:
            if time.time() > deadline:
                return False
            time.sleep(60)


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
                # одноимённые цели складываем: в кабинете есть дубль «Клик во
                # ВКонтакте» (id 601892845), удалить его API не может (нет
                # скоупа metrika:write) — дважды в сводке не показываем
                merged: dict[str, int] = {}
                for g, v in zip(glist, vals):
                    if v:
                        nm = GOAL_RU.get(g["name"], g["name"])
                        merged[nm] = merged.get(nm, 0) + int(v)
                if merged:
                    lines.append("")
                    lines.append("<b>Действия (цели)</b>")
                    for nm, n in sorted(merged.items(), key=lambda x: -x[1]):
                        lines.append(f"· {nm} — {n}")
        except Exception:
            pass  # цели не должны ронять сводку

        # --- интерактивы: параметры визитов lesson → доска → контрол ---
        try:
            for metric in ("ym:s:paramsNumber", "ym:s:visits"):
                try:
                    rows = metrika({
                        "metrics": metric,
                        "dimensions": "ym:s:paramsLevel2,ym:s:paramsLevel3",
                        "filters": "ym:s:paramsLevel1=='lesson'",
                        "date1": d1, "date2": d2, "sort": "-" + metric, "limit": 12,
                    })["data"]
                    break
                except urllib.error.HTTPError:
                    rows = []
            if rows:
                lines.append("")
                lines.append("<b>Интерактивы (доска › что крутили)</b>")
                for row in rows:
                    board = row["dimensions"][0].get("name") or "?"
                    ctrl = row["dimensions"][1].get("name") or "?"
                    lines.append(f"· {board} › {ctrl} — {int(row['metrics'][0])}")
        except Exception:
            pass  # интерактивы не должны ронять сводку

    # --- Вебмастер: индексация и поиск ---
    try:
        uid = api("https://api.webmaster.yandex.net/v4/user")["user_id"]
        base = f"https://api.webmaster.yandex.net/v4/user/{uid}/hosts/{HOST_ID}"
        s = api(base + "/summary")
        # summary пересчитывается раз в сутки и держит вчерашний ноль, когда
        # страницы в индексе уже есть: живую цифру берём из выборки (28.08)
        pages = s.get("searchable_pages_count", 0)
        try:
            fresh = api(base + "/search-urls/in-search/samples", {"limit": 1}).get("count")
            if fresh is not None and fresh > (pages or 0):
                pages = fresh
        except Exception:
            pass
        lines.append("")
        lines.append("<b>Поиск Яндекса</b>")
        lines.append(f"Страниц в поиске: <b>{pages}</b> "
                     f"· исключено: {s.get('excluded_pages_count', '?')} "
                     f"· ИКС: {s.get('sqi', '?')}")
        # данные по запросам приходят с лагом в несколько дней: за один вчерашний
        # день их обычно ещё нет, поэтому берём неделю (28.08)
        week = (date.fromisoformat(d1) - timedelta(days=6)).isoformat()
        q = api(base + "/search-queries/popular",
                {"order_by": "TOTAL_SHOWS",
                 "query_indicator": ["TOTAL_SHOWS", "TOTAL_CLICKS"],
                 "date_from": week, "date_to": d2, "limit": 5})
        rows = q.get("queries", [])
        shows = sum(int(r.get("indicators", {}).get("TOTAL_SHOWS", 0)) for r in rows)
        clicks = sum(int(r.get("indicators", {}).get("TOTAL_CLICKS", 0)) for r in rows)
        if rows:
            lines.append(f"За неделю показов: {shows} · кликов: {clicks}")
            lines.append("<b>Топ запросов за неделю</b>")
            for r in rows:
                ind = r.get("indicators", {})
                lines.append(f"· «{r.get('query_text', '?')}» — "
                             f"{int(ind.get('TOTAL_SHOWS', 0))} показов, "
                             f"{int(ind.get('TOTAL_CLICKS', 0))} кликов")
        else:
            lines.append("Запросов с показами пока нет — данные Вебмастера идут с лагом в несколько дней.")
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        lines.append("")
        if "HOST_NOT_LOADED" in body:
            lines.append("<b>Поиск Яндекса</b>")
            lines.append("Сайт ещё загружается в Вебмастер — данные по запросам "
                         "и страницам в поиске появятся в ближайшие дни.")
        else:
            lines.append(f"Вебмастер ответил ошибкой {e.code} — загляну завтра.")
    except Exception as e:  # сеть или что-то ещё не должно ронять сводку Метрики
        lines.append("")
        lines.append(f"Вебмастер недоступен ({type(e).__name__}) — данные поиска в следующей сводке.")

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

    if not wait_for_network():
        msg = (f"📊 <b>ПОБУБНИМ — сводка за {label}</b>\n\n"
               "Не смог собрать статистику: интернет на машине не отвечал "
               f"{NET_WAIT_MIN} минут подряд. Цифры не потеряны — они в Метрике, "
               "следующая сводка придёт как обычно.")
        print(msg)
        if "--send" in args:
            tmp = Path(__file__).with_name("_daily_stats_msg.txt")
            tmp.write_text(msg, encoding="utf-8")
            subprocess.run([sys.executable, str(NOTIFY), "--text-file", str(tmp)],
                           capture_output=True, text=True)
            tmp.unlink(missing_ok=True)
        sys.exit(2)

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
