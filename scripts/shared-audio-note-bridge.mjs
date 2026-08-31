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

function audioNoteNoopMessage({ transcript = '', summary = '' } = {}) {
  const heard = clean(transcript, 260).replace(/\s+/g, ' ');
  const safeSummary = clean(summary, 420);
  const lines = [];
  if (heard) lines.push(`I heard: "${heard}"`);
  lines.push('I could not find the matching itinerary item to change, so I did not change the trip.');
  if (safeSummary && !/^I heard:/i.test(safeSummary) && !/^I kept the current trip unchanged/i.test(safeSummary)) {
    lines.push(safeSummary);
  }
  return lines.join(' ');
}

function splitTranscriptIntoEditRequests(transcript) {
  const source = clean(transcript, 12000).replace(/\s+/g, ' ');
  if (!source) return [];
  const protectedSource = source.replace(/\b(and|also)\s+(?:see|check)\s+if\s+there(?:'| i)?s\b/gi, ' $1 check whether there is');
  const normalized = protectedSource
    .replace(/\b(?:and\s+)?also\s+(?=(?:on|at|for|in)\b|(?:check|see|say|tell|make|change|update|move|take|remove|delete|add|put|switch|replace)\b)/gi, '\n')
    .replace(/\b(?:and\s+)?(?=(?:take|remove|delete)\s+(?:out|off|from|the)\b)/gi, '\n')
    .replace(/\b(?:and\s+)?(?=(?:move|switch|replace|change|update|add|put)\b)/gi, '\n');
  const segments = normalized
    .split(/\n+|(?:^|[.;])\s+/)
    .map((part) => clean(part.replace(/^(?:okay|ok|so|then|and)\b[\s,]*/i, ''), 1200))
    .filter((part) => part.length >= 4);
  const actionSegments = segments.filter((part) => /\b(check|see|say|tell|make|change|update|move|take|remove|delete|add|put|switch|replace)\b/i.test(part));
  const unique = [];
  const seen = new Set();
  for (const segment of actionSegments.length > 1 ? actionSegments : [source]) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(segment);
  }
  return unique;
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
  const match = raw.match(/^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*)(?:\s*;[^,;]*)*;\s*base64\s*,([a-z0-9+/=\r\n]+)$/i);
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

function runEditScript({ scriptName, shareToken, requestText, deterministicError = '' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`/home/timesyncher-agent/timesyncher/scripts/${scriptName}`], {
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
        reject(Object.assign(new Error(clean(stderr || stdout || `${scriptName} exited ${code}`, 600)), { statusCode: 502 }));
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
      deterministicError,
    }));
  });
}

async function runTrekEdit({ shareToken, requestText }) {
  try {
    const deterministic = await runEditScript({
      scriptName: 'trek-itinerary-edit.mjs',
      shareToken,
      requestText,
    });
    deterministic.mode = deterministic.mode || 'deterministic_trek_edit';
    return deterministic;
  } catch (error) {
    const fallback = await runEditScript({
      scriptName: 'trek-agent-edit.mjs',
      shareToken,
      requestText,
      deterministicError: clean(error?.message || error, 1200),
    });
    fallback.mode = fallback.mode || 'grok_trek_agent_edit';
    return fallback;
  }
}

function editApplied(result) {
  return result && result.noop !== true && result.editApplied !== false;
}

function updatedItemLabel(item = {}) {
  const action = clean(item.action || 'changed', 80).replace(/_/g, ' ');
  const title = clean(item.title || item.name || item.label || 'requested item', 180);
  const day = item.day ? ` on Day ${item.day}` : '';
  return `Changed "${title}"${day}: ${action}.`;
}

