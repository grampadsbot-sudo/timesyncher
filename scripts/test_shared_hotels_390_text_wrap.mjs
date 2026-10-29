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
  'served CSS must address Hotels list titles at 390px via data-ts-hotel-row-head',
);
assert.match(
  css,
  /\[data-shared-live-tab="hotels"\] \[data-ts-hotel-row-head="1"\] strong[\s\S]*white-space:\s*normal!important/,
  'hotel names wrap at 390px',
);
assert.doesNotMatch(
  css,
  /\[data-shared-live-tab="hotels"\] \[data-ts-hotel-row-head="1"\] strong[\s\S]*text-overflow:\s*ellipsis!important/,
  'hotel names must not ellipsis-clip at 390px',
);
assert.match(
  bundle,
  /data-ts-hotel-row-head":"1"[\s\S]*whiteSpace:"normal",overflowWrap:"anywhere",fontWeight:800\},children:Re/,
  'served bundle hotel title strong wraps',
);
assert.match(bundle, /data-ts-hotel-row-head":"1"/, 'served bundle must mark hotel row head for mobile CSS');
assert.match(bundle, /data-ts-budget-row":"1"/);
assert.match(bundle, /data-ts-budget-panel":"1"/);

console.log('shared hotels 390px name wrap contract OK');
