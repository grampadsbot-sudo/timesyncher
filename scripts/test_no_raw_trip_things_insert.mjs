#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = ['routes', 'src'].map((dir) => path.join(root, dir));
const allowed = new Set([
  path.join(root, 'src/vacation/trip-things.mjs'),
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...await walk(full));
      continue;
    }
    if (!/\.(mjs|js)$/.test(entry.name)) continue;
    files.push(full);
  }
  return files;
}

const offenders = [];
for (const scanRoot of scanRoots) {
  for (const file of await walk(scanRoot)) {
    if (allowed.has(file)) continue;
    const text = await readFile(file, 'utf8');
    if (/insert into trip_things/i.test(text)) offenders.push(path.relative(root, file));
  }
}

assert.deepEqual(offenders, [], `raw trip_things inserts outside trip-things.mjs: ${offenders.join(', ')}`);
console.log('no raw trip_things insert guard passed');
