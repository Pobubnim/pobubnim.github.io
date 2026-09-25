"""Конвейер рилсов без лица ПОБУБНИМ: сценарий -> картинки -> голос -> ролик 9:16.

    python reels/reel.py images  <slug>     картинки сцен (ChatGPT / OpenAI Images)
    python reels/reel.py voice   <slug>     закадровый голос сцен (OpenAI TTS)
    python reels/reel.py build   <slug>     сборка mp4 + обложка + тексты постов
    python reels/reel.py all     <slug>     всё по порядку
    python reels/reel.py check   <slug>     проверить сценарий, ничего не генерируя
    python reels/reel.py telegram <slug>    отправить готовый ролик с текстом поста в Telegram

Ключ берётся из переменной окружения OPENAI_API_KEY (в репо ключ НЕ класть).
Для `telegram`: TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID (личка — на проверку,
@pobubnimzavideo — в канал; бот должен быть админом канала). --to меняет адресата.
Без ключа: `images --placeholder` рисует заглушки, `voice --silent` пишет тишину
по длине текста — так можно собрать черновик и проверить монтаж.

Уже готовые файлы не перегенерируются (деньги!), флаг --force — перегенерировать.
Одну сцену: --only s3. Результат: reels/out/<slug>/ (в git не идёт).

Зависимости: pip install pillow imageio-ffmpeg requests
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import textwrap
import unicodedata
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
FONTS = REPO / "assets" / "fonts"
OUT = ROOT / "out"

W, H, FPS = 1080, 1920, 30
CREAM = (245, 239, 226)
BLACK = (0, 0, 0)
ACCENT = (232, 180, 94)  # тёплый акцент для слова-ключа в титре

API = "https://api.openai.com/v1"
IMAGE_MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
IMAGE_QUALITY = os.environ.get("OPENAI_IMAGE_QUALITY", "high")
TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "onyx")

# Общий стиль картинок: одна рука на весь блог, чтобы лента выглядела серией.
STYLE = (
    "Cinematic film still, vertical 9:16 composition, shot on a cinema camera, "
    "moody low-key lighting, deep true blacks, warm cream highlights, subtle film grain, "
    "shallow depth of field, color palette of black, warm cream (#f5efe2) and amber. "
    "Faceless: no recognizable human faces (show hands, silhouettes, backs, gear, screens). "
    "Absolutely no text, letters, numbers, logos or watermarks in the image. "
    "Keep the middle-lower third calm and uncluttered: subtitles will be placed there."
)

TTS_INSTRUCTIONS = (
    "Русский язык. Спокойный уверенный мужской голос опытного колориста, "
    "говорит как другу за монтажным столом: живо, без дикторского пафоса, "
    "с короткими паузами перед главным словом. Темп чуть быстрее обычного."
)


# ---------------------------------------------------------------- сценарий

def load(slug):
    path = ROOT / "scripts" / f"{slug}.json"
    if not path.exists():
        sys.exit(f"нет сценария {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    for key in ("slug", "title", "scenes", "instagram", "telegram"):
        if key not in data:
            errors.append(f"нет поля {key}")
    ids = set()
    for i, sc in enumerate(data.get("scenes", [])):
        for key in ("id", "voice", "image"):
            if not sc.get(key):
                errors.append(f"сцена {i + 1}: нет поля {key}")
        if sc.get("id") in ids:
            errors.append(f"сцена {sc.get('id')}: id повторяется")
        ids.add(sc.get("id"))
    if errors:
        sys.exit("сценарий с ошибками:\n  " + "\n  ".join(errors))
    return data


def plain(text):
    """Текст для экрана: без знаков ударения и служебных пауз."""
    text = unicodedata.normalize("NFD", text).replace("́", "")
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def outdir(slug, sub=""):
    d = OUT / slug / sub
    d.mkdir(parents=True, exist_ok=True)
    return d


def api_key():
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        sys.exit(
            "нет OPENAI_API_KEY. Добавь ключ в переменные окружения "
            "(или запусти с --placeholder / --silent для черновика)."
        )
    return key


def scenes_for(data, only):
    scenes = data["scenes"]
    if only:
        scenes = [s for s in scenes if s["id"] in only.split(",")]
        if not scenes:
            sys.exit(f"нет сцен {only}")
    return scenes


# ---------------------------------------------------------------- картинки

def cmd_images(data, args):
    d = outdir(data["slug"], "img")
    for sc in scenes_for(data, args.only):
        path = d / f"{sc['id']}.png"
        if path.exists() and not args.force:
            print(f"  {sc['id']}: уже есть")
            continue
        if args.placeholder:
            placeholder(sc, path)
            print(f"  {sc['id']}: заглушка")
            continue
        prompt = f"{sc['image']}\n\nStyle: {data.get('style', STYLE)}"
        print(f"  {sc['id']}: генерирую ({IMAGE_MODEL})…", flush=True)
        r = requests.post(
            f"{API}/images/generations",
            headers={"Authorization": f"Bearer {api_key()}"},
            json={"model": IMAGE_MODEL, "prompt": prompt, "size": "1024x1536",
                  "quality": IMAGE_QUALITY, "n": 1},
            timeout=300,
        )
        if r.status_code != 200:
            sys.exit(f"Images API {r.status_code}: {r.text[:500]}")
        item = r.json()["data"][0]
        if item.get("b64_json"):
            path.write_bytes(base64.b64decode(item["b64_json"]))
        else:
            path.write_bytes(requests.get(item["url"], timeout=120).content)


def placeholder(sc, path):
    """Тёмная заглушка с текстом промпта: видно, какая картинка тут будет."""
    img = Image.new("RGB", (1024, 1536), (18, 16, 14))
    draw = ImageDraw.Draw(img)
    for y in range(1536):  # мягкий тёплый градиент снизу
        k = y / 1536
        draw.line([(0, y), (1024, y)], fill=(int(18 + 40 * k), int(16 + 28 * k), int(14 + 12 * k)))
    font = ImageFont.truetype(str(FONTS / "InterTight-var.ttf"), 34)
    lines = textwrap.wrap(f"[{sc['id']}] {sc['image']}", 44)[:14]
    draw.multiline_text((70, 560), "\n".join(lines), font=font, fill=(150, 140, 125), spacing=10)
    img.save(path)


# ---------------------------------------------------------------- голос

def cmd_voice(data, args):
    d = outdir(data["slug"], "audio")
    for sc in scenes_for(data, args.only):
        mine = [p for p in d.glob(f"{sc['id']}.*") if p.suffix in (".wav", ".mp3")]
        if mine and not args.force:
            print(f"  {sc['id']}: уже есть ({mine[0].name})")
            continue
        path = d / f"{sc['id']}.mp3"
        if args.silent:
            secs = max(1.5, len(plain(sc["voice"])) / 15)  # ≈15 знаков в секунду
            ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", f"{secs:.2f}",
                    "-q:a", "9", str(path)])
            print(f"  {sc['id']}: тишина {secs:.1f} с")
            continue
        print(f"  {sc['id']}: озвучиваю ({TTS_MODEL}, {TTS_VOICE})…", flush=True)
        r = requests.post(
            f"{API}/audio/speech",
            headers={"Authorization": f"Bearer {api_key()}"},
            json={"model": TTS_MODEL, "voice": data.get("voice_name", TTS_VOICE),
                  "input": sc["voice"], "instructions": TTS_INSTRUCTIONS,
                  "response_format": "mp3"},
            timeout=300,
        )
        if r.status_code != 200:
            sys.exit(f"TTS API {r.status_code}: {r.text[:500]}")
        path.write_bytes(r.content)


# ---------------------------------------------------------------- сборка

def ffmpeg(args, quiet=True):
    import imageio_ffmpeg
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error"] + args
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode:
        sys.exit(f"ffmpeg упал:\n{res.stderr[-2000:]}")
    return res


def duration(path):
    import imageio_ffmpeg
    res = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", res.stderr)
    if not m:
        sys.exit(f"не прочитать длину {path}")
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def font(size, weight=800):
    f = ImageFont.truetype(str(FONTS / "InterTight-var.ttf"), size)
    f.set_variation_by_axes([weight])
    return f


def title_fonts(size, text):
    """Шрифты заголовка. Playfair на сайте разрезан на два файла (кириллица и
    латиница с пунктуацией): буквы берём из одного, «?», «—», «»» — из другого.
    Если в заголовке латинские слова (LUT, LOG) — весь заголовок Inter Tight."""
    if re.search(r"[A-Za-z]", text):
        f = font(size, 800)
        return f, f
    cyr = ImageFont.truetype(str(FONTS / "PlayfairDisplay-500i-cyrillic.woff2"), size)
    lat = ImageFont.truetype(str(FONTS / "PlayfairDisplay-500i-latin.woff2"), size)
    return cyr, lat


def runs(line, cyr, lat):
    out = []
    for ch in line:
        f = cyr if 0x0400 <= ord(ch) <= 0x052F else lat
        if out and out[-1][1] is f:
            out[-1][0] += ch
        else:
            out.append([ch, f])
    return out


def draw_runs(draw, xy, parts, fill):
    x, y = xy
    for text, f in parts:
        draw.text((x, y), text, font=f, fill=fill)
        x += draw.textlength(text, font=f)


def chunks(text, max_words=3, max_chars=18):
    """Титры в стиле рилсов: 1–3 слова на экране, короткие предлоги липнут к следующему."""
    words = plain(text).split()
    out, cur = [], []
    for w in words:
        trial = " ".join(cur + [w])
        if cur and (len(cur) >= max_words or len(trial) > max_chars) and len(cur[-1]) > 2:
            out.append(" ".join(cur))
            cur = [w]
        else:
            cur.append(w)
        if re.search(r"[.!?…:]$", w):
            out.append(" ".join(cur))
            cur = []
    if cur:
        out.append(" ".join(cur))
    return out


def text_layer(path, caption=None, title=None, keyword=None, brand=True):
    """Прозрачный слой 1080×1920: заголовок сверху, титр в нижней трети, подпись бренда."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if title:
        cyr, lat = title_fonts(104, title)
        y = 250
        for line in textwrap.wrap(plain(title), 16):
            parts = runs(line, cyr, lat)
            width = sum(draw.textlength(t, font=f) for t, f in parts)
            x = (W - width) // 2
            layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            draw_runs(ImageDraw.Draw(layer), (x, y + 6), parts, (0, 0, 0, 220))
            img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(14)))
            draw_runs(draw, (x, y), parts, CREAM)
            y += 128

    if caption:
        f = font(92, 850)
        text = caption.upper()
        box = draw.textbbox((0, 0), text, font=f, stroke_width=10)
        if box[2] - box[0] > W - 120:  # длинное слово — уменьшаем кегль
            f = font(int(92 * (W - 120) / (box[2] - box[0])), 850)
            box = draw.textbbox((0, 0), text, font=f, stroke_width=10)
        x = (W - (box[2] - box[0])) // 2
        y = int(H * 0.64)
        hot = keyword and plain(keyword).lower() in caption.lower()
        draw.text((x, y), text, font=f, fill=ACCENT if hot else CREAM,
                  stroke_width=10, stroke_fill=BLACK)

    if brand:
        f = font(34, 600)
        label = "ПОБУБНИМ"
        box = draw.textbbox((0, 0), label, font=f)
        draw.text(((W - (box[2] - box[0])) // 2, H - 150), label, font=f,
                  fill=(245, 239, 226, 170))
    img.save(path)


def scene_audio(d, sc):
    for ext in (".wav", ".mp3"):
        p = d / f"{sc['id']}{ext}"
        if p.exists():
            return p
    sys.exit(f"нет голоса сцены {sc['id']} — сначала `voice`")


def cmd_build(data, args):
    slug = data["slug"]
    base = outdir(slug)
    img_dir, aud_dir, tmp = base / "img", base / "audio", outdir(slug, "tmp")
    segments = []
    moves = ["in", "out", "up", "in", "down"]
    for i, sc in enumerate(data["scenes"]):
        img = img_dir / f"{sc['id']}.png"
        if not img.exists():
            sys.exit(f"нет картинки сцены {sc['id']} — сначала `images`")
        audio = scene_audio(aud_dir, sc)
        pad = 0.35
        dur = duration(audio) + pad
        frames = int(round(dur * FPS))

        # титры: время делим пропорционально длине фрагмента
        parts = chunks(sc["voice"])
        total = sum(len(p) + 3 for p in parts)
        layers, t = [], 0.08
        speech = dur - pad
        for j, part in enumerate(parts):
            span = speech * (len(part) + 3) / total
            png = tmp / f"{sc['id']}_{j:02d}.png"
            text_layer(png, caption=part, title=sc.get("title"), keyword=sc.get("keyword"))
            end = dur if j == len(parts) - 1 else t + span
            layers.append((png, t if j else 0, end))
            t += span

        move = sc.get("move", moves[i % len(moves)])
        z = {"in": "1+0.10*on/{n}", "out": "1.10-0.10*on/{n}",
             "up": "1.08", "down": "1.08"}[move].format(n=frames)
        yexpr = {"up": f"(ih-ih/zoom)*(1-on/{frames})", "down": f"(ih-ih/zoom)*on/{frames}"}.get(
            move, "ih/2-(ih/zoom/2)")
        # 1024×1536 -> вырез 9:16 -> x2 (меньше дрожи у zoompan) -> плавный наезд
        chain = (f"[0:v]crop=864:1536,scale=2160:3840,"
                 f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='{yexpr}':d={frames}:s={W}x{H}:fps={FPS},"
                 f"format=yuv420p[v0]")
        inputs = ["-i", str(img)]
        for k, (png, a, b) in enumerate(layers):
            inputs += ["-i", str(png)]
            chain += (f";[v{k}][{k + 1}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'"
                      f"[v{k + 1}]")
        inputs += ["-i", str(audio)]
        seg = tmp / f"seg_{i:02d}.mp4"
        ffmpeg(inputs + [
            "-filter_complex", chain + f";[{len(layers) + 1}:a]apad=pad_dur={pad},"
            f"aresample=44100,aformat=channel_layouts=stereo[a]",
            "-map", f"[v{len(layers)}]", "-map", "[a]", "-t", f"{dur:.3f}",
            "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(seg)])
        segments.append(seg)
        print(f"  {sc['id']}: {dur:.1f} с, {len(parts)} титров, движение {move}")

    listing = tmp / "concat.txt"
    listing.write_text("".join(f"file '{s.as_posix()}'\n" for s in segments), encoding="utf-8")
    final = base / f"{slug}.mp4"
    music = args.music or data.get("music")
    if music:
        ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-stream_loop", "-1",
                "-i", str(music), "-filter_complex",
                "[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
                "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", str(final)])
    else:
        ffmpeg(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy",
                "-movflags", "+faststart", str(final)])

    cover(data, base)
    posts(data, base)
    print(f"готово: {final.relative_to(REPO)} ({duration(final):.1f} с)")


