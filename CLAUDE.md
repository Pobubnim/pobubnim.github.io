# ПОБУБНИМ — правила для агента (локально и в облаке)

Сайт pobubnim.ru: статика на GitHub Pages, деплой = push в `main`. В `main` —
только по слову владельца; работа идёт в ветке и черновом PR.

## Прочитать до правок

1. `docs/HANDOFF.md` — состояние и очередь.
2. `docs/INDEX.md` — карта репо.
3. `docs/SEO_RULES.md` — закон каждой страницы (title 50–65, description 150–190,
   один H1 с запросной строкой-label, FAQPage ровно по видимым вопросам, скрытый
   текст запрещён) и журнал решений. «Закон дизайна» там же: разбор интерфейса —
   таблицей «Было / Стало / Почему».
4. Дизайн-система v2 — `docs/design/` (README.md, index.html).

## Законы, которые не обсуждаются

- Цены — только `assets/data/prices.json`. Чего там нет — «считаю по задаче».
- Отзывы только настоящие, факты не выдумываются (38-ФЗ).
- Каждая ссылка в личку несёт тему страницы (`assets/js/lead.js`), рядом с
  телеграмом — запасной ВК. Тема `data-lead` — только из списка формы.
- Шапку и подвал не править руками: `tools/build_nav.py`. Сцены и разметку роликов
  услуг — `tools/build_scenes.py`. Оба идемпотентны: второй прогон ничего не меняет.
- Файлы подтверждения в корне (google…, yandex_…, ключ IndexNow) не трогать.

## Гейт перед push

На ПК владельца это делает `.git/hooks/pre-push`; в облаке хука нет — запускать руками:

    python3 tools/audit_site.py      # 0 ошибок обязательно
    python3 tools/check_prices.py    # «Расхождений нет»
    python3 tools/stamp_sitemap.py --check && python3 tools/stamp_dates.py --check

После выкладки: `python3 tools/indexnow.py <адреса>`.

## Облачная сессия

- Chromium для Playwright уже стоит (`/opt/pw-browsers`), npm-пакет —
  `/opt/node22/lib/node_modules/playwright`. Сервер превью:
  `python3 -m http.server 8766` из корня.
- Токенов Яндекса (Вебмастер, Метрика) здесь нет: `index_status.py`,
  `daily_stats.py`, `recrawl.py` запускаются только на ПК владельца.
- Личные скилы владельца (`emil-design-eng`, `pobubnim-pages`, `pobubnim-tools`,
  `marketing-channels-ru`, `find-skills`) живут на его ПК. В облаке они есть,
  только если лежат в репо в `.claude/skills/`.
