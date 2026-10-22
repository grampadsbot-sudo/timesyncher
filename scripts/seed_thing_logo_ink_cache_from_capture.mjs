#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = path.join(root, 'scripts/fixtures/thing-logo-ink-cache');
const CAPTURE_PNG = process.argv[2]
  || '/home/ubishere9995/tsv-dispatch/r109-local-38f36eb5/capture/restaurants-1280.png';
const SPEC_JSON = process.argv[3]
  || '/home/ubishere9995/tsv-gateb/runs/20261022-102452/gap-close/gap-601/_v6-restaurants-1280.json';
const staging = JSON.parse(
  readFileSync(path.join(root, 'scripts/fixtures/gate-b-nyc-shared-staging.json'), 'utf8'),
);
const logoUrlByName = new Map();
for (const row of staging.places || []) {
  if (row?.name && row?.logoUrl) logoUrlByName.set(String(row.name).trim(), String(row.logoUrl).trim());
}
const spec = JSON.parse(readFileSync(SPEC_JSON, 'utf8'));
const inset = 1;
mkdirSync(cacheDir, { recursive: true });
const seen = new Set();
for (const chip of spec.logo_chips || []) {
  const name = String(chip.name || '').trim();
  const url = logoUrlByName.get(name);
  if (!url || seen.has(url)) continue;
  seen.add(url);
  const box = chip.box;
  if (!box || box.length !== 4) continue;
  const [x, y, w, h] = box;
  const cw = w - inset * 2;
  const ch = h - inset * 2;
  if (cw < 4 || ch < 4) continue;
  const host = new URL(url).hostname;
  const outPath = path.join(cacheDir, `${host}.png`);
  execFileSync('convert', [
    CAPTURE_PNG,
    '-crop',
    `${cw}x${ch}+${x + inset}+${y + inset}`,
    '+repage',
    outPath,
  ]);
  process.stdout.write(`wrote ${outPath} from ${name}\n`);
}
