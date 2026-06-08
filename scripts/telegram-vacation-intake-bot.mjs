#!/usr/bin/env node

import fs from 'node:fs';

const TELEGRAM_BOT_TOKEN = process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || '';
const API_BASE = (process.env.TIMESYNCHER_API_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
const INTAKE_TOKEN = process.env.TIMESYNCHER_INTAKE_TOKEN || '';
const OPENAI_API_KEY = process.env.TIMESYNCHER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const STT_MODEL = process.env.TIMESYNCHER_STT_MODEL || 'whisper-1';
const OFFSET_FILE = process.env.TIMESYNCHER_TELEGRAM_OFFSET_FILE || './telegram-vacation.offset';
const POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_POLL_TIMEOUT_SECONDS || '30', 10);
const FETCH_RETRY_ATTEMPTS = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_ATTEMPTS || '3', 10));
const FETCH_RETRY_BASE_MS = Math.max(50, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_BASE_MS || '600', 10));
const DELAYED_RETRY_MS = Math.max(1000, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_DELAYED_RETRY_MS || '60000', 10));

function requireEnv() {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TIMESYNCHER_TELEGRAM_BOT_TOKEN is required.');
}

function cleanText(value, max = 12000) {
  return String(value || '').trim().slice(0, max);
}

function displayName(user = {}) {
  return cleanText(
    [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `telegram:${user.id}`,
    160,
  );
}

function readOffset() {
  try {
    const value = Number.parseInt(fs.readFileSync(OFFSET_FILE, 'utf8'), 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeOffset(offset) {
  fs.writeFileSync(OFFSET_FILE, `${offset}\n`, { mode: 0o600 });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options, label) {
  const response = await fetchWithRetry(url, options, label);
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function fetchWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === FETCH_RETRY_ATTEMPTS) return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRY_ATTEMPTS) throw error;
    }
    const delayMs = FETCH_RETRY_BASE_MS * attempt;
    console.error(`[${new Date().toISOString()}] ${label} attempt ${attempt} failed: ${lastError.message}; retrying in ${delayMs}ms`);
    await sleep(delayMs);
  }
  throw lastError || new Error(`${label} failed`);
}

async function telegram(method, body = {}) {
  const { response, json } = await fetchJsonWithRetry(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, `Telegram ${method}`);
  if (!response.ok || !json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result;
}

async function sendMessage(chatId, text, replyToMessageId) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    disable_web_page_preview: true,
  });
}

