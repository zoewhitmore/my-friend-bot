## Telegram ↔ OpenAI Webhook на Cloudflare Workers

Этот проект — серверлесс-функция (Cloudflare Workers), которая принимает вебхук от Telegram бота, пересылает текст в OpenAI API и отправляет ответ пользователю.

### Как это работает
- Telegram отправляет апдейты (сообщения) на маршрут `/webhook` вашего воркера
- Воркер вызывает OpenAI Chat Completions и возвращает ответ в чат через `sendMessage`
 - История чата: по умолчанию хранится в памяти воркера (на изоляторе) и сохраняет последние 5 сообщений. Для устойчивого хранения можно подключить Cloudflare KV (рекомендуется).

### Развёртывание
Автодеплой настроен через GitHub Actions: пуш в ветку `main` = деплой на Cloudflare Workers.

#### 1) Подготовка в Cloudflare
1. Создайте аккаунт на Cloudflare и получите `Account ID` (в Dashboard → Workers & Pages → Overview).
2. Создайте API Token с правами `Workers Scripts:Edit`, `Workers KV Storage:Edit` (если нужно) — проще выбрать шаблон `Edit Cloudflare Workers`.
   - Это будет `CLOUDFLARE_API_TOKEN`.

#### 2) Секреты репозитория GitHub
Задайте в GitHub → Settings → Secrets and variables → Actions → New repository secret:

- `CLOUDFLARE_API_TOKEN` — токен из шага выше
- `CLOUDFLARE_ACCOUNT_ID` — ваш Account ID
- `TELEGRAM_BOT_TOKEN` — токен бота из `@BotFather`
- `OPENAI_API_KEY` — ключ OpenAI (`https://platform.openai.com` → API keys)

Опционально:
- `TELEGRAM_WEBHOOK_SECRET` — секрет для проверки заголовка `x-telegram-bot-api-secret-token`
- `OPENAI_MODEL` — модель, по умолчанию `gpt-4o-mini`
- `SYSTEM_PROMPT` — системная инструкция ассистенту
- `OPENAI_BASE_URL` — базовый URL OpenAI API (если используете совместимый провайдер)
- `TELEGRAM_API_BASE` — базовый URL Telegram API (по умолчанию `https://api.telegram.org`)

#### 2.1) KV для истории — создаётся автоматически
Workflow сам найдёт или создаст KV namespace с заголовком `telegram-openai-worker-HISTORY`, сгенерирует временный `wrangler.generated.toml` с привязкой `[[kv_namespaces]] binding = "HISTORY"`, и выполнит деплой с этим конфигом. Ничего вручную делать не нужно.

#### 3) Настройка вебхука в Telegram
После первого деплоя получите URL воркера в Cloudflare Dashboard или из лога job. Пример: `https://telegram-openai-worker.username.workers.dev`

Далее установите вебхук:

```bash
curl -X POST \
  "https://api.telegram.org/bot8346690670:AAGPGlYefnbh8Wedkeq7LtLZTz1GOm6G88w/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://telegram-openai-worker.zoewhitmoree.workers.dev/webhook",
  }'
```

Где `<ВАШ_ДОМЕН>` — домен воркера или ваш кастомный домен, привязанный к воркеру.

#### 4) Локальный запуск (по желанию)
```bash
npm install
npx wrangler dev
```
В локальном режиме можно тестировать GET `/` и POST `/webhook` (шлите JSON апдейта как от Telegram).

### Маршруты
- `GET /` — health-check
- `POST /webhook` — точка приема апдейтов от Telegram

### Проверка подписи вебхука (секрет)
Если установлен секрет `TELEGRAM_WEBHOOK_SECRET`, воркер проверяет заголовок `x-telegram-bot-api-secret-token` на совпадение. Если не совпадает — 401.

### Замечания по лимитам и ошибкам
- В случае ошибки обращения к OpenAI воркер вернёт пользователю краткое сообщение об ошибке и залогирует детали.
 - Память изолята не гарантирована при масштабировании/рестартах. С KV история станет устойчивой (но с eventual consistency), с Durable Objects — строго последовательной (можно добавить по запросу).

### Стек
- Cloudflare Workers
- TypeScript
- OpenAI Chat Completions API
- Telegram Bot API (`sendMessage`)


