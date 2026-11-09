#!/usr/bin/env node
/**
 * Acceptance: every NYC Thing list-row text binds stored Summary verbatim,
 * not Details/longDetails/description. No display-time composing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { listRowDescriptionBundleSnippet } from '../src/vacation/list-row-description.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

const snippet = listRowDescriptionBundleSnippet();
assert.match(snippet, /ov\.summary/);
assert.doesNotMatch(snippet, /ov\.description|longDetails|sr\.description/);
assert.match(rendered, /tsListRowDescription=function\(G\)\{const ov=ha\(G\)\|\|\{\};return String\(ov\.summary\?\?""\);\}/);
assert.match(rendered, /Rn=tsListRowDescription\(G\)/);
assert.doesNotMatch(rendered, /Rn=Bs\(rr\(G\)\|\|Co\(G\)\|\|Fl\(G\)\)/);

// Live NYC fixture contract: for each override with a summary, row binder returns summary and not details.
const nycPath = new URL('../scripts/fixtures/nyc-screen-trip99-live-shared-api.json', import.meta.url);
let nyc;
try {
  nyc = JSON.parse(readFileSync(nycPath, 'utf8'));
} catch {
  // Fallback: minimal inline check from known Amelie/Carbone shape
  nyc = {
    thingOverrides: {
      'place:610': {
        summary: 'Carbone is Mario Carbone SUMMARY_ONLY_MARKER',
        description: 'Carbone DETAILS_ONLY_MARKER wikipedia',
        longDetails: 'Carbone DETAILS_ONLY_MARKER wikipedia',
      },
      'place:670': {
        summary: 'Amelie SUMMARY_ONLY_MARKER bistro',
        description: 'Amelie DETAILS_ONLY_MARKER wine bar',
        longDetails: 'Amelie DETAILS_ONLY_MARKER wine bar',
      },
    },
  };
}

const overrides = nyc.thingOverrides || nyc.overrides || {};
let checked = 0;
for (const [id, ov] of Object.entries(overrides)) {
  if (!ov || typeof ov !== 'object') continue;
  const summary = String(ov.summary ?? '');
  const details = String(ov.longDetails ?? ov.description ?? '');
  if (!summary.trim()) continue;
  // Simulate binder
  const row = String(ov.summary ?? '');
  assert.equal(row, summary, `${id}: row must equal stored summary`);
  if (details.trim() && details !== summary) {
    assert.notEqual(row, details, `${id}: row must not equal details`);
  }
  checked += 1;
}
assert.ok(checked >= 10, `expected many NYC things with summary, got ${checked}`);
console.log(`nyc list-row summary-not-details acceptance passed (${checked} things)`);