async function transcribeVoiceMessage(message) {
  if (!OPENAI_API_KEY) throw new Error('Voice transcription is not configured yet.');
  const voice = message.voice;
  if (!voice?.file_id) throw new Error('Voice message did not include a Telegram file id.');
  const file = await telegram('getFile', { file_id: voice.file_id });
  if (!file?.file_path) throw new Error('Telegram did not return a voice file path.');

  const audioResponse = await fetchWithRetry(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    {},
    'Telegram voice download',
  );
  if (!audioResponse.ok) throw new Error(`Telegram voice download ${audioResponse.status}`);

  const audio = new Blob([await audioResponse.arrayBuffer()], { type: voice.mime_type || 'audio/ogg' });
  const form = new FormData();
  form.append('model', STT_MODEL);
  form.append('file', audio, `telegram-voice-${message.message_id || Date.now()}.ogg`);

  const response = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  }, 'OpenAI voice transcription');
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI voice transcription ${response.status}`);
  const text = cleanText(json.text, 12000);
  if (!text) throw new Error('Voice transcription returned empty text.');
  return text;
}

async function recordTelegramTurn(message, { textOverride = '', payload = {} } = {}) {
  const from = message.from || {};
  const chat = message.chat || {};
  const text = cleanText(textOverride || message.text || message.caption);
  const startMatch = /^\/start(?:\s+(.+))?/i.exec(text);
  const { response, json } = await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'message',
      onboardingToken: startMatch ? cleanText(startMatch[1], 160) : '',
      telegramChatId: String(chat.id || ''),
      telegramUserId: from.id ? String(from.id) : '',
      telegramMessageId: message.message_id ? String(message.message_id) : '',
      receivedAt: new Date((message.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      text,
      user: {
        id: from.id ? String(from.id) : '',
        firstName: cleanText(from.first_name, 80) || null,
        lastName: cleanText(from.last_name, 80) || null,
        username: from.username || null,
        languageCode: from.language_code || null,
      },
      message: {
        chatId: String(chat.id || ''),
        chatType: chat.type || '',
        messageId: message.message_id ? String(message.message_id) : '',
        text,
      },
      payload: {
        ...payload,
        telegramChatId: String(chat.id || ''),
        telegramChatType: chat.type || '',
        telegramMessageId: message.message_id || null,
        telegramUserId: from.id ? String(from.id) : null,
        telegramUsername: from.username || null,
        sourceBot: 'TimeSyncherVacationBot',
      },
    }),
  }, 'Vacation Telegram API');
  if (!response.ok || json.ok === false) throw new Error(json.error || `Vacation Telegram API ${response.status}`);
  return json;
}

async function recordDelivery({ transcriptId, telegramMessageId }) {
  if (!transcriptId) return;
  await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'delivery',
      transcriptId,
      telegramMessageId: telegramMessageId ? String(telegramMessageId) : '',
      sentAt: new Date().toISOString(),
    }),
  }, 'Vacation Telegram delivery API').catch(() => {});
}

async function recordBotError({ message = {}, updateId, stage, error }) {
  const from = message.from || {};
  const chat = message.chat || {};
  const errorMessage = cleanText(error?.message || error, 1000);
  if (!chat.id && !errorMessage) return;
  await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      event: 'bot_error',
      stage: cleanText(stage, 120),
      error: errorMessage,
      failedAt: new Date().toISOString(),
      updateId: updateId ? String(updateId) : '',
      telegramChatId: chat.id ? String(chat.id) : '',
      telegramUserId: from.id ? String(from.id) : '',
      telegramMessageId: message.message_id ? String(message.message_id) : '',
      retryPolicy: {
        fetchRetryAttempts: FETCH_RETRY_ATTEMPTS,
        fetchRetryBaseMs: FETCH_RETRY_BASE_MS,
        delayedRetryMs: DELAYED_RETRY_MS,
      },
      user: {
        id: from.id ? String(from.id) : '',
        firstName: cleanText(from.first_name, 80) || null,
        lastName: cleanText(from.last_name, 80) || null,
        username: from.username || null,
      },
      message: {
        chatId: chat.id ? String(chat.id) : '',
        chatType: chat.type || '',
        messageId: message.message_id ? String(message.message_id) : '',
        text: cleanText(message.text || message.caption, 500),
      },
      details: {
        sourceBot: 'TimeSyncherVacationBot',
      },
    }),
  }, 'Vacation Telegram bot error API').catch((logError) => {
    console.error(`[${new Date().toISOString()}] could not record bot error: ${logError.message}`);
  });
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;
  let text = cleanText(message.text || message.caption);
  let payload = {};
  if (!chatId) return;

  if (!text && message.voice) {
    await telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    text = await transcribeVoiceMessage(message);
    payload = {
      telegramVoice: {
        duration: message.voice.duration || null,
        fileId: message.voice.file_id || null,
        fileUniqueId: message.voice.file_unique_id || null,
        fileSize: message.voice.file_size || null,
        mimeType: message.voice.mime_type || null,
        transcriptionModel: STT_MODEL,
      },
      transcribedFromVoice: true,
    };
  }

  if (!text) {
    await sendMessage(chatId, 'Send me the trip, dates, people, budget, or what you want planned, and I will start the vacation workspace.', messageId);
    return;
  }

  let turn;
  try {
    turn = await recordTelegramTurn(message, { textOverride: text, payload });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] record turn failed for message ${messageId}: ${error.message}; delayed retry in ${DELAYED_RETRY_MS}ms`);
    await sleep(DELAYED_RETRY_MS);
    turn = await recordTelegramTurn(message, { textOverride: text, payload });
  }

  const reply = turn.reply || [
    'I am processing the information you sent and setting up your TimeSyncher Vacation.',
    '',
    'Expect an initial vacation itinerary in about 10-20 minutes. You can keep sending updates here while I work on it.',
  ].join('\n');
  let sent;
  try {
    sent = await sendMessage(chatId, reply, messageId);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] send reply failed for message ${messageId}: ${error.message}; delayed retry in ${DELAYED_RETRY_MS}ms`);
    await sleep(DELAYED_RETRY_MS);
    sent = await sendMessage(chatId, reply, messageId);
  }
  await recordDelivery({ transcriptId: turn.outboundTranscriptId, telegramMessageId: sent?.message_id });
}

async function pollOnce() {
  const offset = readOffset();
  const updates = await telegram('getUpdates', {
    offset: offset ? offset + 1 : undefined,
    timeout: POLL_TIMEOUT_SECONDS,
    allowed_updates: ['message'],
  });

  for (const update of updates) {
    try {
      if (update.message) await handleMessage(update.message);
    } catch (error) {
      const chatId = update.message?.chat?.id;
      await recordBotError({
        message: update.message,
        updateId: update.update_id,
        stage: 'update_delivery',
        error,
      });
      if (chatId) {
        await sendMessage(chatId, `I received that, but could not queue it yet: ${cleanText(error.message, 300)}`, update.message?.message_id);
      }
      console.error(`[${new Date().toISOString()}] update ${update.update_id} failed: ${error.message}`);
    } finally {
      writeOffset(update.update_id);
    }
  }
}

async function main() {
  requireEnv();
  await telegram('deleteWebhook', { drop_pending_updates: false });
  const me = await telegram('getMe');
  console.log(`[${new Date().toISOString()}] TimeSyncher Vacation Telegram intake started as @${me.username}`);
  for (;;) {
    await pollOnce().catch((error) => {
      console.error(`[${new Date().toISOString()}] poll failed: ${error.message}`);
    });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
