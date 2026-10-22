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
  'served CSS must constrain Hotels list row titles at 390px via data-ts-hotel-row-head',
);
assert.match(
  css,
  /\[data-shared-live-tab="hotels"\][\s\S]*text-overflow:\s*ellipsis!important/,
);
assert.doesNotMatch(
  css,
  /\[data-shared-live-tab="hotels"\][\s\S]*white-space:\s*normal!important/,
  'hotels mobile CSS must not wrap titles (ellipsis single line at 390)',
);
assert.match(
  bundle,
  /data-ts-hotel-row-head":"1"[\s\S]*display:"block",overflow:"hidden",textOverflow:"ellipsis"/,
  'served bundle must ellipsis-truncate hotel title strong',
);
assert.match(bundle, /data-ts-hotel-row-head":"1"/, 'served bundle must mark hotel row head for mobile CSS');

console.log('shared hotels 390px title truncation contract OK');
