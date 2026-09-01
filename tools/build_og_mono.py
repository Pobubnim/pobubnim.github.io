# -*- coding: utf-8 -*-
"""OG-превью для страниц о продукте МОНОЛИТ — в языке самого продукта.

Зачем третий генератор рядом с build_og.py (кадр + подпись) и build_og_tools.py
(лист документа): у продуктовых страниц нет ни кадра, ни документа. Их превью —
это ПРИБОР: обсидиановый грунт, кольцо месяца, индиго-свечение. Ссылка в
мессенджере должна выглядеть как приложение, а не как страница сайта.

Рендер — headless Chrome по тому же приёму, что promo/build_cards.py:
HTML отдаёт полный контроль над типографикой, PIL только жмёт в jpg.

Запуск:  python tools/build_og_mono.py   ->  assets/og/<slug>.jpg
"""
import os
import pathlib
import subprocess
import tempfile

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "og"
FONTS = ROOT / "assets" / "fonts"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# slug: (надчерк, заголовок, подпись под ним, число в кольце, подпись числа)
CARDS = {
    "shtab": (
        "Приложение МОНОЛИТ · модуль ШТАБ",
        "Заказы приходят сами.<br>Пока вы на площадке.",
        "Telegram, hh.ru, FL.ru и Авито — одной лентой",
        "667",
        "заказов в ленте",
    ),
}

HTML = """<!doctype html><meta charset="utf-8">
<style>
@font-face{{font-family:'Manrope';src:url('file:///{fonts}/Manrope-var-cyr-lat.woff2') format('woff2');font-weight:200 800}}
@font-face{{font-family:'Inter Tight';src:url('file:///{fonts}/InterTight-300-600-cyrillic.woff2') format('woff2');font-weight:300 600}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1200px;height:630px;overflow:hidden}}
body{{background:
   radial-gradient(760px 420px at 88% -12%, rgba(110,89,240,.30), transparent 62%),
   radial-gradient(560px 340px at -6% 112%, rgba(245,166,35,.07), transparent 60%),
   #08080B;
  color:#F5F5FA;font-family:'Inter Tight',system-ui,sans-serif;position:relative}}
.in{{position:absolute;inset:0;padding:66px 70px;display:flex;align-items:center;gap:56px}}
.txt{{flex:1;min-width:0;max-width:720px}}
.eye{{font-family:'Manrope';font-size:19px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#8E8EA0}}
h1{{margin-top:22px;font-family:'Manrope';font-size:58px;font-weight:800;letter-spacing:-.04em;line-height:1.03}}
.sub{{margin-top:24px;font-size:26px;color:#9C9CAC;line-height:1.4}}
.chips{{margin-top:34px;display:flex;gap:12px}}
.chip{{padding:11px 20px;border-radius:999px;font-size:20px;font-weight:600;color:#CFC8FF;
  background:rgba(110,89,240,.16);box-shadow:inset 0 0 0 1px rgba(123,107,255,.4)}}
.chip.w{{color:#F5A623;background:rgba(245,166,35,.10);box-shadow:inset 0 0 0 1px rgba(245,166,35,.32)}}
.ring{{position:relative;width:330px;height:330px;flex:none}}
.ring svg{{transform:rotate(-90deg)}}
.rc{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}}
.rc b{{font-size:64px;font-weight:700;letter-spacing:-.035em;font-variant-numeric:tabular-nums}}
.rc i{{font-style:normal;font-size:20px;color:#9C9CAC;margin-top:8px;letter-spacing:.02em}}
.mark{{position:absolute;left:70px;bottom:52px;font-family:'Manrope';font-size:20px;font-weight:800;
  letter-spacing:.16em;color:#6B6B7A}}
</style>
<div class="in">
  <div class="txt">
    <div class="eye">{eye}</div>
    <h1>{title}</h1>
    <div class="sub">{sub}</div>
    <div class="chips"><span class="chip">Windows и Android</span><span class="chip w">14 дней без карты</span></div>
  </div>
  <div class="ring">
    <svg width="330" height="330" viewBox="0 0 330 330">
      <defs>
        <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7B6BFF"/><stop offset="1" stop-color="#9A5CF6"/></linearGradient>
        <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFC257"/><stop offset="1" stop-color="#E8890C"/></linearGradient>
      </defs>
      <circle cx="165" cy="165" r="126" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="22"/>
      <circle cx="165" cy="165" r="126" fill="none" stroke="url(#a)" stroke-width="22" stroke-linecap="round"
              stroke-dasharray="791.7" stroke-dashoffset="0"/>
      <circle cx="165" cy="165" r="151" fill="none" stroke="url(#o)" stroke-width="9" stroke-linecap="round"
              stroke-dasharray="948.8" stroke-dashoffset="199"/>
      <circle cx="165" cy="165" r="104" fill="none" stroke="#23C98C" stroke-width="5" stroke-linecap="round"
              stroke-dasharray="653.5" stroke-dashoffset="248"/>
    </svg>
    <div class="rc"><b>{num}</b><i>{numsub}</i></div>
  </div>
</div>
<div class="mark">ПОБУБНИМ · MONOLITHAPP.GITHUB.IO</div>
"""


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    fonts = FONTS.as_posix()
    for slug, (eye, title, sub, num, numsub) in CARDS.items():
        html = HTML.format(fonts=fonts, eye=eye, title=title, sub=sub, num=num, numsub=numsub)
        with tempfile.TemporaryDirectory() as tmp:
            page = pathlib.Path(tmp) / "card.html"
            png = pathlib.Path(tmp) / "card.png"
            page.write_text(html, encoding="utf-8")
            subprocess.run(
                [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                 "--allow-file-access-from-files", "--virtual-time-budget=3000",
                 "--window-size=1200,630", f"--screenshot={png}", page.as_uri()],
                check=True, capture_output=True,
            )
            img = Image.open(png).convert("RGB")
            dst = OUT / f"{slug}.jpg"
            img.save(dst, quality=88, optimize=True)
            print(f"{dst.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {dst.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    build()
