import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

async function read(path) {
  return readFile(join(root, path), 'utf8');
}

async function walk(dir, acc = []) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walk(rel, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

const failures = [];

function fail(file, line, message) {
  failures.push(`${file}:${line}: ${message}`);
}

const TELEGRAM_ROUTE_NEEDLE = /vacation-telegram-turn|telegram-turn|media-download|api\.telegram\.org|telegram-vacation-intake/i;

function scanTelegramRoutes(text, file) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (TELEGRAM_ROUTE_NEEDLE.test(lines[i])) {
      fail(file, i + 1, 'telegram route or media-download reference');
    }
    if (file.startsWith('api/') && /telegram/i.test(lines[i])) {
      fail(file, i + 1, 'api file mentions telegram');
    }
  }
}

function scanMediaProxyHandlers(text, file) {
  const neonRawServe = file.endsWith('thing-media-store.mjs')
    || (file.includes('bind-thing-media-handler') && /sendCachedBindingMedia/.test(text));
  const proxyPatterns = [
    ...(neonRawServe ? [] : [/getBindingMedia\s*\(/]),
    /Readable\.fromWeb\s*\(/,
    /res\.end\s*\(\s*media\.bytes/,
    /api\.telegram\.org/,
    /vacation-telegram-turn/,
    /action=media-download/,
  ];
  for (const pattern of proxyPatterns) {
    if (pattern.test(text)) {
      const line = text.split('\n').findIndex((row) => pattern.test(row));
      fail(file, line >= 0 ? line + 1 : 1, `media proxy pattern ${pattern}`);
    }
  }
}

function scanFrontendApiMediaUrls(text, file) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/(src|href|url|publicUrl|image_url|videoUrl|photoUrl|mediaUrl)\s*[:=]/i.test(line)) continue;
    if (!/\/api\//.test(line)) continue;
    if (/fetch\s*\(\s*[`'"]\/api\//.test(line) && !/raw=1/.test(line) && /bind-thing-media\?shareToken=/.test(line)) continue;
    if (/vacation-itinerary|vacation-web-access|checkout|eula|create-payment|stripe|worker-jobs|onboarding|admin-onboardings|version|keepsake-order|vacation-request|track-click|pdf\/|shared-trip/.test(line)) continue;
    if (/bind-thing-media\?shareToken=/.test(line) && !/raw=1/.test(line) && /fetch/.test(line)) continue;
    if (/\/api\/bind-thing-media\?[^"'`\s]*\braw=(?:1|true)\b/.test(line)) {
      fail(file, i + 1, 'frontend builds function media URL under /api/');
    }
    if (/vacation-telegram-turn/.test(line)) {
      fail(file, i + 1, 'frontend references vacation-telegram-turn');
    }
    if (/media-download/.test(line)) {
      fail(file, i + 1, 'frontend references media-download');
    }
  }
}

const apiFiles = (await walk('api')).filter((file) => file.endsWith('.mjs') || file.endsWith('.js'));
const routeFiles = (await walk('routes')).filter((file) => file.endsWith('.mjs') || file.endsWith('.js'));
const handlerFiles = (await walk('src/vacation')).filter((file) => file.endsWith('-handler.mjs'));
for (const file of [...apiFiles, ...routeFiles, ...handlerFiles]) {
  const text = await read(file);
  scanTelegramRoutes(text, file);
  scanMediaProxyHandlers(text, file);
}

const vercel = await read('vercel.json');
if (/telegram/i.test(vercel)) {
  fail('vercel.json', 1, 'vercel.json mentions telegram');
}

const frontendFiles = [
  'vacation-app.html',
  'shared-app.html',
  'public/ts-thing-media-overlay.js',
  'public/checkout-price-client.js',
  'public/post-purchase-gate.mjs',
];
for (const file of frontendFiles) {
  const text = await read(file);
  scanFrontendApiMediaUrls(text, file);
}

assert.equal(failures.length, 0, failures.join('\n'));
console.log('no telegram / media-proxy guard passed');
