#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const bundle = readFileSync(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');

assert.match(
  css,
  /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*\[data-shared-live-tab="hotels"\][\s\S]*\[data-ts-hotel-row-head="1"\]/,
  'served CSS must wrap Hotels list row titles at 390px via data-ts-hotel-row-head',
);
assert.match(
  css,
  /\[data-shared-live-tab="hotels"\][\s\S]*white-space:\s*normal!important/,
);
assert.match(bundle, /data-ts-hotel-row-head":"1"/, 'served bundle must mark hotel row head for mobile wrap CSS');

console.log('shared hotels 390px text wrap contract OK');
