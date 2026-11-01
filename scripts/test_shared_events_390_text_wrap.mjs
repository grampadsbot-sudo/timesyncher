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
  /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*\[data-shared-live-tab="events"\][\s\S]*\[data-ts-list-row-name="1"\]/,
  'served CSS must address Events list titles at 390px via data-ts-list-row-name',
);
assert.match(
  css,
  /\[data-shared-live-tab="events"\] \[data-ts-list-row-name="1"\] strong[\s\S]*white-space:\s*normal!important/,
  'event names wrap at 390px',
);
assert.doesNotMatch(
  css,
  /\[data-shared-live-tab="events"\] \[data-ts-list-row-name="1"\] strong[\s\S]*text-overflow:\s*ellipsis!important/,
  'event names must not ellipsis-clip at 390px',
);
assert.match(bundle, /data-shared-live-tab":"events"/, 'served bundle must mark events tab panel for mobile CSS');

console.log('shared events 390px name wrap contract OK');
