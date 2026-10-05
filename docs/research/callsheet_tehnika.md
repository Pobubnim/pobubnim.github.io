# Вызывной лист: бессерверная техника (разведка)

Пометки: [прочитано] — открыл страницу; [выдача] — сниппет поиска; [знание] — из памяти без источника.
Использовано ~21 вызова из 35. Не проверено прямо: Яндекс-страница параметров (404), FAQ WhatsApp (обрезан), Яндекс Календарь/Apple Calendar, 2ГИС-веб.

## 1. Open-Meteo Forecast API
- Адрес: `https://api.open-meteo.com/v1/forecast` [прочитано] https://open-meteo.com/en/docs
- Пример запроса [знание, параметры подтверждены докой]:
  `?latitude=55.75&longitude=37.62&hourly=temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m,cloud_cover,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=auto&start_date=2026-10-10&end_date=2026-10-10&wind_speed_unit=ms`
- Часовые переменные в доке: temperature_2m, precipitation, precipitation_probability, wind 10/80/120/180 м, cloud_cover (+low/mid/high), weather_code [прочитано]. Названия `wind_speed_10m`, `cloud_cover` — [знание] (в новой версии; старое `windspeed_10m`, `cloudcover`). Проверить в живом ответе.
- Дневные: min/max/mean температуры, precipitation_sum, precipitation_probability_max, wind speed/gust max, weather_code («самое тяжёлое за день») [прочитано].
- Горизонт: до 16 дней, `forecast_days` по умолчанию 7 [прочитано]. Точные даты: `start_date`/`end_date` (YYYY-MM-DD) [знание]. Вероятность осадков за дальний горизонт ненадёжна [знание].
- `timezone`: любое имя IANA или `auto` (по координатам) [прочитано]. Без него время в GMT. Время в ответе — локальная строка без смещения ("2026-10-10T14:00") [знание].
- Единицы: `wind_speed_unit=ms` (по умолчанию km/h) [знание].
- CORS: «API поддерживает cross-origin» [прочитано] (формулировка саммари; fetch из браузера используется повсеместно [знание]).
- Условия: бесплатно только некоммерческое, <10 000 запросов/день, 5 000/час, 600/мин, лицензия данных CC-BY 4.0, нужна атрибуция «Open-Meteo»; коммерческое — платный ключ и другой хост `customer-api` [прочитано] https://open-meteo.com/en/terms . Блокировка за злоупотребление без предупреждения.
- РИСК: сайт Pobubnim бесплатный, без рекламы — подпадает под некоммерческое, но если сайт продаёт услуги/ведёт на услуги видеографа, граница размыта. Лимиты считаются по IP посетителя (запросы из браузера), общий лимит не страшен. Решение по трактовке — за владельцем.
- Атрибуция: ссылка «Weather data by Open-Meteo.com» рядом с прогнозом [знание формулировки; требование CC-BY прочитано].
- WMO weather_code (Open-Meteo) [выдача, полностью совпадает со знанием]: 0 ясно; 1 преим. ясно; 2 переменная облачность; 3 пасмурно; 45 туман; 48 изморозь-туман; 51/53/55 морось слабая/умеренная/сильная; 56/57 ледяная морось; 61/63/65 дождь слабый/умеренный/сильный; 66/67 ледяной дождь; 71/73/75 снег слабый/умеренный/сильный; 77 снежные зёрна; 80/81/82 ливень слабый/умеренный/сильный; 85/86 снегопад слабый/сильный; 95 гроза; 96/99 гроза с градом слабым/сильным. https://open-meteo.com/en/docs

