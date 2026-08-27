# INDEX — мастер-карта репозитория ПОБУБНИМ (заведена 26.08.2026)

Сайт pobubnim.github.io (GitHub Pages, деплой = git push в main).
Вход в проект — docs/HANDOFF.md; этот файл — карта «что где лежит».
Граф кода — codebase-memory MCP, проект `C-src-pobubnim` (переиндексация:
index_repository после крупных правок; проверка: index_status / detect_changes).

## Доки (docs/)

| Файл | Что это |
|---|---|
| HANDOFF.md | вход: состояние, очередь, ритуалы |
| INDEX.md | этот файл — карта репо |
| SEO_RULES.md | ЗАКОН страниц (title/description/H1/schema) + журнал по датам |
| EDU_BASE.md | база СВЕРЕННЫХ фактов уроков: §1–7 канон, §8а источники, §8б числа цвета, §8в карта досок, §8г носители, §8д формулы инструментов Resolve, §8е ISO и Байер, §8ж язык кадра, §8з солнце, §8и глубина резкости, §8к экспозиция и ND |
| EDU_SOURCES.md | каталог первоисточников: школа BMD, школы колористов, стандарты, white papers |
| TOOLS_ROADMAP.md | карта /instrumenty/: что стоит, очередь, разведка ниш |
| CONTENT_MAP.md, SEO_KEYWORDS.md, SPEC.md | карта контента и запросов |
| ANALYTICS.md | Метрика 111935483, цели, Вебмастер, ежедневная сводка в ТГ |
| GROWTH_PLAN.md | разбор цифр 27.08 + очередь роста: техдолг, домен, мост «инструмент→заявка» |
| (код) assets/js/share.js | ссылка на расчёт + подпись про черновик; подключать ДО скрипта инструмента |
| (код) tools/indexnow.py | пинг IndexNow по страницам последнего коммита |
| LEADS_ADMIN.md | заявки: Supabase-бэкенд, админка |
| VIDEO_LESSONS_PLAN.md, YANDEX_ALGO.md | архив (ролики отменены 25.08; конспект алгоритмов) |

## Страницы

- Корень: index (главная+прайс), raboty, education (обучение+карточки уроков),
  konstruktor-dogovora (инструмент №1, URL не менять), privacy (152-ФЗ),
  404, admin (noindex), videograf-{aprelevka,naro-fominsk,obninsk} (гео).
- `services/` — 8 услуг (свадьбы, клипы, реклама, имидж, мероприятия,
  цветокоррекция, сайты, боты). Прайс — ТОЛЬКО с главной.
- `cases/` — monolith, seversvet.
- `articles/` — хаб index + 9 статей (цены, гайды, договор).
- `uroki/` — интерактивные уроки/доски (канон фактов EDU_BASE, блоки lesson.css):
  01 poryadok-cvetokorrekcii · 02 log-i-grade · 03 skoupy-kak-videt (живые
  скоупы) · 04 kolesa-lift-gamma-gain (прототип колёс, LGG+CDL) ·
  05 log-krivaya (кривые S-Log3/LogC3/709 по формулам) · 06 kak-rabotaet-iso
  (матрица+Пуассон, Байер+дебайер, ISO на посте) · 07 glubina-rezkosti
  (боке по формуле кружка нерезкости, зона резкости и гиперфокал).
- `instrumenty/` — хаб + smeta-i-schet, modelnyj-reliz, tajming-svadby,
  kalkulyator-karty-pamyati (+karta-db.js), shot-list (план кадров + счётчик
  смены), vyzyvnoj-list (call sheet + расчёт заката и золотого часа),
  kalkulyator-grip (ГРИП: границы резкости, гиперфокал, размытие фона в px),
  chek-list-semki (сборы на смену: набор под тип съёмки, галочки в браузере),
  kalkulyator-nd-filtra (ND: стопы для шаттера 180° и выдержка под фильтром),
  brif-na-semku (анкета клиенту под тип съёмки + текст для мессенджера),
  stavka-frilansera (минимальная ставка за смену: налог, расходы, амортизация),
  kalkulyator-stoimosti-semki (заглушка-редирект, noindex).

## assets/

