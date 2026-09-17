# -*- coding: utf-8 -*-
"""Пост недели со ссылкой на страницу услуги — из docs/WEEKLY_POSTS.md в личку владельцу.

Зачем: страницы услуг Яндекс выбросил как «маловостребованные» (GROWTH_PLAN §12). Живые заходы
именно на них — честный сигнал востребованности. Пост ведёт на услугу, а не на главную, и несёт
метку источника, иначе визит уйдёт в «прямые заходы» и отдачи не увидеть.

Запуск:  python tools/weekly_post.py           показать очередной пост
         python tools/weekly_post.py --send    отправить его в телеграм владельцу
         python tools/weekly_post.py --n 3     конкретный номер (очередь не двигается)
Очередь: ~/.pobubnim/weekly_post.txt (номер следующего поста; при --send сдвигается).
"""
from __future__ import annotations

import io
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "docs" / "WEEKLY_POSTS.md"
STATE = Path.home() / ".pobubnim" / "weekly_post.txt"
NOTIFY = Path("C:/src/monolith_assistant/scripts/notify_founder.py")


def posts() -> list[dict]:
    out = []
    for block in re.split(r"\n## ", PLAN.read_text(encoding="utf-8"))[1:]:
        m = re.match(r"(\d+)\.\s*(.+)", block)
        if not m:
            continue
        text = re.search(r"Текст:\n(.*?)\nСсылка: (\S+)", block, re.S)
        if not text:
            continue
        out.append({"n": int(m.group(1)), "title": m.group(2).strip(),
                    "text": text.group(1).strip(), "url": text.group(2).strip(),
                    "media": (re.search(r"Работа: (.+)|Материал: (.+)", block) or [None])[0]})
    return out


def main() -> None:
    all_posts = posts()
    if not all_posts:
        sys.exit("в docs/WEEKLY_POSTS.md нет ни одного поста — проверьте формат")
    if "--n" in sys.argv:
        n = int(sys.argv[sys.argv.index("--n") + 1])
        post = next(p for p in all_posts if p["n"] == n)
    else:
        try:
            nxt = int(STATE.read_text(encoding="utf-8").strip())
        except Exception:
            nxt = all_posts[0]["n"]
        post = next((p for p in all_posts if p["n"] == nxt), all_posts[0])

    body = (f"<b>Пост недели № {post['n']} — {post['title']}</b>\n\n{post['text']}\n\n{post['url']}\n\n"
            f"<i>{post['media'] or ''}</i>\n"
            f"Ссылка ведёт на страницу услуги и помечена меткой источника — так визит виден в Метрике.\n"
            f"Для ВКонтакте замените в ссылке telegram на vk.")
    print(body.replace("<b>", "").replace("</b>", "").replace("<i>", "").replace("</i>", ""))

    if "--send" in sys.argv:
        tmp = Path.home() / ".pobubnim" / "weekly_post_body.txt"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(body, encoding="utf-8")
        r = subprocess.run([sys.executable, str(NOTIFY), "--text-file", str(tmp)],
                           capture_output=True, text=True, encoding="utf-8")
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode == 0:
            nums = [p["n"] for p in all_posts]
            STATE.write_text(str(nums[(nums.index(post["n"]) + 1) % len(nums)]), encoding="utf-8")


if __name__ == "__main__":
    main()
