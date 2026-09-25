# РИЛСЫ БЕЗ ЛИЦА: конвейер (заведён 25.09.2026)

Формат, взятый за образец, — блог без лица (@pronin.media, «Результаты за 2 месяца»):
вертикальные ролики, где кадр делает нейросеть, текст читает закадровый голос,
а титры идут крупно по центру. Лица автора нет, поэтому ролик можно собрать без съёмки.

Решения владельца от 25.09: формат — рилсы без лица, тема — видео и цвет,
площадки — Instagram Reels и Telegram-канал t.me/pobubnimzavideo.
Этот поток заменяет отбой роликов от 25.08 (docs/VIDEO_LESSONS_PLAN.md): роликом
теперь делаем не урок, а короткий крючок, который ведёт на интерактивный урок.

## Как устроено

```
reels/scripts/<slug>.json   сценарий: сцены (голос + промпт картинки), подписи к постам
        │
        ├─ images  → ChatGPT (OpenAI Images) рисует кадр на каждую сцену, 1024×1536
        ├─ voice   → OpenAI TTS читает текст сцены (или лежат свои wav/mp3, см. ниже)
        └─ build   → ffmpeg: медленный наезд на кадр + титры 1–3 слова + «ПОБУБНИМ»
                     → reels/out/<slug>/<slug>.mp4, cover.jpg, posts.txt
```

`reels/out/` в git не идёт (медиа в репо не кладём). Сценарии — идут.

## Команды

```bash
pip install pillow imageio-ffmpeg requests      # один раз; ffmpeg ставится сам

python reels/reel.py check 001-blyokloe-video   # хронометраж и число титров, бесплатно
python reels/reel.py all   001-blyokloe-video   # картинки + голос + сборка
python reels/reel.py images 001-blyokloe-video --only s3 --force   # перерисовать одну сцену
python reels/reel.py build 001-blyokloe-video --music bgm.mp3      # с тихой музыкой
python reels/reel.py telegram 001-blyokloe-video --to <chat_id>    # прислать ролик в Telegram
```

Уже готовые картинки и голос повторно не генерируются: деньги тратятся только на
новое. `--force` перегенерирует.

Черновик без ключа: `all <slug> --placeholder --silent` соберёт ролик на заглушках
и тишине, чтобы проверить монтаж, титры и длину.

## Картинки от ChatGPT через GitHub (без баланса API)

ChatGPT рисует по подписке и сдаёт кадры в `reels/incoming/<slug>/` на ветке
`codex/reels-images`. Протокол — `reels/bridge/README.md`, вход для ChatGPT —
`reels/bridge/CHATGPT_START.md`, задания — `reels/bridge/tasks/`
(`python reels/reel.py task <slug>`). Присланные кадры `images` берёт первыми.

## Подключение ChatGPT через API

Для ролика нужен ключ API OpenAI. Подписка ChatGPT Plus не подходит, у API
отдельный счёт.

1. platform.openai.com → API keys → Create new secret key. В Billing пополнить баланс.
2. В этой облачной среде Claude: меню среды в заголовке сессии → Edit → переменные
   окружения → `OPENAI_API_KEY=<ключ>`. Новая сессия подхватит его сама.
   На своём компьютере — переменная окружения в Windows с тем же именем.
3. Ключ в чат и в репозиторий не вставлять.

Если нужно, модели и голос меняются переменными окружения:
`OPENAI_IMAGE_MODEL` (по умолчанию gpt-image-1), `OPENAI_IMAGE_QUALITY` (high; medium
в разы дешевле), `OPENAI_TTS_MODEL` (gpt-4o-mini-tts), `OPENAI_TTS_VOICE` (onyx).
Цены смотреть на странице OpenAI Pricing. На один ролик уходит 5 картинок и около 40 секунд голоса.

Свой голос (Fish Audio, бренд-голос из МОНОЛИТА) — положить файлы
`reels/out/<slug>/audio/s1.wav … s5.wav` и запустить `build`: готовые файлы
имеют приоритет, TTS для них не вызывается.

## Telegram

`telegram` отправляет mp4 с обложкой и текстом `telegram.post` через бота.
Нужны `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`. Порядок: сначала `--to` своя личка
(проверить), потом канал `@pobubnimzavideo` (бот должен быть админом канала).

## Instagram

Авторазмещения нет: Graph API требует бизнес-аккаунт и приложение Facebook.
Публикуем с телефона: забрать mp4 и cover.jpg (удобно — прислать себе командой
`telegram`), подпись и хэштеги — из `posts.txt`. В шапке профиля должна стоять
ссылка `https://pobubnim.ru/uroki/?utm_source=instagram&utm_medium=bio`, потому что
все ролики отправляют «по ссылке в профиле».

Формат, правила сценария и план тем — `reels/PLAN.md`.
