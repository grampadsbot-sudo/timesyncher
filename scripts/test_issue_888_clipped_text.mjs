#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISSUE_888_SERVED_LAYOUT_CSS,
  SHARED_LIVE_CONFLICT_LAYOUT_CSS,
  SHARED_LIVE_FLIGHT_LOGO_NAME_CSS,
} from '../src/vacation/shared-trip-oe-list-row-patch.mjs';
import { ellipsisClippedTextHelperSource } from './shepherd-staging-smoke-layout-overflow.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const patchSource = readFileSync(path.join(root, 'src/vacation/trek-live-product-patches.mjs'), 'utf8');
const rowPatchSource = readFileSync(path.join(root, 'src/vacation/shared-trip-oe-list-row-patch.mjs'), 'utf8');
const appHtml = readFileSync(path.join(root, 'vacation-app.html'), 'utf8');
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const clientCss = readFileSync(path.join(root, 'apps/vacation-client/src/styles.css'), 'utf8');
const layoutEval = readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-eval.mjs'), 'utf8');

assert.match(rowPatchSource, /data-ts-flight-time":"1"/);
assert.doesNotMatch(
  rowPatchSource,
  /data-ts-flight-time":"1"[\s\S]{0,120}textOverflow:"ellipsis"/,
  'flight depart/arrive chips must not ellipsis-clip',
);
assert.match(
  patchSource,
  /const CONFLICT_LABEL_PATCH = 'ua\.isConflict[\s\S]*flexWrap:"wrap"[\s\S]*overflow:"visible"/,
);

assert.match(rowPatchSource, /data-ts-flight-row-grid":"1"/);
assert.match(rowPatchSource, /minWidth:"max-content"/);
assert.doesNotMatch(rowPatchSource, /data-ts-flight-row-grid":"1"[\s\S]{0,200}flexWrap:"wrap"/);

assert.match(appHtml, /function tripDates\(trip\)/);
assert.match(appHtml, /\$\{start\.mon\} \$\{start\.d\}–\$\{end\.d\}, \$\{start\.y\}/);
assert.match(appHtml, /trip-trigger-text/);
assert.doesNotMatch(appHtml, /\.trip-button span \{[\s\S]*text-overflow: ellipsis/);
assert.match(appHtml, /\.trip-option b,\s*\n\s*\.trip-option small \{[\s\S]*white-space: normal/);

assert.match(css, /\[data-ts-flight-time="1"\]/);
assert.match(css, /\[data-ts-conflict-label="1"\]/);
assert.ok(css.includes(SHARED_LIVE_FLIGHT_LOGO_NAME_CSS), 'served flight logo+name CSS must match patch SoT');
assert.ok(css.includes(SHARED_LIVE_CONFLICT_LAYOUT_CSS), 'served conflict label CSS must match patch SoT');
assert.ok(css.includes(ISSUE_888_SERVED_LAYOUT_CSS), 'served #888 layout CSS block must match patch SoT');
assert.match(
  rowPatchSource,
  /Zn=bn\(G\)\?n\.jsx\("strong",\{style:\{lineHeight:1,display:"block",fontWeight:800/,
  'flight list row name must stay airline-only strong for Gate B name line',
);
assert.doesNotMatch(rowPatchSource, /OE_ROW_ZN_STRONG_PATCH = 'Zn=bn\(G\)\?n\.jsx\(Qo/);

assert.match(clientCss, /\.tsv-timeline-conflict \{[\s\S]*?white-space: normal[\s\S]*?overflow-wrap: anywhere/);

assert.match(ellipsisClippedTextHelperSource(), /tsSampleEllipsisClippedOwnText/);
assert.match(layoutEval, /ellipsis_text_clipped/);

assert.match(
  readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-nyc.mjs'), 'utf8'),
  /ellipsisClippedCount/,
);
assert.match(
  readFileSync(path.join(root, 'scripts/shepherd-staging-smoke-layout-nyc.mjs'), 'utf8'),
  /ellipsis_text_clipped count=/,
);

console.log('issue #888 clipped-text + switcher date format harness passed');
