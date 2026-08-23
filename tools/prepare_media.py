# -*- coding: utf-8 -*-
"""Конвейер медиа ПОБУБНИМ: исходники из Pictures -> веб-ассеты в repo.
Запуск: python tools/prepare_media.py  (из корня репо)
Видео жмёт ffmpeg (x264), фото -- Pillow в webp. Повторный запуск перезаписывает."""
import os, subprocess, sys
from PIL import Image

SRC = r"C:\Users\User\Pictures\Материалы для Побубним"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(REPO, "assets", "img")
VID = os.path.join(REPO, "assets", "video")
os.makedirs(IMG, exist_ok=True); os.makedirs(VID, exist_ok=True)

# слаг -> (исходник, ширина_вебп)
PHOTOS = {
    # вертикальные тройники-коллажи (резать нельзя, кладём целиком) 720w
    "tri-art-red-coat":   ("IMG_20260413_222825_139.jpg", 720),
    "tri-city-1":         ("IMG_20260430_224926_682.jpg", 720),
    "tri-city-2":         ("IMG_20260430_224930_499.jpg", 720),
    "tri-factory-1":      ("IMG_20260512_211441_852.jpg", 720),
    "tri-factory-2":      ("IMG_20260512_211443_993.jpg", 720),
    "tri-factory-3":      ("IMG_20260512_211445_683.jpg", 720),
    "tri-factory-4":      ("IMG_20260515_011816_291.jpg", 720),
    "tri-factory-5":      ("IMG_20260515_011817_510.jpg", 720),
    "tri-factory-6":      ("IMG_20260515_011819_299.jpg", 720),
    "tri-factory-7":      ("IMG_20260515_011821_667.jpg", 720),
    "tri-factory-8":      ("IMG_20260515_011823_311.jpg", 720),
    "tri-dark-portrait":  ("IMG_20260518_140118_142.jpg", 720),
    "tri-ballet":         ("IMG_20260518_140120_600.jpg", 720),
    "tri-silhouette":     ("IMG_20260518_140122_056.jpg", 720),
    "tri-music":          ("IMG_20260518_161321_158.jpg", 720),
    "tri-race-1":         ("IMG_20260524_194812_465.jpg", 720),
    "tri-race-2":         ("IMG_20260524_194813_820.jpg", 720),
    "tri-cine-portraits": ("IMG_20260601_014913_618.png", 720),
    "tri-phone-1":        ("IMG_20260620_235843_107.jpg", 720),
    "tri-phone-2":        ("IMG_20260620_235848_749.jpg", 720),
    "tri-wedding-1":      ("IMG_20260728_071103_904.jpg", 720),
    "tri-street-red":     ("IMG_20260728_071123_929.jpg", 720),
    "tri-street-man":     ("IMG_20260728_071124_036.jpg", 720),
    "tri-concert":        ("IMG_20260728_071124_046.jpg", 720),
    "tri-bts-cam":        ("IMG_20260728_071124_264.jpg", 720),
    "tri-cabaret":        ("IMG_20260728_071124_311.jpg", 720),
    "tri-workshop":       ("IMG_20260728_071124_630.jpg", 720),
    "tri-boxing":         ("IMG_20260728_071124_649.jpg", 720),
    "tri-wedding-2":      ("IMG_20260728_071124_772.jpg", 720),
    "tri-bar":            ("IMG_20260728_071124_794.jpg", 720),
    "tri-field-1":        ("IMG_20260820_124504_024.jpg", 720),
    "tri-field-2":        ("IMG_20260820_124506_585.jpg", 720),
    "still-street":       ("Still 2026-08-05 150029_1.23.1.jpg", 1080),
    # горизонтальные кадры 1600w
    "hz-bw-film":         ("IMG_20260418_212248.jpg", 1600),
    "hz-circus-red":      ("IMG_20260601_030130_341.png", 1600),
    "hz-alien-green":     ("IMG_20260601_030131_612.png", 1600),
    "hz-warm-portrait":   ("IMG_20260601_030142_186.png", 1600),
    "hz-watch-1":         ("IMG_20260620_235032_602.png", 1600),
    "hz-watch-2":         ("IMG_20260620_235032_690.png", 1600),
    "hz-therapy-1":       ("IMG_20260620_235033_380.png", 1600),
    "hz-therapy-2":       ("IMG_20260620_235035_870.png", 1600),
    "hz-field-still":     ("Still 2026-08-17 010856_1.111.5.jpg", 1920),
    "hz-wedding":         ("image_2026-07-04_22-00-42 (2).png", 1600),
    # обо мне
    "about-monitor":      (os.path.join("Обо мне", "DSCF1061.JPG"), 1600),
    "about-camera":       (os.path.join("Обо мне", "IMG_20260515_224501_234.jpg"), 1200),
    "about-steadicam":    (os.path.join("Обо мне", "IMG_20260515_224529_497.jpg"), 1200),
    "about-rig":          (os.path.join("Обо мне", "IMG_20260620_093355_685.jpg"), 1280),
    "about-chroma":       (os.path.join("Обо мне", "IMG_20260620_093424_004.jpg"), 1280),
    "about-fisheye":      (os.path.join("Обо мне", "IMG_20260505_214743_172.jpg"), 960),
}

