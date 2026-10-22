#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inkBboxCenterYFromRgba, normalizeThingLogoUrl } from '../src/vacation/thing-logo-ink-center.mjs';
import { NAMED_THING_LOGOS } from '../src/vacation/thing-logo-capture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outPath = path.join(root, 'src/vacation/thing-logo-ink-offsets.json');
const cacheDir = path.join(root, 'scripts/fixtures/thing-logo-ink-cache');
const INK_THRESHOLD = 24;

function decodeImageBuffer(buf, ext = 'bin') {
  const dir = mkdtempSync(path.join(tmpdir(), 'ts-logo-ink-'));
  const inPath = path.join(dir, `in.${ext}`);
  try {
    writeFileSync(inPath, buf);
    const meta = execFileSync('identify', ['-format', '%s %w %h\n', inPath], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [idx, w, h] = line.split(/\s+/);
        return { idx: Number(idx), w: Number(w), h: Number(h) };
      });
    if (!meta.length) throw new Error('identify returned no frames');
    let pick = meta[0].idx;
    let maxArea = meta[0].w * meta[0].h;
    for (const row of meta) {
      const area = row.w * row.h;
      if (area > maxArea) {
        maxArea = area;
        pick = row.idx;
      }
    }
    const frame = `${inPath}[${pick}]`;
    const wh = execFileSync('identify', ['-format', '%w %h', frame], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
    const [width, height] = wh;
    const raw = execFileSync(
      'convert',
      [frame, '-background', 'none', '-flatten', '-alpha', 'on', '-depth', '8', 'rgba:-'],
      { maxBuffer: Math.max(16 * 1024 * 1024, width * height * 4 + 4096) },
    );
    const data = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
    if (data.length < width * height * 4) throw new Error(`rgba short read ${data.length} < ${width * height * 4}`);
    return { data, width, height };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function extFromUrl(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('.png')) return 'png';
  if (u.includes('.jpg') || u.includes('.jpeg')) return 'jpg';
  if (u.includes('.webp')) return 'webp';
  if (u.includes('.svg')) return 'svg';
  if (u.includes('.ico')) return 'ico';
  return 'bin';
}

function readCachedLogoBytes(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    if (!host) return null;
    for (const ext of ['.ico', '.png', '.webp', '.jpg', '.bin']) {
      const p = path.join(cacheDir, `${host}${ext}`);
      if (existsSync(p)) {
        const buf = readFileSync(p);
        if (buf.length >= 32) return buf;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchLogo(url) {
  const cached = readCachedLogoBytes(url);
  if (cached) return cached;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'TimeSyncherVKLogoInkBuild/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) throw new Error('body too small');
  return buf;
}

function collectLogoUrls() {
  const urls = new Set(Object.values(NAMED_THING_LOGOS));
  const staging = JSON.parse(
    readFileSync(path.join(root, 'scripts/fixtures/gate-b-nyc-shared-staging.json'), 'utf8'),
  );
  const enrichment = JSON.parse(
    readFileSync(path.join(root, 'scripts/fixtures/nyc_ccab_place_enrichment.json'), 'utf8'),
  );
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.logoUrl === 'string' && node.logoUrl.trim()) urls.add(node.logoUrl.trim());
    if (typeof node.iconUrl === 'string' && node.iconUrl.trim()) urls.add(node.iconUrl.trim());
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(staging);
  for (const row of Object.values(enrichment)) {
    if (row?.logoUrl) urls.add(String(row.logoUrl).trim());
  }
  return [...urls].filter((u) => u && !/^data:/i.test(u) && !/\/ts-thing-media\//i.test(u));
}

const table = {};
const urls = collectLogoUrls();
let ok = 0;
let fail = 0;
for (const rawUrl of urls) {
  const key = normalizeThingLogoUrl(rawUrl);
  if (!key || table[key]) continue;
  try {
    const buf = await fetchLogo(rawUrl);
    const { data, width, height } = decodeImageBuffer(buf, extFromUrl(rawUrl));
    const inkCy = inkBboxCenterYFromRgba(data, width, height, INK_THRESHOLD);
    if (inkCy == null) throw new Error('no ink bbox');
    table[key] = { inkCy: +inkCy.toFixed(4), nh: height, nw: width };
    ok += 1;
  } catch (err) {
    fail += 1;
    process.stderr.write(`skip ${rawUrl}: ${err.message}\n`);
  }
}
writeFileSync(outPath, `${JSON.stringify(table, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(table).length} logo ink rows (${ok} ok, ${fail} skipped) -> ${outPath}\n`);
