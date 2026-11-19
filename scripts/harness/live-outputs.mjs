import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeHits } from './chrome.mjs';
import { nonEmpty, scrubFile } from './files.mjs';
import { boundMediaPlayUrl } from '../../src/vacation/thing-media-bind.mjs';
import { redactText } from './redact.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

function transcriptFromJsonl(file) {
  if (!nonEmpty(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const header = JSON.parse(lines[0]);
  const turns = lines.slice(1).map((line) => {
    const row = JSON.parse(line);
    if (row.type !== 'turn') return row;
    const { type, ...turn } = row;
    return turn;
  });
  return { ...header, turns: header.turns || turns };
}

export async function renderDialog({ token, outDir, secrets }) {
  const out = path.join(outDir, 'dialog.pdf');
  const jsonl = path.join(outDir, 'live-transcript.jsonl');
  const timing = path.join(outDir, 'timing.json');
  const state = path.join(outDir, 'qa-input.json');
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/live-transcript-dialog-pdf.mjs'),
    '--session', token,
    '--out', out,
    '--jsonlOut', jsonl,
    '--timing', timing,
    '--state', state,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  for (const file of [jsonl, timing, state]) scrubFile(file, secrets);
  const detail = redactText(`${result.stdout || ''}\n${result.stderr || ''}`, secrets).trim();
  if (result.status !== 0) {
    return { ok: false, detail: detail || 'dialog renderer refused', transcript: transcriptFromJsonl(jsonl), pdfText: '', out };
  }
  let parsed = {};
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    return { ok: false, detail: 'dialog renderer returned no status', transcript: transcriptFromJsonl(jsonl), pdfText: '', out };
  }
  const { extractPdfText } = await import('../live-transcript-dialog-pdf.mjs');
  const pdfText = nonEmpty(out) ? extractPdfText(fs.readFileSync(out)) : '';
  return {
    ok: parsed.ok === true && nonEmpty(out),
    detail: parsed.ok === true ? 'ok' : detail,
    transcript: transcriptFromJsonl(jsonl),
    pdfText,
    refusals: parsed.contentFails || [],
    out,
  };
}

function mediaHeaders(env) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  const token = env.TIMESYNCHER_MEDIA_BIND_TOKEN || env.TIMESYNCHER_ADMIN_TOKEN || env.TIMESYNCHER_WORKER_TOKEN || '';
  if (token) headers['x-timesyncher-media-bind-token'] = token;
  return headers;
}

export async function attachMedia({ origin, shareToken, story, fetchImpl, env }) {
  const sharedUrl = new URL(`/api/shared/${encodeURIComponent(shareToken)}/`, origin);
  const sharedResponse = await fetchImpl(sharedUrl, { headers: { accept: 'application/json' } });
  const shared = await sharedResponse.json();
  const things = [...(shared.places || []), ...(shared.things || [])];
  const thing = things[0];
  if (!thing) return { ok: false, detail: 'no-thing-for-media', bindings: [] };
  const bindings = [];
  for (const item of story.media || []) {
    const bytes = fs.readFileSync(path.resolve(root, item.fixture));
    const response = await fetchImpl(new URL('/api/bind-thing-media', origin), {
      method: 'POST',
      headers: mediaHeaders(env),
      body: JSON.stringify({
        shareToken,
        thingName: thing.name || thing.title,
        thingId: thing.id,
        fileName: path.basename(item.fixture),
        fileBase64: bytes.toString('base64'),
        caption: item.kind,
      }),
    });
    const body = await response.json();
    bindings.push({ kind: item.kind, status: response.status, body });
  }
  const video = bindings.find((row) => row.kind === 'video');
  const detail = video && !videoPlayTarget(video) ? videoBindProblem(video) : '';
  return { ok: bindings.every((row) => row.status >= 200 && row.status < 300 && row.body?.ok !== false), detail, bindings };
}

function videoBody(video) {
  return video?.body && typeof video.body === 'object' ? video.body : {};
}

function videoBinding(video) {
  const body = videoBody(video);
  return body.binding && typeof body.binding === 'object' ? body.binding : {};
}

function videoPlayTarget(video) {
  return boundMediaPlayUrl(videoBinding(video));
}

function videoBindProblem(video) {
  const status = Number(video?.status || 0);
  const error = String(videoBody(video).error || videoBody(video).message || '').trim();
  return `http ${status || 0} ${error || 'binding has no publicUrl'}`;
}