def cover(data, base):
    """Обложка рилса и картинка для поста в Telegram: первая сцена + хук."""
    sc = data["scenes"][0]
    img = Image.open(base / "img" / f"{sc['id']}.png").convert("RGB")
    img = img.crop((80, 0, 944, 1536)).resize((W, H), Image.LANCZOS)
    dark = Image.new("RGB", (W, H), BLACK)
    img = Image.blend(img, dark, 0.25).convert("RGBA")
    layer = base / "tmp" / "cover_text.png"
    text_layer(layer, title=data.get("cover", data["title"]))
    img.alpha_composite(Image.open(layer))
    img.convert("RGB").save(base / "cover.jpg", quality=92)


def posts(data, base):
    ig = data["instagram"]
    tags = " ".join("#" + t.lstrip("#") for t in ig.get("hashtags", []))
    text = (f"=== INSTAGRAM (подпись к рилсу) ===\n{ig['caption'].strip()}\n\n{tags}\n\n"
            f"=== TELEGRAM (пост с роликом) ===\n{data['telegram']['post'].strip()}\n")
    (base / "posts.txt").write_text(text, encoding="utf-8")


def cmd_telegram(data, args):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = args.to or os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        sys.exit("нужны TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID (или --to)")
    base = OUT / data["slug"]
    video = base / f"{data['slug']}.mp4"
    if not video.exists():
        sys.exit("ролика нет — сначала `build`")
    caption = data["telegram"]["post"].strip()
    if len(caption) > 1024:
        sys.exit(f"текст поста {len(caption)} знаков, Telegram берёт в подпись не больше 1024")
    with open(video, "rb") as v, open(base / "cover.jpg", "rb") as c:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendVideo",
            data={"chat_id": chat, "caption": caption, "width": W, "height": H,
                  "supports_streaming": "true"},
            files={"video": v, "thumbnail": c}, timeout=600,
        )
    if not r.ok or not r.json().get("ok"):
        sys.exit(f"Telegram {r.status_code}: {r.text[:500]}")
    print(f"отправлено в {chat}")


