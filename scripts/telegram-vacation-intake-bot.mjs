#!/usr/bin/env node

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TELEGRAM_BOT_TOKEN = process.env.TIMESYNCHER_TELEGRAM_BOT_TOKEN || '';
const API_BASE = (process.env.TIMESYNCHER_API_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
const INTAKE_TOKEN = process.env.TIMESYNCHER_INTAKE_TOKEN || '';
const OPENAI_API_KEY = process.env.TIMESYNCHER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const STT_MODEL = process.env.TIMESYNCHER_STT_MODEL || 'whisper-1';
const OFFSET_FILE = process.env.TIMESYNCHER_TELEGRAM_OFFSET_FILE || './telegram-vacation.offset';
const INGRESS_CACHE_DIR = process.env.TIMESYNCHER_TELEGRAM_INGRESS_CACHE_DIR || './telegram-ingress-cache';
const INGRESS_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_INGRESS_RETENTION_DAYS || '30', 10));
const POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_POLL_TIMEOUT_SECONDS || '30', 10);
const FETCH_RETRY_ATTEMPTS = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_ATTEMPTS || '3', 10));
const FETCH_RETRY_BASE_MS = Math.max(50, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_FETCH_RETRY_BASE_MS || '600', 10));
const DELAYED_RETRY_MS = Math.max(1000, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_DELAYED_RETRY_MS || '60000', 10));
const WORKER_DRAIN_SERVICE = process.env.TIMESYNCHER_WORKER_DRAIN_SERVICE || 'timesyncher-vacation-worker-drain.service';
const TELEGRAM_MEDIA_MAX_BYTES = Math.max(1, Number.parseInt(process.env.TIMESYNCHER_TELEGRAM_MEDIA_MAX_BYTES || '20971520', 10));

function requireEnv() {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TIMESYNCHER_TELEGRAM_BOT_TOKEN is required.');
}

function cleanText(value, max = 12000) {
  return String(value || '').trim().slice(0, max);
}

function isWebsiteLinkRequest(value = '') {
  const normalized = cleanText(value, 1000).toLowerCase();
  if (!normalized) return false;
  const asksForLink = /\b(send|share|show|give|need|where|what|open)\b/.test(normalized) || /\?/.test(normalized);
  const mentionsWebsite = /\b(website|web site|site|link|url)\b/.test(normalized);
  const mentionsTrip = /\b(caldwell|vacation|trip|itinerary)\b/.test(normalized);
  return asksForLink && mentionsWebsite && mentionsTrip;
}

