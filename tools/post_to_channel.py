# -*- coding: utf-8 -*-
"""Публикация альбома с текстом в канал «ПОБУБНИМ».

Бот один на два канала (@pobubnimzavideo и канал МОНОЛИТА), поэтому адресат
задаётся ID, а перед отправкой скрипт спрашивает у Telegram название канала и
сверяет его с ожидаемым. Промахнуться каналом здесь нельзя молча.

Публикация необратима, поэтому по умолчанию скрипт НИЧЕГО не отправляет:
показывает, что уйдёт, и ждёт явного --send.

Запуск:
  python tools/post_to_channel.py --text <файл> --photos assets/post/card-*.jpg
  python tools/post_to_channel.py ... --send        отправить по-настоящему
"""
from __future__ import annotations

import glob
import io
import json
import sys
from pathlib import Path

import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CHANNEL_ID = -1002521141835          # @pobubnimzavideo
CHANNEL_NAME = "ПОБУБНИМ"            # чем должен представиться канал
CHANNEL_LINK = "pobubnimzavideo"
CONFIG = Path("C:/src/monolith_assistant/scripts/telegram_config.local.json")
CAPTION_LIMIT = 1024


def token() -> str:
    return json.loads(CONFIG.read_text(encoding="utf-8"))["bot_token"]


def api(method: str, **payload):
    r = requests.post(f"https://api.telegram.org/bot{token()}/{method}",
                      json=payload, timeout=60)
    return r.json()


def main() -> int:
    a = sys.argv
    text_file = a[a.index("--text") + 1]
    patterns = a[a.index("--photos") + 1:]
    if "--send" in patterns:
        patterns = patterns[:patterns.index("--send")]
    photos = sorted(p for pat in patterns for p in glob.glob(pat))
    text = Path(text_file).read_text(encoding="utf-8").strip()

    if not photos:
        sys.exit("не найдено ни одной картинки")
    if not 2 <= len(photos) <= 10:
        sys.exit(f"в альбом идёт от 2 до 10 картинок, найдено {len(photos)}")
    visible = len(__import__("re").sub(r"<[^>]+>", "", text))
    if visible > CAPTION_LIMIT:
        sys.exit(f"подпись {visible} знаков при лимите {CAPTION_LIMIT}")

    chat = api("getChat", chat_id=CHANNEL_ID)
    if not chat.get("ok"):
        sys.exit("канал не отвечает: " + str(chat.get("description")))
    title = chat["result"].get("title", "")
    if CHANNEL_NAME not in title:
        sys.exit(f"адресат не тот: ожидали «{CHANNEL_NAME}», канал зовётся «{title}»")

    print(f"Канал: {title} (id {CHANNEL_ID})")
    print(f"Картинок: {len(photos)}")
    for p in photos:
        print("  ·", Path(p).name, f"{Path(p).stat().st_size // 1024} КБ")
    print(f"Подпись: {visible} знаков из {CAPTION_LIMIT}\n")
    print(text)

    if "--send" not in a:
        print("\nЭТО ПРОБА. Отправки не было. Для публикации добавьте --send")
        return 0

    media, files = [], {}
    for i, p in enumerate(photos):
        key = f"photo{i}"
        item = {"type": "photo", "media": f"attach://{key}"}
        if i == 0:
            item["caption"] = text
            item["parse_mode"] = "HTML"
        media.append(item)
        files[key] = (Path(p).name, open(p, "rb"), "image/jpeg")

    r = requests.post(
        f"https://api.telegram.org/bot{token()}/sendMediaGroup",
        data={"chat_id": str(CHANNEL_ID),
              "media": json.dumps(media, ensure_ascii=False)},
        files=files, timeout=180).json()
    for _, f, _ in files.values():
        f.close()

    if not r.get("ok"):
        sys.exit("Telegram отказал: " + str(r.get("description")))
    first = r["result"][0]["message_id"]
    print(f"\nОпубликовано. Сообщений в альбоме: {len(r['result'])}")
    print(f"Ссылка: https://t.me/{CHANNEL_LINK}/{first}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