## 2. Open-Meteo Geocoding API
- Адрес: `https://geocoding-api.open-meteo.com/v1/search?name=Казань&count=5&language=ru&format=json` [прочитано]
- Параметры: name (обяз., можно «город, регион»), count (по умолч. 10, макс. 100), language (по умолч. en), format, countryCode (ISO alpha-2, напр. RU), apikey (коммерч.) [прочитано] https://open-meteo.com/en/docs/geocoding-api
- В ответе `results[]`: id, name, latitude, longitude, elevation, timezone, feature_code, country_code, country, admin1–admin4, population, postcodes [прочитано; имена полей country/admin1 — [знание]]. Если ничего не найдено — ключа `results` нет вовсе [знание].
- Поиск: 2 символа — точное совпадение, ≥3 — префиксный, без учёта регистра и диакритики [прочитано].
- Лимиты — те же условия, что у Forecast [выдача/знание]. Геокодер ищет города/населённые пункты, НЕ адреса и улицы [знание] — для точки съёмки по адресу нужен другой источник (Nominatim ограничен 1 запрос/сек и требует атрибуции — [знание], не проверено). Практичный ход: прогноз по городу из поля «город», либо координаты вручную/из ссылки карты.

## 3. Ссылки на карты
Яндекс Карты (официальная страница доки вернула 404; формулы из блога Яндекса и выдачи):
- Поиск по адресу: `https://yandex.ru/maps/?text=<urlencoded>` [выдача: text — поисковый запрос] 
- Маршрут: `https://yandex.ru/maps/?rtext=<lat>,<lon>~<lat>,<lon>&rtt=auto` [прочитано пример `?rtext=~55.733836%2C37.588134` — пустое начало = «моё местоположение»; https://yandex.ru/blog/mapsapi/kak-sformirovat-ssylku-na-yandeks-karty]. Порядок в rtext — ШИРОТА,долгота. `rtt`: auto (авто), mt (транспорт), pd (пешком), bc (вело) [выдача: auto, mt; pd, bc — знание]. Точки можно задавать и адресом-текстом [знание, не проверено].
- Метка/центр: `ll=<lon>,<lat>` (ДОЛГОТА первой), `z=<0..21>`, `pt=<lon>,<lat>[,стиль]` [выдача; порядок lon,lat — знание]. Пример: `https://yandex.ru/maps/?ll=37.62,55.75&z=16&pt=37.62,55.75,pm2rdm` [знание].
- ЛОВУШКА: в rtext широта первой, в ll/pt долгота первой [знание].
2ГИС:
- Веб-поиск `https://2gis.ru/search/<urlencoded>` [знание, не подтверждено]; веб-маршрут/карточка по координатам `https://2gis.ru/?m=<lon>,<lat>/<zoom>` [знание, не подтверждено].
- Приложение (deeplink): `dgis://2gis.ru/routeSearch/rsType/<car|ctx|pedestrian|taxi>/from/<lon>,<lat>/to/<lon>,<lat>`; без from — от текущей позиции [выдача] https://help.2gis.com/question/developers-launching-2gis-navigation-using-deeplink . Порядок lon,lat.
Google Maps [прочитано] https://developers.google.com/maps/documentation/urls/get-started :
- Поиск: `https://www.google.com/maps/search/?api=1&query=<адрес или lat,lon>` (api=1 и query обязательны).
- Маршрут: `https://www.google.com/maps/dir/?api=1&origin=..&destination=..&travelmode=driving|walking|bicycling|two-wheeler|transit&waypoints=a|b` (pipe = %7C). Кодировать запятые %2C. Лимит URL 2048 символов; waypoints до 3 в мобильных браузерах, до 9 иначе.
- Строят маршрут: Google — /dir/ с destination; Яндекс — rtext с «~».

## 4. Мессенджеры
- WhatsApp: `https://wa.me/<номер>?text=<urlencoded>`; номер в международном формате ТОЛЬКО цифрами, без +, пробелов, скобок и ведущих нулей (РФ: 79161234567, не 89161234567 — 8 заменить на 7) [выдача: несколько гайдов; страница FAQ WhatsApp не открылась]. Перенос строки = %0A, пробел = %20 [выдача]. Максимальная длина text официально не найдена; практический потолок — длина URL браузера [знание, не подтверждено].
- Telegram share [прочитано] https://core.telegram.org/api/links : `https://t.me/share/url?url=<url>&text=<text>`; `url` ОБЯЗАТЕЛЕН, `text` необязателен; также `t.me/share?url=`, `tg://msg_url?url=&text=`. Открывается выбор чата; url ставится в начало текста, затем перевод строки и text. Без url ссылка не работает => для передачи только текста подставлять url=адрес листа или пробел-заглушку [знание, проверить]. Личного адресата указать нельзя (только диалог выбора). Для личного номера: `https://t.me/<username>` без текста; по номеру телефона предзаполненный текст через t.me недоступен [знание].
- `sms:<номер>?body=<text>` — на Android `?body=`, на iOS исторически `&body=` или `sms:<номер>&body=`; на ПК не работает без сопряжённого телефона [знание, не проверено].
- `mailto:<адрес>?subject=<enc>&body=<enc>` — перенос %0D%0A; работает везде, где настроена почтовая программа; на ПК часто нет клиента [знание, не проверено].
- ПК/телефон: wa.me на ПК открывает WhatsApp Web/десктоп [знание]; t.me/share — веб-страница с выбором чата, работает везде [знание].

## 5. iCalendar (.ics)
Подтверждено RFC 5545 [прочитано] https://datatracker.ietf.org/doc/html/rfc5545 :
- Обязательные в VEVENT: UID, DTSTAMP, DTSTART. VALARM: ACTION, TRIGGER (для DISPLAY ещё DESCRIPTION [знание]).
- Время: плавающее `19980118T230000` (без TZID и Z — «локальное, привязано к зрителю»); UTC с `Z`; `DTSTART;TZID=Europe/Moscow:20261010T090000`.
- Строки не длиннее 75 октетов (байт UTF-8, не символов!), складывание: CRLF + пробел. Конец строки CRLF. Кириллица 2 байта/символ — резать не посередине символа [знание].
- Экранирование TEXT: `\\`, `\;`, `\,`, перенос → `\n` [знание RFC 3.3.11; в саммари не детализировано].
Минимальный файл [знание, собрано из RFC]:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//pobubnim.ru//callsheet//RU
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:<uuid>@pobubnim.ru
DTSTAMP:20261005T120000Z
DTSTART:20261010T090000
DTEND:20261010T210000
SUMMARY:Съёмка: проект
LOCATION:адрес
DESCRIPTION:строка1\nстрока2
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Сбор через 1 час
TRIGGER:-PT1H
END:VALARM
END:VEVENT
END:VCALENDAR
```
- Для Google Calendar: нужны BEGIN:VCALENDAR, VERSION:2.0, PRODID; частые причины отказа — их отсутствие и сломанная складка; лимит импорта 1 МБ [выдача] https://support.google.com/calendar/answer/37118 .
- Что выбрать: плавающее время удобно для «съёмка в 9:00 по месту», но у участников в другом поясе сдвинется не будет (покажет 9:00 у них) — для групп в одном городе плюс. TZID без блока VTIMEZONE: Google понимает IANA-имена, Apple обычно тоже, но строго по RFC нужен VTIMEZONE [знание, не проверено]. Надёжнее: UTC (пересчёт из пояса города) или плавающее. Яндекс Календарь и Apple — отдельно НЕ проверено.
- Отдача файла из браузера: `Blob` типа `text/calendar;charset=utf-8` + `<a download="x.ics">` [знание].

## 6. Web Share API
- `navigator.share({title,text,url,files})`; нужен HTTPS, жест пользователя (transient activation), хотя бы одно свойство; ошибки NotAllowedError, TypeError, AbortError (отмена пользователем — не ошибка), DataError. Перед отправкой файлов — `navigator.canShare({files})` [прочитано] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- Поддержка [прочитано caniuse; цифры версий в саммари выглядят странно, перепроверить]: Chrome Android — да; Safari iOS 12.2+ — да; Safari macOS 12.1+; Edge 95+; Chrome desktop полная с 128 (раньше частичная, Windows/ChromeOS); Firefox desktop — НЕТ; Firefox Android — да (в данных новая версия). Яндекс.Браузер не указан (на Chromium — вероятно как Chrome [знание]).
- Файлы: разрешённые типы — изображения, аудио, видео, pdf, txt, csv, html [прочитано]. .docx и .ics в разрешённый список MDN НЕ входят: на практике `.docx` Chrome Android принимает с MIME, но гарантий нет [знание] — всегда `canShare` с запасным вариантом (скачивание).
- Вывод: делать кнопку «Поделиться» только если `navigator.share` есть; иначе остаются копия/ссылка/t.me/wa.me.

## 7. QR без библиотек
- Ссылка ≤150 символов, режим Byte (ASCII URL): уровень L (7%) — версия 6 (емкость 134 байта L? ) — ТОЧНО: ёмкость byte-mode для L: v5=106, v6=134, v7=154; для M: v6=106, v7=122, v8=152; для Q: v8=108, v9=132, v10=154 [знание, таблица из стандарта, не перепроверено в этой сессии]. Итого 150 символов: L → версия 7 (45x45), M → версия 8 (49x49). Для экрана и печати рекомендован M.
- Написать с нуля: Reed-Solomon над GF(256) + маски + форматные биты + размещение — порядка 150–250 строк JS [знание].
- Готовые MIT:
  - kazuhikoarase/qrcode-generator, MIT, 2.4k звёзд, JS-версия — файл qrcode.js (≈20–25 КБ неминифиц., [знание размера]) https://github.com/kazuhikoarase/qrcode-generator [прочитано лицензия]; API `qrcode(0,'M'); qr.addData(s); qr.make(); qr.createSvgTag()` [знание]. UTF-8 для кириллицы нужен отдельный режим — для URL ASCII не надо.
  - paulmillr/qr, Apache-2.0 ИЛИ MIT, SVG-кодер 5.4 КБ gzip, авто-подбор версии, 4 уровня коррекции, `encodeQR(text,'svg')` [прочитано] https://github.com/paulmillr/qr — ES-модуль, потребует сборки/копирования файла.
  - qrtiny (danielgjackson) — только версия 1 (мало), qr-code-generator-lib «<3 КБ, MIT» [выдача, не проверено], nimiq/qr-creator 12.2 КБ мин. [выдача]. Nayuki QR-Code-generator (MIT, ~1000 строк) — [знание, не открывал].
- Ограничение раздела «чистый JS без библиотек»: вставка одного файла MIT-кода — компромисс, решение за владельцем.

## 8. Печать
- `@page { size: A4; margin: 12mm; }`; `size: A4 landscape` для альбомной [прочитано] https://developer.mozilla.org/en-US/docs/Web/CSS/@page ; Baseline с декабря 2024.
- Разрывы: `break-inside: avoid` (старое `page-break-inside: avoid`) на строках таблицы и карточках; `break-after: page` / `break-before: page` для принудительных [прочитано].
- Таблицы [знание, не проверено в сессии]: `thead { display: table-header-group }` повторяет шапку на каждой странице; `tr { break-inside: avoid }`; `-webkit-print-color-adjust: exact; print-color-adjust: exact` чтобы фон/цвета ролей не пропадали; скрывать интерфейс через `@media print`. Поля у @page в Safari поддерживаются частично, размер страницы пользователь может перебить в диалоге печати [знание].

## Не найдено / не проверено
- Официальная страница параметров Яндекс Карт (404), FAQ WhatsApp про лимит длины text.
- sms: на iOS/Android различия, mailto на ПК — только знание.
- Календари Яндекс/Apple: требования не найдены.
- 2ГИС веб-ссылки: формулы не подтверждены.
- Таблица ёмкости QR — из памяти.