function isGenericQueuedAcknowledgement(value = '') {
  const normalized = cleanText(value, 2000).toLowerCase();
  return (
    normalized.includes('turning the information you sent into a hosted timesyncher vacation itinerary') ||
    normalized.includes('will send the itinerary link when the first pass is ready') ||
    normalized.includes('processing the information you sent and setting up your timesyncher vacation')
  );
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function safePathPart(value, fallback = 'unknown') {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function updateCacheDir(update) {
  const message = update.message || {};
  const receivedAt = new Date((message.date || Math.floor(Date.now() / 1000)) * 1000);
  const datePart = receivedAt.toISOString().slice(0, 10);
  const updatePart = safePathPart(update.update_id, 'no-update-id');
  const messagePart = safePathPart(message.message_id, 'no-message-id');
  return path.join(INGRESS_CACHE_DIR, datePart, `update-${updatePart}-message-${messagePart}`);
}

function cacheRawUpdate(update) {
  const dir = updateCacheDir(update);
  writeJsonAtomic(path.join(dir, 'update.json'), {
    cachedAt: new Date().toISOString(),
    sourceBot: 'TimeSyncherVacationBot',
    update,
  });
  return dir;
}

function noteCacheStage(cacheDir, stage, details = {}) {
  if (!cacheDir) return;
  writeJsonAtomic(path.join(cacheDir, `${safePathPart(stage)}.json`), {
    cachedAt: new Date().toISOString(),
    stage,
    ...details,
  });
}

function cleanupIngressCache() {
  const cutoffMs = Date.now() - INGRESS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    ensureDir(INGRESS_CACHE_DIR);
    for (const dateEntry of fs.readdirSync(INGRESS_CACHE_DIR, { withFileTypes: true })) {
      if (!dateEntry.isDirectory()) continue;
      const dateDir = path.join(INGRESS_CACHE_DIR, dateEntry.name);
      for (const updateEntry of fs.readdirSync(dateDir, { withFileTypes: true })) {
        if (!updateEntry.isDirectory()) continue;
        const updateDir = path.join(dateDir, updateEntry.name);
        const stat = fs.statSync(updateDir);
        if (stat.mtimeMs < cutoffMs) fs.rmSync(updateDir, { recursive: true, force: true });
      }
      if (fs.readdirSync(dateDir).length === 0) fs.rmdirSync(dateDir);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ingress cache cleanup failed: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startWorkerDrainIfQueued(turn) {
  if (!turn || !turn.queued || !WORKER_DRAIN_SERVICE) return;
  execFile('systemctl', ['--user', 'start', WORKER_DRAIN_SERVICE], (error) => {
    if (error) {
      console.error(`[${new Date().toISOString()}] worker drain start failed: ${error.message}`);
      return;
    }
    console.log(`[${new Date().toISOString()}] worker drain start requested for queued Telegram turn`);
  });
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

function replyMarkupForTurn(turn = {}) {
  const replyMarkup = turn.replyMarkup || turn.reply_markup;
  if (replyMarkup && typeof replyMarkup === 'object' && !Array.isArray(replyMarkup)) return replyMarkup;

  const checkoutUrl = cleanText(
    turn.checkoutUrl ||
      turn.checkoutURL ||
      turn.orderUrl ||
      turn.orderURL ||
      turn.paymentUrl ||
      turn.paymentURL ||
      turn.collaboratorCheckoutUrl ||
      turn.collaboratorCheckoutURL,
    2048,
  );
  if (!checkoutUrl) return undefined;

  return {
    inline_keyboard: [[
      {
        text: 'Open checkout',
        url: checkoutUrl,
      },
    ]],
  };
}

async function sendMessage(chatId, text, replyToMessageId, replyMarkup) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: /<a\s+href=/i.test(String(text || '')) ? 'HTML' : undefined,
    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

async function downloadTelegramFile({ fileId, cacheDir, label, extension = 'bin' }) {
  if (!fileId) throw new Error(`${label} did not include a Telegram file id.`);
  const file = await telegram('getFile', { file_id: fileId });
  if (!file?.file_path) throw new Error(`Telegram did not return a ${label} file path.`);

  const audioResponse = await fetchWithRetry(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    {},
    `Telegram ${label} download`,
  );
  if (!audioResponse.ok) throw new Error(`Telegram ${label} download ${audioResponse.status}`);

  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  const filePath = path.join(cacheDir || INGRESS_CACHE_DIR, `${safePathPart(label)}.${safePathPart(extension, 'bin')}`);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, bytes, { mode: 0o600 });
  writeJsonAtomic(`${filePath}.json`, {
    cachedAt: new Date().toISOString(),
    label,
    fileId,
    telegramFilePath: file.file_path,
    sizeBytes: bytes.length,
    path: filePath,
  });
  return { bytes, file, filePath };
}

async function transcribeVoiceMessage(message, { cacheDir = '' } = {}) {
  if (!OPENAI_API_KEY) throw new Error('Voice transcription is not configured yet.');
  const voice = message.voice;
  if (!voice?.file_id) throw new Error('Voice message did not include a Telegram file id.');
  const extension = String(voice.mime_type || '').includes('mpeg') ? 'mp3' : 'ogg';
  const cachedVoice = await downloadTelegramFile({
    fileId: voice.file_id,
    cacheDir,
    label: `telegram-voice-${message.message_id || Date.now()}`,
    extension,
  });

  const audio = new Blob([cachedVoice.bytes], { type: voice.mime_type || 'audio/ogg' });
  const form = new FormData();
  form.append('model', STT_MODEL);
  form.append('file', audio, path.basename(cachedVoice.filePath));

  const response = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  }, 'OpenAI voice transcription');
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || `OpenAI voice transcription ${response.status}`);
  const text = cleanText(json.text, 12000);
  if (!text) throw new Error('Voice transcription returned empty text.');
  noteCacheStage(cacheDir, 'transcription', {
    model: STT_MODEL,
    text,
    voicePath: cachedVoice.filePath,
  });
  return {
    text,
    voiceCache: {
      path: cachedVoice.filePath,
      telegramFilePath: cachedVoice.file.file_path,
      sizeBytes: cachedVoice.bytes.length,
    },
  };
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

function mediaFromMessage(message = {}) {
  const caption = cleanText(message.caption, 1000);
  const photos = Array.isArray(message.photo) ? message.photo : [];
  if (photos.length) {
    const photo = photos[photos.length - 1];
    return {
      mediaKind: 'photo',
      telegramFileId: photo.file_id || '',
      telegramFileUniqueId: photo.file_unique_id || '',
      fileSizeBytes: photo.file_size || 0,
      width: photo.width || null,
      height: photo.height || null,
      mimeType: 'image/jpeg',
      originalName: `telegram-photo-${message.message_id || Date.now()}.jpg`,
      caption,
      extension: 'jpg',
      label: `telegram-photo-${message.message_id || Date.now()}`,
    };
  }
  if (message.video?.file_id) {
    const video = message.video;
    return {
      mediaKind: 'video',
      telegramFileId: video.file_id || '',
      telegramFileUniqueId: video.file_unique_id || '',
      fileSizeBytes: video.file_size || 0,
      width: video.width || null,
      height: video.height || null,
      durationSeconds: video.duration || null,
      mimeType: video.mime_type || 'video/mp4',
      originalName: video.file_name || `telegram-video-${message.message_id || Date.now()}.mp4`,
      caption,
      extension: 'mp4',
      label: `telegram-video-${message.message_id || Date.now()}`,
    };
  }
  const document = message.document;
  const mimeType = cleanText(document?.mime_type, 160).toLowerCase();
  if (document?.file_id && /^image\//.test(mimeType)) {
    return {
      mediaKind: 'photo',
      telegramFileId: document.file_id || '',
      telegramFileUniqueId: document.file_unique_id || '',
      fileSizeBytes: document.file_size || 0,
      mimeType: document.mime_type || 'image/jpeg',
      originalName: document.file_name || `telegram-photo-${message.message_id || Date.now()}`,
      caption,
      extension: path.extname(document.file_name || '').replace(/^\./, '') || 'jpg',
      label: `telegram-photo-document-${message.message_id || Date.now()}`,
    };
  }
  if (document?.file_id && /^video\//.test(mimeType)) {
    return {
      mediaKind: 'video',
      telegramFileId: document.file_id || '',
      telegramFileUniqueId: document.file_unique_id || '',
      fileSizeBytes: document.file_size || 0,
      mimeType: document.mime_type || 'video/mp4',
      originalName: document.file_name || `telegram-video-${message.message_id || Date.now()}`,
      caption,
      extension: path.extname(document.file_name || '').replace(/^\./, '') || 'mp4',
      label: `telegram-video-document-${message.message_id || Date.now()}`,
    };
  }
  return null;
}

async function recordMediaUpload(message, media, { cacheDir = '' } = {}) {
  if (!media?.telegramFileId) throw new Error('Telegram media did not include a file id.');
  if (media.fileSizeBytes && media.fileSizeBytes > TELEGRAM_MEDIA_MAX_BYTES) {
    throw new Error(`That file is too large for Telegram bot intake right now. Limit is ${Math.floor(TELEGRAM_MEDIA_MAX_BYTES / 1024 / 1024)} MB until the private upload-link path is live.`);
  }
  const cached = await downloadTelegramFile({
    fileId: media.telegramFileId,
    cacheDir,
    label: media.label,
    extension: media.extension,
  });
  const from = message.from || {};
  const chat = message.chat || {};
  const payload = {
    ...media,
    fileSizeBytes: media.fileSizeBytes || cached.bytes.length,
    telegramFilePath: cached.file?.file_path || '',
    telegramChatId: String(chat.id || ''),
    telegramUserId: from.id ? String(from.id) : '',
    telegramMessageId: message.message_id ? String(message.message_id) : '',
    metadata: {
      sourceBot: 'TimeSyncherVacationBot',
      telegramUsername: from.username || null,
      cachePath: cached.filePath,
      cacheSizeBytes: cached.bytes.length,
      telegramBotApiDownloadLimitBytes: TELEGRAM_MEDIA_MAX_BYTES,
    },
  };
  const { response, json } = await fetchJsonWithRetry(`${API_BASE}/api/vacation-telegram-turn`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(INTAKE_TOKEN ? { authorization: `Bearer ${INTAKE_TOKEN}` } : {}),
    },
    body: JSON.stringify({ event: 'media_upload', ...payload }),
  }, 'Vacation media API');
  if (!response.ok || json.ok === false) throw new Error(json.error || `Vacation media API ${response.status}`);
  noteCacheStage(cacheDir, 'recorded-media', {
    mediaId: json.media?.id || null,
    mediaKind: media.mediaKind,
    fileSizeBytes: payload.fileSizeBytes,
  });
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

async function handleMessage(message, { cacheDir = '' } = {}) {
  const chatId = message.chat?.id;
  const messageId = message.message_id;
  let text = cleanText(message.text || message.caption);
  let payload = {};
  if (!chatId) return;

  if (!text && message.voice) {
    await telegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const transcription = await transcribeVoiceMessage(message, { cacheDir });
    text = transcription.text;
    payload = {
      telegramVoice: {
        duration: message.voice.duration || null,
        fileId: message.voice.file_id || null,
        fileUniqueId: message.voice.file_unique_id || null,
        fileSize: message.voice.file_size || null,
        mimeType: message.voice.mime_type || null,
        transcriptionModel: STT_MODEL,
        cachePath: transcription.voiceCache?.path || null,
      },
      transcribedFromVoice: true,
    };
  }

  const media = mediaFromMessage(message);
  if (media) {
    await telegram('sendChatAction', { chat_id: chatId, action: media.mediaKind === 'video' ? 'upload_video' : 'upload_photo' }).catch(() => {});
    const result = await recordMediaUpload(message, media, { cacheDir });
    const reply = result.reply || (media.mediaKind === 'video'
      ? 'Got it — I saved that video to this vacation.'
      : 'Got it — I saved that photo to this vacation.');
    await sendMessage(chatId, reply, messageId);
    return;
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
  noteCacheStage(cacheDir, 'recorded-turn', {
    transcriptId: turn.transcriptId || null,
    outboundTranscriptId: turn.outboundTranscriptId || null,
    queued: turn.queued || null,
  });
  startWorkerDrainIfQueued(turn);

  const reply = turn.reply || [
    'I am processing the information you sent and setting up your TimeSyncher Vacation.',
    '',
    'Expect an initial vacation itinerary in about 10-20 minutes. You can keep sending updates here while I work on it.',
  ].join('\n');
  if (isWebsiteLinkRequest(text) && turn.queued && isGenericQueuedAcknowledgement(reply)) {
    noteCacheStage(cacheDir, 'suppressed-link-request-ack', {
      reason: 'website_link_request_queued_for_completion_response',
      transcriptId: turn.transcriptId || null,
      outboundTranscriptId: turn.outboundTranscriptId || null,
    });
    return;
  }
  let sent;
  try {
    sent = await sendMessage(chatId, reply, messageId, replyMarkupForTurn(turn));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] send reply failed for message ${messageId}: ${error.message}; delayed retry in ${DELAYED_RETRY_MS}ms`);
    await sleep(DELAYED_RETRY_MS);
    sent = await sendMessage(chatId, reply, messageId, replyMarkupForTurn(turn));
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
    const cacheDir = cacheRawUpdate(update);
    try {
      if (update.message) await handleMessage(update.message, { cacheDir });
      noteCacheStage(cacheDir, 'processed', { ok: true });
    } catch (error) {
      noteCacheStage(cacheDir, 'failed', { ok: false, error: cleanText(error.message, 1000) });
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
  cleanupIngressCache();
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
