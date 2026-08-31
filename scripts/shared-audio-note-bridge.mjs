#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';

const HOST = process.env.TIMESYNCHER_SHARED_AUDIO_HOST || '127.0.0.1';
const PORT = Number(process.env.TIMESYNCHER_SHARED_AUDIO_PORT || 4185);
const MAX_BYTES = Number(process.env.TIMESYNCHER_SHARED_AUDIO_MAX_BYTES || 4 * 1024 * 1024);
const MAX_BODY_BYTES = Math.ceil(MAX_BYTES * 1.5) + 2048;
const DEFAULT_DB_PATH = '/home/timesyncher-agent/trek/runtime/data/travel.db';
const DEFAULT_PUBLIC_BASE = 'https://travel.timesyncher.com';

function clean(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(json);
}

function parseJsonOutput(value) {
  const source = clean(value, 200000);
  try { return JSON.parse(source); } catch {}
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try { return JSON.parse(lines[i]); } catch {}
  }
  throw new Error(clean(source || 'Invalid itinerary edit response.', 600));
}

function parseDataUrl(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*)(?:;[a-z0-9!#$&^_.+-]+=(?:"[^"]*"|[^;,]+))*;base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) throw Object.assign(new Error('Audio note must be a base64 data URL.'), { statusCode: 400 });
  const mimeType = clean(match[1].toLowerCase(), 80);
  if (!/^(audio|video)\//.test(mimeType)) throw Object.assign(new Error('Audio note must use an audio MIME type.'), { statusCode: 400 });
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length) throw Object.assign(new Error('Audio note was empty.'), { statusCode: 400 });
  if (bytes.length > MAX_BYTES) throw Object.assign(new Error('Audio note is too large. Please keep recordings under about 45 seconds.'), { statusCode: 413 });
  return { bytes, mimeType };
}

function extension(mimeType = '') {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

async function transcribe({ bytes, mimeType }) {
  const apiKey = process.env.TIMESYNCHER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw Object.assign(new Error('Website audio note transcription is not configured yet.'), { statusCode: 503 });
  const form = new FormData();
  form.append('model', process.env.TIMESYNCHER_STT_MODEL || 'whisper-1');
  form.append('file', new Blob([bytes], { type: mimeType }), `shared-itinerary-audio-note.${extension(mimeType)}`);
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || `Audio transcription failed with ${response.status}.`), { statusCode: 502 });
  const text = clean(body.text, 12000);
  if (!text) throw Object.assign(new Error('Audio transcription returned empty text.'), { statusCode: 422 });
  return text;
}

function runTrekEdit({ shareToken, requestText }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['/home/timesyncher-agent/timesyncher/scripts/trek-agent-edit.mjs'], {
      cwd: '/home/timesyncher-agent/timesyncher',
      env: {
        ...process.env,
        TIMESYNCHER_TREK_DB_PATH: process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH,
        TIMESYNCHER_TREK_PUBLIC_BASE_URL: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(Object.assign(new Error('Timed out applying itinerary update.'), { statusCode: 504 }));
    }, Number(process.env.TIMESYNCHER_SHARED_AUDIO_EDIT_TIMEOUT_MS || 930000));
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(Object.assign(new Error(clean(stderr || stdout || `trek-agent-edit exited ${code}`, 600)), { statusCode: 502 }));
        return;
      }
      try {
        resolve(parseJsonOutput(stdout));
      } catch (error) {
        reject(Object.assign(error, { statusCode: 502 }));
      }
    });
    child.stdin.end(JSON.stringify({
      shareToken,
      requestText,
      publicBase: process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE,
      dbPath: process.env.TIMESYNCHER_TREK_DB_PATH || DEFAULT_DB_PATH,
    }));
  });
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Audio note is too large. Please keep recordings under about 45 seconds.'), { statusCode: 413 });
    }
  }
  return JSON.parse(body || '{}');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.url !== '/audio-note') return send(res, 404, { ok: false, error: 'not found' });
    const body = await readBody(req);
    const shareToken = clean(body.shareToken, 240);
    if (!shareToken) throw Object.assign(new Error('shareToken is required.'), { statusCode: 400 });
    const parsed = parseDataUrl(body.audioDataUrl || body.audio?.dataUrl);
    const transcript = await transcribe(parsed);
    const result = await runTrekEdit({ shareToken, requestText: transcript });
    if (result?.noop || result?.editApplied === false) {
      throw Object.assign(new Error(result?.summary || 'I could not apply that itinerary update.'), { statusCode: 422 });
    }
    send(res, 201, {
      ok: true,
      status: 'processed',
      transcript,
      edit: result,
    });
  } catch (error) {
    send(res, error?.statusCode || 500, {
      ok: false,
      error: clean(error?.message || error || 'Unable to process audio note.', 600),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`shared audio note bridge listening on ${HOST}:${PORT}`);
});
