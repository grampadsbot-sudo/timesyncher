#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const OUT_PATH = new URL('../public/assets/index-BKun7ofk.js', import.meta.url);

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
await writeFile(OUT_PATH, rendered);
const committed = await readFile(OUT_PATH, 'utf8');
if (committed !== rendered) throw new Error('served bundle write failed');
console.log(`rebaked served trek bundle sha256=${createHash('sha256').update(rendered).digest('hex')} bytes=${rendered.length}`);
