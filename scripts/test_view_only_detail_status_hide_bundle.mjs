#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { patchViewOnlyDetailEditStatus } from '../src/vacation/trek-view-only-detail-status-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const BUNDLE_PATH = new URL('../public/assets/index-BKun7ofk.js', import.meta.url);

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
}).toString('utf8');

const rendered = renderServedTrekBundle(raw);
const committed = await readFile(BUNDLE_PATH, 'utf8');

assert.doesNotMatch(rendered, /View-only — editing requires an approved email invite/);
assert.equal(rendered.split('"data-ts-detail-edit-status":"1"').length - 1, 1);
assert.match(
  rendered,
  /\(He\|\|Ce\)&&n\.jsx\("div",\{"data-ts-detail-edit-status":"1"/,
);
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle');

const upstreamSnippet = raw.includes('View-only — editing requires an approved email invite')
  ? raw
  : committed;
assert.ok(
  patchViewOnlyDetailEditStatus(upstreamSnippet).includes('"data-ts-detail-edit-status":"1"'),
  'view-only detail status patch applies on upstream or pre-patch bundle',
);

console.log('view-only detail status line hidden in served bundle');