- `css/`: style.css (сайт), lesson.css (виз-блоки уроков), paper.css (лист
  инструментов), **fonts.css** (СВОИ шрифты вместо Google Fonts — собирается
  скриптом tools/fetch_fonts.py, файлы в assets/fonts/*.woff2).
- `js/`: nav.js (шапка/бургер, deep-регулярка) · analytics.js (Метрика+цели) ·
  main.js (главная) · lesson.js (появление, вайпы, CSS-лаборатории) ·
  scope.js (ДВИЖОК досок: попиксельная обработка + Waveform/Parade/Vector/
  Histogram; расширяем через cfg.process/state/views) · wheels.js (доска
  колёс: LUT-конвейер LGG, ASC CDL, кривая переноса, задания) · logcurve.js
  (доска log-кривых: формулы S-Log3/LogC3/709) · sensor.js (доска ISO:
  колодцы+Пуассон, Байер+дебайер, ISO на посте) · dogovor.js, smeta.js,
  reliz.js, tajming.js, karta.js+karta-db.js, shotlist.js, callsheet.js
  (инструменты) · sun.js (солнце: восход/закат/золотой час по NOAA, §8з) ·
  dof.js + grip.js (ГРИП: формулы §8и и интерфейс калькулятора) · dofboard.js
  (доска урока 07: кружки боке из формулы) ·
  checklist.js (чек-лист сборов) · nd.js + ndcalc.js (ND и экспозиция, §8к) ·
  brief.js (бриф на съёмку) · rate.js (ставка за смену) ·
  docx.js (настоящий .docx: ZIP+OOXML, rubWords/moneyFull; таблица понимает
  data-cols="%,%,…" и класс .text — все колонки влево).
- `img/` — webp-фонд: polya-* (стилы «Поля» — кадры досок), tri-*, hz-*,
  lesson-f* и обложки. `og/` — OG-картинки (tool-*.jpg — карточки инструментов).
- `fonts/` — свои шрифты сайта: *.woff2 (переменные Inter Tight 300–600,
  JetBrains Mono 400–500, Playfair Display 500 italic; подмножества cyrillic
  и latin, всего ~135 КБ) + InterTight-var.ttf для генератора og-карточек.

## tools/ (локальные скрипты, не деплоятся)

build_articles.py, build_services.py, build_og.py, **build_og_tools.py**
(og-карточки инструментов: тёмный фон + мини-лист, шрифт из assets/fonts),
make_favicon.py,
**fetch_fonts.py** (забрать шрифты у Google к себе и пересобрать fonts.css),
prepare_media.py, fullshot.py, daily_stats.py (сводка в ТГ, задача
планировщика PobubnimDailyStats 09:00, токен в ~/.pobubnim/),
**verify_edu_base.py** — самопроверка ВСЕХ числовых якорей EDU_BASE
независимой реализацией формул (прогонять перед публикацией урока
с числами; новый факт = новая проверка),
**audit_site.py** — сквозной статический аудит ВСЕХ страниц (теги по
SEO_RULES, битые локальные ссылки, дубли title/description, покрытие
sitemap, единая версия analytics.js, width/height у картинок, JSON-LD,
иерархия заголовков; код 1 = есть ошибки),
**check_live.py** — живая проверка в headless Chrome (оверфлоу на 375 и
1280 с именем виновника, ошибки консоли, не загрузившиеся картинки,
искажённые пропорции); сервер превью поднимать заранее,
**test_shotlist.py** — приёмка шот-листа на живой странице (пресеты,
нумерация, порядок кадров, счётчик смены, лист, сборка .docx, черновик,
мобила без веб-шрифтов; 32 проверки),
**test_callsheet.py** — приёмка вызывного листа (координаты по городу, свет
против astral, предупреждения, строки локаций и группы, .docx, черновик),
**verify_sun.py** — сверка assets/js/sun.js с библиотекой astral на 7 городах
и 6 датах (допуск 2 мин; прогонять после любой правки формул),
**test_dof.py** и **verify_dof.py** — приёмка калькулятора ГРИП и сверка его
формул с независимой численной моделью оптики,
**test_dofboard.py** — приёмка доски урока 07 (кружки сверяются с расчётом),
**test_checklist.py** — приёмка чек-листа сборов,
**test_nd.py** — приёмка ND-калькулятора с независимым пересчётом стопов,
**test_brief.py** — приёмка брифа на съёмку,
**test_rate.py** — приёмка калькулятора ставки (обратный счёт до дохода).

## Ритуалы

- Каждая страница — по закону SEO_RULES.md; факты — только из EDU_BASE
  (нет в базе → сверить по EDU_SOURCES → внести → потом публиковать).
- После правок: `python tools/audit_site.py` (должно быть 0 ошибок) +
  превью (preview pobubnim, порт 8765) и `python tools/check_live.py`
  (десктоп+мобила 375), коммит+push, sitemap при новых URL, IndexNow-пинг,
  журнал SEO_RULES, переиндексация графа при крупных правках кода.
