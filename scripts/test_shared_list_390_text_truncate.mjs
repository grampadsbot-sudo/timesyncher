#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const snippet = readFileSync(
  path.join(root, 'src/vacation/shared-trip-list-390-truncate.css'),
  'utf8',
).trim();

assert.ok(snippet.length > 0, 'shared-trip-list-390-truncate.css must be non-empty');
assert.match(css, /@media\s*\(\s*max-width:\s*480px\s*\)[\s\S]*li\[data-list-row="1"\][\s\S]*\[data-list-summary="1"\]/);
assert.match(
  css,
  /li\[data-list-row="1"\][\s\S]*\[data-list-summary="1"\][\s\S]*white-space:\s*nowrap!important/,
  'served CSS must single-line ellipsis list summaries at 390px',
);
assert.match(
  css,
  /li\[data-list-row="1"\][\s\S]*\[data-ts-list-row-name="1"\][\s\S]*white-space:\s*nowrap!important/,
  'served CSS must single-line ellipsis list names at 390px',
);
assert.doesNotMatch(
  css,
  /\[data-shared-live-tab="hotels"\][\s\S]*white-space:\s*normal!important/,
  'hotels mobile CSS must not wrap titles',
);

console.log('shared list 390px truncation contract OK');
