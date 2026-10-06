#!/usr/bin/env node
/** PR #225: verify side-by-side artifacts exist and patched/right matches prod/left layout size. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const outRoot = process.argv[2] || '/opt/cursor/artifacts/pr225-nyc-sbs-r2';
const tabs = ['day-by-day', 'flights', 'hotels', 'cars', 'restaurants', 'stores', 'events', 'budget'];
const viewports = ['390', '1280'];

function pngSize(filePath) {
  const buf = readFileSync(filePath);
  assert.ok(buf.length > 24 && buf[0] === 0x89, filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

const missing = [];
const mismatches = [];
for (const vp of viewports) {
  for (const tab of tabs) {
    const left = path.join(outRoot, `nyc-final-${tab}-${vp}.png`);
    const right = path.join(outRoot, `live-patched-${tab}-${vp}.png`);
    const sbs = path.join(outRoot, `${tab}-${vp}-side-by-side.png`);
    for (const file of [left, right, sbs]) {
      if (!existsSync(file)) missing.push(file);
    }
    if (!existsSync(left) || !existsSync(right)) continue;
    const l = pngSize(left);
    const r = pngSize(right);
    if (l.width !== r.width || Math.abs(l.height - r.height) > 4) {
      mismatches.push({ tab, vp, left: l, right: r });
    }
    if (l.bytes < 8000 || r.bytes < 8000) {
      mismatches.push({ tab, vp, detail: 'suspiciously_small_png', left: l.bytes, right: r.bytes });
    }
  }
}

if (missing.length) {
  console.error(JSON.stringify({ pass: false, missing }, null, 2));
  process.exit(1);
}
if (mismatches.length) {
  console.error(JSON.stringify({ pass: false, mismatches }, null, 2));
  process.exit(1);
}

const zip = '/opt/cursor/artifacts/pr225-nyc-sbs-r2.zip';
assert.ok(existsSync(zip), zip);
assert.ok(statSync(zip).size > 100_000, 'zip too small');

console.log(JSON.stringify({ pass: true, outRoot, zip, tabs, viewports }, null, 2));
