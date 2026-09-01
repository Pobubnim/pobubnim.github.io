# -*- coding: utf-8 -*-
"""Даты страниц в schema.org — из git, а не из головы.

Зачем: 01.09.2026 обнаружилось, что ни на одной странице нет `dateModified`,
хотя половина сайта переписывалась после публикации. Для поиска это сигнал
актуальности, а видимые строки «Обновлено 25.08.2026» вдобавок устарели —
страницы правились позже.

Источник правды — история git: дата первого коммита файла становится
`datePublished`, дата последнего — `dateModified`. Руками даты не ставим:
именно так они и разъезжаются с реальностью.

Видимую строку <time> скрипт трогает ТОЛЬКО когда в ней написано «Обновлено» —
её смысл в том, чтобы показывать актуальность. Строку «Опубликовано» оставляет
как есть: это дата выхода урока, и менять её нечестно.

Запуск:
  python tools/stamp_dates.py --check   показать расхождения (код 1, если есть)
  python tools/stamp_dates.py           проставить
"""
from __future__ import annotations

import io
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SKIP = ("videos/", "node_modules/")
ARTICLE_RE = re.compile(r'("@type":\s*"Article",\s*)("headline")')
TIME_RE = re.compile(r'(<time datetime=")([\d-]+)("[^>]*>)\s*Обновлено\s+([\d.]+)(\s*</time>)')


def git_date(path: Path, first: bool) -> str | None:
    cmd = ["git", "log", "--follow", "--format=%ad", "--date=short", "--", str(path)]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True).stdout.split()
    if not out:
        return None
    return out[-1] if first else out[0]


def without_dates(text: str) -> str:
    """Текст без самих дат — чтобы простановка штампа не считалась правкой контента."""
    text = re.sub(r'"date(?:Published|Modified)":\s*"[^"]*",?\s*', "", text)
    return re.sub(r"<time datetime=\"[^\"]*\"[^>]*>.*?</time>", "<time/>", text, flags=re.S)


def content_changed(path: Path) -> bool:
    """Правился ли на самом деле контент, а не только штамп даты."""
    r = subprocess.run(
        ["git", "status", "--porcelain", "--", str(path)],
        cwd=ROOT, capture_output=True, text=True,
    )
    if not r.stdout.strip():
        return False
    rel = path.relative_to(ROOT).as_posix()
    head = subprocess.run(
        ["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8"
    )
    if head.returncode != 0:  # новый файл
        return True
    return without_dates(head.stdout) != without_dates(path.read_text(encoding="utf-8"))


def process(path: Path, fix: bool, today: str) -> int:
    src = path.read_text(encoding="utf-8")
    if '"@type": "Article"' not in src:
        return 0
    published = git_date(path, first=True)
    modified = today if content_changed(path) else git_date(path, first=False)
    if not published or not modified:
        return 0

    out = src
    changes = []
    touched = content_changed(path)

    if '"dateModified"' not in out:
        # datePublished мог уже стоять в разметке — второй такой же ключ не нужен
        stamp = f'"dateModified": "{modified}", '
        if '"datePublished"' not in out:
            stamp = f'"datePublished": "{published}", ' + stamp
            changes.append(f"datePublished {published}")
        out = ARTICLE_RE.sub(lambda m: m.group(1) + stamp + m.group(2), out, count=1)
        changes.append(f"dateModified {modified}")
    elif touched:
        # Дату правки двигает только настоящая правка контента. Иначе она поползёт
        # от собственного коммита: скрипт закоммитил штамп — и на следующем прогоне
        # «последний коммит файла» уже сегодняшний.
        cur = re.search(r'"dateModified":\s*"([^"]+)"', out)
        if cur and cur.group(1) != modified:
            out = re.sub(r'("dateModified":\s*")[^"]+(")', rf"\g<1>{modified}\g<2>", out, count=1)
            changes.append(f"dateModified {cur.group(1)} → {modified}")

    # видимая строка «Обновлено …» должна совпадать с датой правки
    m = TIME_RE.search(out)
    if m and m.group(2) != modified and (touched or '"dateModified"' not in src):
        human = ".".join(reversed(modified.split("-")))
        out = TIME_RE.sub(
            lambda mm: mm.group(1) + modified + mm.group(3) + f"Обновлено {human}" + mm.group(5),
            out, count=1,
        )
        changes.append(f"видимая дата {m.group(4)} → {human}")

    if not changes:
        return 0
    rel = path.relative_to(ROOT).as_posix()
    print(f"  {rel}: " + "; ".join(changes))
    if fix:
        path.write_text(out, encoding="utf-8")
    return 1


def main() -> int:
    fix = "--check" not in sys.argv
    today = subprocess.run(
        ["git", "log", "-1", "--format=%ad", "--date=short"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.strip()
    pages = [
        p for p in ROOT.rglob("*.html")
        if not any(s in p.as_posix() for s in SKIP) and not p.name.startswith("_")
    ]
    print("Даты страниц по истории git\n")
    n = sum(process(p, fix, today) for p in sorted(pages))
    print(f"\nСтраниц {'обновлено' if fix else 'с расхождением'}: {n}")
    return 0 if fix or not n else 1


if __name__ == "__main__":
    raise SystemExit(main())