def photos():
    for slug, (rel, w) in PHOTOS.items():
        src = os.path.join(SRC, rel)
        out = os.path.join(IMG, slug + ".webp")
        im = Image.open(src).convert("RGB")
        if im.width > w:
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=82, method=6)
        print(f"{slug}.webp  {os.path.getsize(out)//1024} KB")

def hero():
    src = os.path.join(SRC, "Цвет ДО-ПОСЛЕ для главного экрана LOOP видео.mp4")
    out = os.path.join(VID, "hero-loop.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
        "-vf", "scale=1920:1080", "-c:v", "libx264", "-preset", "slow",
        "-crf", "28", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out], check=True)
    print(f"hero-loop.mp4  {os.path.getsize(out)//1024//1024} MB")
    # постер: кадр в грейде
    poster = os.path.join(IMG, "hero-poster.webp")
    tmp = os.path.join(VID, "_poster.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "34", "-i", src,
        "-frames:v", "1", tmp], check=True)
    im = Image.open(tmp).convert("RGB").resize((1920, 1080), Image.LANCZOS)
    im.save(poster, "WEBP", quality=80, method=6); os.remove(tmp)
    print(f"hero-poster.webp  {os.path.getsize(poster)//1024} KB")



# --- собственные фильмы витрины + HQ-версия hero (запуск: python tools/prepare_media.py films) ---
FILMS_SRC = {
    # слаг: (файл, постер_сек, луп_старт_сек, луп_длит_сек)
    "ftx":   ("FTX13.mp4", 30, 29, 4),
    "polya": ("Поля инста.mp4", 63, 62, 4),
}

def films():
    for slug, (rel, poster_t, loop_ss, loop_t) in FILMS_SRC.items():
        src = os.path.join(SRC, rel)
        full = os.path.join(VID, slug + ".mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
            "-vf", "scale=1920:1080", "-c:v", "libx264", "-preset", "slow", "-crf", "24",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", full], check=True)
        loop = os.path.join(VID, slug + "-loop.mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(loop_ss), "-t", str(loop_t), "-i", src,
            "-vf", "scale=960:540", "-c:v", "libx264", "-preset", "slow", "-crf", "30",
            "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", loop], check=True)
        tmp = os.path.join(VID, "_p.png")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(poster_t), "-i", src, "-frames:v", "1", tmp], check=True)
        im = Image.open(tmp).convert("RGB").resize((1280, 720), Image.LANCZOS)
        im.save(os.path.join(IMG, slug + "-poster.webp"), "WEBP", quality=80, method=6); os.remove(tmp)
        print(slug, os.path.getsize(full)//1024//1024, "MB / loop", os.path.getsize(loop)//1024, "KB")

def hero_hd():
    src = os.path.join(SRC, "Цвет ДО-ПОСЛЕ для главного экрана LOOP видео.mp4")
    out = os.path.join(VID, "hero-loop-hd.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
        "-vf", "scale=2560:1440", "-c:v", "libx264", "-preset", "slow", "-crf", "24",
        "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out], check=True)
    print("hero-loop-hd.mp4", os.path.getsize(out)//1024//1024, "MB")
    # мобильная версия качеством получше прежнего
    out2 = os.path.join(VID, "hero-loop.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
        "-vf", "scale=1920:1080", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
        "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out2], check=True)
    print("hero-loop.mp4", os.path.getsize(out2)//1024//1024, "MB")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "films":
        films(); hero_hd()
    else:
        photos(); hero()