function audioNoteMultiResultMessage({ transcript = '', itemResults = [] } = {}) {
  const lines = [];
  const heard = clean(transcript, 520).replace(/\s+/g, ' ');
  if (heard) lines.push(`I heard: "${heard}"`);
  itemResults.forEach((item, index) => {
    const request = clean(item.requestText, 260).replace(/\s+/g, ' ');
    const prefix = itemResults.length > 1 ? `${index + 1}. ` : '';
    if (item.ok) {
      const changed = Array.isArray(item.edit?.updatedItems) && item.edit.updatedItems.length
        ? item.edit.updatedItems.map(updatedItemLabel).join(' ')
        : 'I changed that itinerary item.';
      lines.push(`${prefix}${request ? `For "${request}": ` : ''}${changed}`);
      return;
    }
    lines.push(`${prefix}${request ? `For "${request}": ` : ''}I could not find the matching itinerary item to change, so I did not change that item.`);
  });
  return lines.join(' ');
}

async function runTrekEditRequests({ shareToken, transcript }) {
  const requests = splitTranscriptIntoEditRequests(transcript);
  const itemResults = [];
  for (const requestText of requests) {
    try {
      const edit = await runTrekEdit({ shareToken, requestText });
      itemResults.push({ requestText, ok: editApplied(edit), edit });
    } catch (error) {
      itemResults.push({
        requestText,
        ok: false,
        edit: { noop: true, reason: 'edit_runner_error', summary: clean(error?.message || error, 600) },
      });
    }
  }
  return {
    transcript,
    requests,
    itemResults,
    okCount: itemResults.filter((item) => item.ok).length,
    failCount: itemResults.filter((item) => !item.ok).length,
  };
}

function runSharedEditPipeline({ shareToken, transcript, pageContext = {} }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['/home/timesyncher-agent/timesyncher/scripts/vacation-edit-pipeline.mjs'], {
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
        reject(Object.assign(new Error(clean(stderr || stdout || `vacation-edit-pipeline exited ${code}`, 900)), { statusCode: 502 }));
        return;
      }
      try {
        resolve(parseJsonOutput(stdout));
      } catch (error) {
        reject(Object.assign(error, { statusCode: 502 }));
      }
    });
    child.stdin.end(JSON.stringify({ shareToken, transcript, pageContext }));
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
    const rawAudio = String(body.audioDataUrl || body.audio?.dataUrl || '');
    req.audioNoteDataUrlHeader = rawAudio
      ? rawAudio.slice(0, Math.min(rawAudio.indexOf(',') + 1 || 120, 240))
      : null;
    const shareToken = clean(body.shareToken, 240);
    if (!shareToken) throw Object.assign(new Error('shareToken is required.'), { statusCode: 400 });
    const parsed = parseDataUrl(body.audioDataUrl || body.audio?.dataUrl);
    const transcript = await transcribe(parsed);
    const pageContext = body.pageContext || body.page_context || body.visiblePageContext || {};
    const result = await runSharedEditPipeline({ shareToken, transcript, pageContext });
    const customerMessage = result.message || audioNoteMultiResultMessage(result);
    if (!result.okCount) {
      return send(res, 422, {
        ok: false,
        error: customerMessage || audioNoteNoopMessage({ transcript }),
        transcript,
        edit: result,
      });
    }
    send(res, result.failCount ? 207 : 201, {
      ok: true,
      status: result.failCount ? 'partially_processed' : 'processed',
      message: customerMessage,
      transcript,
      edit: result,
    });
  } catch (error) {
    console.error('shared_audio_note_error', JSON.stringify({
      statusCode: error?.statusCode || 500,
      message: clean(error?.message || error || 'Unable to process audio note.', 240),
      dataUrlHeader: req.audioNoteDataUrlHeader || null,
      contentLength: req.headers['content-length'] || null,
      userAgent: clean(req.headers['user-agent'], 180) || null,
    }));
    send(res, error?.statusCode || 500, {
      ok: false,
      error: clean(error?.message || error || 'Unable to process audio note.', 600),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`shared audio note bridge listening on ${HOST}:${PORT}`);
});
