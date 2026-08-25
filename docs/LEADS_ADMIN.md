# ЗАЯВКИ И АДМИНКА (заведено 25.08.2026)

Форма на сайте пишет заявки в базу и мгновенно уведомляет владельца.
Админ-панель — `admin.html` (в навигации не светится, noindex + robots
Disallow). Вход по ключу, ключ хранится в браузере владельца.

## Архитектура (без своего сервера)

- Хранилище: Supabase проекта МОНОЛИТ (`jkdrnaagjplpyhlsmxii`), таблица
  `site_leads` + секреты в `site_secrets` (RLS, наружу не читаются).
- API: Postgres RPC через PostgREST (`/rest/v1/rpc/site_lead_*`), сайт зовёт
  с ПУБЛИЧНЫМ anon-ключом (он в JS — это норма Supabase, защита в RLS):
  - `site_lead_create(p)` — приём формы: honeypot-поле `website`, contact
    обязателен, потолок 50 заявок/день;
  - `site_lead_list(p_key, p_status)` / `site_lead_update(p_key, p_id,
    p_status, p_note)` — только с ключом админки (сверка в базе).
- Уведомления из БД: pg_net (асинхронный HTTP) → Telegram-бот МОНОЛИТА в
  личку владельца. Ошибка уведомления заявку НЕ роняет.
- Миграции и откаты: `monolith_assistant/supabase/migrations/0021–0023` +
  `rollbacks/`. Секреты заливает `monolith_assistant/scripts/site_leads_admin.py seed`
  (admin_key из `supabase/.siteadminkey.local`, токен бота из
  `scripts/telegram_config.local.json`).
- Edge Function НЕ используется: access token Supabase CLI протух 25.08.2026,
  деплой функций недоступен, RPC-путь равноценен. Свежий токен (dashboard →
  Account → Tokens → в `supabase/.accesstoken.local`) нужен только для
  будущих edge-задач.

## Каналы уведомлений

| Канал | Статус | Что нужно для включения |
|---|---|---|
| Telegram (личка владельца) | РАБОТАЕТ | — |
| Админка на сайте | РАБОТАЕТ | ключ (у владельца) |
| ВКонтакте | спит | ключ сообщества ВК с правами «сообщения» → `site_secrets.vk_token` + user id владельца → `vk_peer` (через `site_leads_admin.py` или напрямую); код уже в 0023 |
| Почта hazzy2535@gmail.com | спит | пароль приложения Gmail → `monolith_assistant/scripts/lead_mail_config.local.json` `{"user": "...", "app_password": "..."}`; задача планировщика «MONOLITH lead mail» (каждые 10 мин) уже стоит и молчит без конфига |

Получасовые отчёты «MONOLITH status» в TG ОТКЛЮЧЕНЫ 25.08.2026 по просьбе
владельца (заявки тонули в потоке). Вернуть: `Enable-ScheduledTask 'MONOLITH status'`.

## Смена ключа админки

1. Новый ключ → `monolith_assistant/supabase/.siteadminkey.local`.
2. `python monolith_assistant/scripts/site_leads_admin.py seed`.
3. Владельцу — новый ключ, старый перестаёт работать сразу.

## Просмотр заявок без браузера

`python monolith_assistant/scripts/site_leads_admin.py list` — последние 20.

## Откат всего контура

`rollbacks/0023 → 0022 → 0021` (или только 0023, чтобы убрать ВК-дубль).
Форма при недоступном бэкенде сама падает в старый деплинк Telegram — сайт
не ломается.