export async function writeVideoCheck({ origin, attachment, fetchImpl, outDir }) {
  const video = (attachment.bindings || []).find((row) => row.kind === 'video');
  const target = videoPlayTarget(video);
  const file = path.join(outDir, 'video-check.json');
  if (!target) {
    const base = String(attachment.detail || '').trim();
    const detail = video ? `video-missing: ${videoBindProblem(video)}` : (base || 'video-missing: binding has no publicUrl');
    const payload = { pass: false, detail, contentType: '', status: Number(video?.status || 0) };
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
  const response = await fetchImpl(new URL(target, origin), { headers: { accept: '*/*' } });
  const contentType = response.headers.get('content-type') || '';
  const playable = response.status === 200 && /^(video|image)\//i.test(contentType);
  const payload = {
    pass: playable && attachment.ok === true,
    detail: playable ? 'playable' : 'qr-target-not-playable',
    contentType,
    status: response.status,
    thing: video.body?.thing?.name || video.body?.binding?.thingName || '',
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function keepsakeDecision({ status, contentType, bytes, redirected }) {
  const head = Buffer.isBuffer(bytes) ? bytes.subarray(0, 5).toString() : '';
  const pdf = head.startsWith('%PDF');
  if (status === 200 && pdf && !redirected) return { ok: true, detail: 'pdf' };
  const kind = pdf ? 'pdf' : (String(contentType || 'unknown').split(';')[0] || 'unknown');
  const redirectNote = redirected ? ', redirect' : '';
  return { ok: false, detail: `keepsake response was not a PDF (http ${status}, content-type ${kind}${redirectNote})` };
}

async function readKeptResponse(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers?.get?.('content-type') || '',
    bytes,
    redirected: response.redirected === true || response.status === 302 || response.status === 301,
  };
}

export async function fetchKeepsake({ origin, shareToken, fetchImpl, outDir }) {
  const file = path.join(outDir, 'keepsake.pdf');
  const pdfUrl = new URL(`/api/pdf/shared/${encodeURIComponent(shareToken)}/report/complete-list.pdf`, origin);
  const response = await fetchImpl(pdfUrl, { redirect: 'manual', headers: { accept: 'application/pdf' } });
  const read = await readKeptResponse(response);
  const decision = keepsakeDecision(read);
  if (!decision.ok) return { ok: false, file, detail: decision.detail };
  fs.writeFileSync(file, read.bytes);
  return { ok: true, file, detail: decision.detail };
}

const ENGINES = ['webkit', 'chromium'];
const WIDTHS = [390, 430];
const SURFACES = ['app', 'shared', 'day-by-day', 'trip-switcher'];

function surfaceUrl(origin, shareToken, sessionToken, surface) {
  if (surface === 'shared') return new URL(`/shared/${encodeURIComponent(shareToken)}/`, origin).href;
  if (surface === 'day-by-day') return new URL(`/shared/${encodeURIComponent(shareToken)}/?tab=day-by-day`, origin).href;
  const app = new URL('/vacation-app.html', origin);
  app.searchParams.set('session', sessionToken);
  return app.href;
}

export function playwrightSearchPaths(home = os.homedir()) {
  return [
    'playwright',
    'playwright-core',
    path.join(home, 'tsv-dispatch/capture/node_modules/playwright'),
    path.join(home, 'tsv-dispatch/capture/node_modules/playwright-core'),
    path.join(home, '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  ];
}

export function resolvePlaywright(paths = playwrightSearchPaths(), load = defaultPlaywrightLoad()) {
  const tried = [];
  for (const candidate of paths) {
    tried.push(candidate);
    const loaded = load(candidate);
    if (loaded?.webkit && loaded?.chromium) return { module: loaded, from: candidate, tried };
  }
  return {
    missing: `playwright-missing; npm install playwright in ${path.join(os.homedir(), 'tsv-dispatch/capture')}. Tried: ${tried.join(', ')}`,
    tried,
  };
}

function defaultPlaywrightLoad() {
  const require = createRequire(import.meta.url);
  return (candidate) => {
    if (candidate.includes('node_modules') && !fs.existsSync(path.join(candidate, 'package.json'))) return null;
    try {
      return require(candidate);
    } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND') return null;
      throw error;
    }
  };
}

export async function captureScreens({ origin, shareToken, sessionToken, outDir }) {
  const dir = path.join(outDir, 'screens');
  fs.mkdirSync(dir, { recursive: true });
  const playwright = resolvePlaywright();
  if (playwright.missing) return { ok: false, files: [], texts: [], error: playwright.missing };
  const files = [];
  const texts = [];
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  for (const engine of ENGINES) {
    let browser;
    try {
      browser = await playwright.module[engine].launch();
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua });
        const page = await context.newPage();
        for (const surface of SURFACES) {
          await page.goto(surfaceUrl(origin, shareToken, sessionToken, surface), { waitUntil: 'domcontentloaded', timeout: 45000 });
          const file = path.join(dir, `${surface}-${engine}-${width}.png`);
          await page.screenshot({ path: file });
          texts.push(await page.locator('body').innerText());
          files.push(file);
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  const hits = chromeHits(texts.join('\n'));
  return { ok: files.length === ENGINES.length * WIDTHS.length * SURFACES.length && files.every(nonEmpty) && hits.length === 0, files, texts, hits, error: hits.join(',') };
}

export async function runSteps(story, recordParty) {
  const present = [];
  for (const step of story.steps || []) {
    if (step === 'collaborator' && recordParty) await recordParty();
    present.push(step);
  }
  return present;
}
