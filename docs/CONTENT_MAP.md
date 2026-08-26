# Карта контента ПОБУБНИМ

## Откуда что берётся
- Фото: C:\Users\User\Pictures\Материалы для Побубним → tools/prepare_media.py → assets/img/*.webp
  Слаги и исходники — в PHOTOS внутри скрипта. Тройники tri-* НЕ РЕЗАТЬ — коллажи 3 кадров, только целиком.
- Hero-видео: «Цвет ДО-ПОСЛЕ … LOOP видео.mp4» (4K 118с) → assets/video/hero-loop.mp4 (1080p x264 CRF28, без звука).
- Видеоработы: ХОТЛИНК на https://seversvet.github.io/assets/film/<id>[-loop].mp4 + <id>.webp
  (репо seversvet, обе площадки наши; каталог работ — seversvet site/assets/portfolio.js).
- Скрины приложения MONOLITH: хотлинк https://monolithapp.github.io/assets/desktop-*.jpg, mobile-*.jpg.
- Свои фильмы витрины: FTX13 → assets/video/ftx.mp4 (мотофристайл), «Поля инста» →
  polya.mp4 (fashion) + лупы и постеры; конвейер `python tools/prepare_media.py films`.
- Hero: hero-loop-hd.mp4 (1440p, десктоп ≥1024px, подменяет JS) + hero-loop.mp4 (1080p, мобилы).

## Темы фотоматериала
Тройники: завод-BTS ×8, гонки ×2, свадьбы ×2, город ×2, клипы (балет, микрофон, силуэт, тёмный портрет),
предметка (телефоны ×2, бар), концерт, кабаре, бокс, поля ×2, кино-портреты, арт (красное пальто ч/б).
Горизонтальные: часы ×2, talking head ×2, грим (циркач, инопланетянин), тёплый портрет, ч/б BTS, венок 4K, свадьба.
Обо мне: за монитором (about-monitor), с камерой (about-camera), стедикам, риг, хромакей, фишай.

## Служебная графика (генерируется, не рисуется руками)

- OG-превью страниц: `python tools/build_og.py` (кадр + скрим + подпись) и
  `python tools/build_og_tools.py` (карточки инструментов: тёмный фон, название,
  мини-лист с примером). Результат — assets/og/*.jpg, у инструментов префикс tool-.
- Шрифты сайта лежат у нас: `python tools/fetch_fonts.py` тянет woff2-подмножества
  и пересобирает assets/css/fonts.css. Google Fonts со страниц убран (кроме архивной
  videos/log-i-grade). Меняете веса в CSS — перегоняйте скрипт.

## Правила
- Тяжёлые исходники в git не кладём; видео работ не дублируем — хотлинк.
- Новые фото: добавить строку в PHOTOS → python tools/prepare_media.py → закоммитить webp.
