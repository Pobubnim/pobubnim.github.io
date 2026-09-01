# -*- coding: utf-8 -*-
"""Сверка FAQ-разметки с тем, что человек видит на странице.

Зачем: 01.09.2026 нашлось, что 13 страниц из 44 отдают поисковику FAQPage с
вопросами, которых на экране НЕТ (уроки, гео-страницы, часть статей). Разметка
без видимого текста поисковиком в лучшем случае игнорируется, а массово —
читается как попытка накрутить сниппет. Плюс это просто потерянный контент:
ответы уже написаны и отвечают на живые запросы Вебмастера.

Что делает скрипт:
  * читает JSON-LD FAQPage страницы и видимые <details class="svc-faq">;
  * дописывает на страницу вопросы, которые есть только в разметке;
  * пересобирает JSON-LD строго по видимому списку (включая вопросы, которые
    были только на экране, — они тоже должны попасть в разметку).

Запуск:
  python tools/sync_faq.py --check   только показать расхождения (код 1, если есть)
  python tools/sync_faq.py           починить страницы

Блок вопросов оформляется по типу страницы: у уроков — своим step-head,
у остальных — существующей секцией. Стиль .svc-faq лежит в assets/css/style.css.
"""
from __future__ import annotations

import html
import io
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SKIP = ("videos/", "node_modules/")

FAQ_RE = re.compile(r'("@type":\s*"FAQPage",\s*"mainEntity":\s*)(\[.*?\])(\s*\})', re.S)
DET_RE = re.compile(
    r'<details class="svc-faq"><summary>(.*?)</summary><p>(.*?)</p></details>', re.S
)


def visible_text(src: str) -> str:
    """Текст страницы без скриптов и тегов — то, что реально читает человек."""
    s = re.sub(r"<script.*?</script>", " ", src, flags=re.S)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s)))


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def twins(a: dict, b: dict) -> bool:
    """Один ли это вопрос, просто в разных словах.

    Сверять только ответы мало: «Какие настройки выставить?» и «Какие настройки
    камеры выставить для видео на телефоне?» написаны разными словами, и их
    ответы совпадают лишь наполовину. Поэтому смотрим на пару вопрос+ответ —
    иначе на странице появляются близнецы (так и вышло при первом прогоне).
    """
    q = SequenceMatcher(None, a["q"], b["q"]).ratio()
    ans = SequenceMatcher(None, a["a"][:200], b["a"][:200]).ratio()
    return (q > 0.5 and ans > 0.4) or ans > 0.7


def page_kind(src: str) -> str:
    if 'class="lesson-body"' in src:
        return "lesson"
    if 'class="art-body"' in src:
        return "article"
    return "section"


def block_html(kind: str, items: list[dict], indent: str) -> str:
    """Новый блок вопросов в оформлении, принятом на этом типе страниц."""
    rows = "\n".join(
        f'{indent}<details class="svc-faq"><summary>{html.escape(i["q"])}</summary>'
        f'<p>{i["a_html"]}</p></details>'
        for i in items
    )
    if kind == "lesson":
        head = (
            f'{indent}<div class="step-head" id="faq"><i>ВОПРОСЫ</i>'
            f"<h2>Частые <em>вопросы</em></h2></div>"
        )
        return f"{head}\n{rows}"
    head = f'{indent}<h2 class="art-h2">Частые вопросы</h2>'
    return f"{head}\n{rows}"