def cmd_check(data, args):
    total = 0.0
    for sc in data["scenes"]:
        secs = len(plain(sc["voice"])) / 15
        total += secs + 0.35
        print(f"  {sc['id']}: ~{secs:.1f} с · {len(chunks(sc['voice']))} титров")
    print(f"итого ~{total:.0f} с (цель 30–45)")
    if not 25 <= total <= 55:
        print("  ВНИМАНИЕ: длина вне коридора формата")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("cmd", choices=["images", "voice", "build", "all", "check", "telegram"])
    p.add_argument("slug")
    p.add_argument("--only", help="только эти сцены: s1,s3")
    p.add_argument("--force", action="store_true", help="перегенерировать готовое")
    p.add_argument("--placeholder", action="store_true", help="картинки-заглушки без API")
    p.add_argument("--silent", action="store_true", help="тишина вместо голоса без API")
    p.add_argument("--music", help="фоновая музыка (mp3/wav), тихо под голос")
    p.add_argument("--to", help="telegram: куда отправить (chat_id или @канал)")
    args = p.parse_args()
    data = load(args.slug)
    if args.cmd == "check":
        cmd_check(data, args)
    if args.cmd == "telegram":
        cmd_telegram(data, args)
    if args.cmd in ("images", "all"):
        print("картинки:")
        cmd_images(data, args)
    if args.cmd in ("voice", "all"):
        print("голос:")
        cmd_voice(data, args)
    if args.cmd in ("build", "all"):
        print("сборка:")
        cmd_build(data, args)


if __name__ == "__main__":
    main()
