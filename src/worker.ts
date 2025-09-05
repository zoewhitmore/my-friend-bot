export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  SYSTEM_PROMPT?: string;
  OPENAI_BASE_URL?: string; // по умолчанию https://api.openai.com/v1
  TELEGRAM_API_BASE?: string; // по умолчанию https://api.telegram.org
  TELEGRAM_WEBHOOK_SECRET?: string; // опциональная проверка подписи вебхука
}

type TelegramChat = { id: number };
type TelegramMessage = { message_id: number; chat: TelegramChat; text?: string };
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
};

async function sendTelegramMessage(chatId: number, text: string, env: Env): Promise<void> {
  const base = env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const url = `${base}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function generateReplyFromOpenAI(userText: string, env: Env): Promise<string> {
  const base = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = env.OPENAI_MODEL || "gpt-4o-mini";

  const systemPrompt = env.SYSTEM_PROMPT || "Ты дружелюбный помощник. Отвечай кратко и по делу на русском языке.";

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ],
      temperature: 0.7
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI request failed: ${resp.status} ${resp.statusText} ${text}`);
  }
  const data = await resp.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    return "Извините, я не смог сформировать ответ.";
  }
  return content;
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg || !msg.chat?.id) {
    return;
  }
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text) {
    await sendTelegramMessage(chatId, "Пока поддерживаются только текстовые сообщения.", env);
    return;
  }

  try {
    const reply = await generateReplyFromOpenAI(text, env);
    await sendTelegramMessage(chatId, reply, env);
  } catch (err) {
    console.error("Error while processing update:", err);
    await sendTelegramMessage(chatId, "Произошла ошибка при обработке запроса. Попробуйте позже.", env);
  }
}

type CfExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };

export default {
  async fetch(request: Request, env: Env, ctx: CfExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Telegram ↔ OpenAI worker is running", { status: 200 });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const token = request.headers.get("x-telegram-bot-api-secret-token");
        if (token !== env.TELEGRAM_WEBHOOK_SECRET) {
          return new Response("unauthorized", { status: 401 });
        }
      }

      let update: TelegramUpdate | undefined;
      try {
        update = (await request.json()) as TelegramUpdate;
      } catch {
        return new Response("bad request", { status: 400 });
      }

      ctx.waitUntil(handleUpdate(update, env));
      return new Response("ok", { status: 200 });
    }

    return new Response("not found", { status: 404 });
  }
};