def process(path: Path, fix: bool) -> tuple[int, int]:
    """Возвращает (сколько вопросов вернули на страницу, сколько добавили в разметку)."""
    src = path.read_text(encoding="utf-8")
    m = FAQ_RE.search(src)
    if not m:
        return (0, 0)
    try:
        marked = json.loads(m.group(2))
    except json.JSONDecodeError:
        print(f"  !! {path}: FAQPage не разбирается как JSON")
        return (0, 0)

    vis = visible_text(src)
    shown = [
        {"q": strip_tags(q), "a_html": a.strip(), "a": strip_tags(a)}
        for q, a in DET_RE.findall(src)
    ]
    shown_q = {i["q"] for i in shown}

    rel = path.relative_to(ROOT).as_posix()
    for i in range(len(shown)):
        for j in range(i + 1, len(shown)):
            if twins(shown[i], shown[j]):
                print(f"  {rel}: похоже, дубль вопроса —")
                print(f"      {shown[i]['q']}")
                print(f"      {shown[j]['q']}")

    marked_q = {it["name"] for it in marked}
    absent = [
        {
            "q": it["name"],
            "a": it["acceptedAnswer"]["text"].strip(),
            "a_html": html.escape(it["acceptedAnswer"]["text"].strip()),
        }
        for it in marked
        if it["name"][:40] not in vis and it["name"] not in shown_q
    ]

    # Часть «пропавших» вопросов на самом деле есть на экране, но переформулирована
    # («Вы правда без наценки за выезд?» против «Вы правда снимаете в Наро-Фоминске
    # без наценки за выезд?»). Такие пары узнаём по ответу: если ответы почти
    # совпадают, это один вопрос — тогда не плодим близнеца, а берём на экран
    # запросную формулировку из разметки (в ней есть город и ключ).
    renames: list[tuple[str, str]] = []
    missing: list[dict] = []
    free = [i for i in shown if i["q"] not in marked_q]
    for cand in absent:
        twin = None
        for sh in free:
            if twins(cand, sh):
                twin = sh
                break
        if twin:
            renames.append((twin["q"], cand["q"]))
            free.remove(twin)
        else:
            missing.append(cand)

    # вопросы, которые видит человек, но которых нет в разметке (после сведения пар)
    extra = free

    if not missing and not extra and not renames:
        return (0, 0)

    print(
        f"  {rel}: на экран +{len(missing)}, в разметку +{len(extra)},"
        f" формулировок сведено {len(renames)}"
    )
    if not fix:
        for i in missing:
            print(f"      нет на странице: {i['q']}")
        for i in extra:
            print(f"      нет в разметке:  {i['q']}")
        for a, b in renames:
            print(f"      свести: {a!r} -> {b!r}")
        return (len(missing), len(extra))

    out = src
    for old_q, new_q in renames:
        out = out.replace(
            f"<summary>{html.escape(old_q)}</summary>",
            f"<summary>{html.escape(new_q)}</summary>",
            1,
        )
    if missing:
        last = None
        for mm in DET_RE.finditer(out):
            last = mm
        if last:  # дописываем в существующий блок
            indent = re.search(r"\n([ \t]*)$", out[: last.start()])
            pad = indent.group(1) if indent else "    "
            add = "\n".join(
                f'{pad}<details class="svc-faq"><summary>{html.escape(i["q"])}</summary>'
                f'<p>{i["a_html"]}</p></details>'
                for i in missing
            )
            out = out[: last.end()] + "\n" + add + out[last.end() :]
        else:  # блока нет — создаём перед призывом к действию
            anchor = re.search(r'\n([ \t]*)(<a class="art-svc"|<div class="footer-cta")', out)
            if not anchor:
                print(f"      !! {rel}: некуда вставить блок")
                return (0, 0)
            pad = anchor.group(1)
            block = block_html(page_kind(out), missing, pad)
            out = out[: anchor.start()] + "\n\n" + block + out[anchor.start() :]

    # разметка пересобирается строго по тому, что видно на странице
    shown_after = [
        {"q": strip_tags(q), "a": strip_tags(a)} for q, a in DET_RE.findall(out)
    ]
    payload = [
        {
            "@type": "Question",
            "name": i["q"],
            "acceptedAnswer": {"@type": "Answer", "text": i["a"]},
        }
        for i in shown_after
    ]
    body = ",\n".join(json.dumps(p, ensure_ascii=False) for p in payload)
    out = FAQ_RE.sub(lambda mm: mm.group(1) + "[\n" + body + "\n]" + mm.group(3), out, count=1)

    path.write_text(out, encoding="utf-8")
    return (len(missing), len(extra))


def main() -> int:
    fix = "--check" not in sys.argv
    pages = [
        p
        for p in ROOT.rglob("*.html")
        if not any(s in p.as_posix() for s in SKIP) and not p.name.startswith("_")
    ]
    print("Сверка FAQ: разметка против видимого текста\n")
    to_screen = to_markup = 0
    for p in sorted(pages):
        a, b = process(p, fix)
        to_screen += a
        to_markup += b
    if not to_screen and not to_markup:
        print("  расхождений нет")
        return 0
    verb = "вернул на страницы" if fix else "не показано на страницах"
    print(f"\nВопросов {verb}: {to_screen} · добавлено в разметку: {to_markup}")
    return 0 if fix else 1


if __name__ == "__main__":
    raise SystemExit(main())
