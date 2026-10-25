#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));

assert.match(rendered, /tsRenderStarRatingHtml=v=>/);
assert.match(rendered, /tsParseStarRating=raw=>/);
assert.match(rendered, /data-ts-review-stars/);
assert.match(rendered, /data-ts-list-row-rating/);
assert.match(rendered, /data-ts-detail-rating-stars/);
assert.match(rendered, /tsPrimaryPlaceStarRating\(ha\(G\)\)/);
assert.match(rendered, /fill="#f59e0b"/);
const oeIdx = rendered.indexOf('Oe=(G,Re,zt=!1)=>');
assert.ok(oeIdx >= 0, 'Oe list row renderer missing');
const oeBody = rendered.slice(oeIdx, oeIdx + 1400);
const varsIdx = oeBody.indexOf('tsRowRating=tsPrimaryPlaceStarRating');
const srIdx = oeBody.indexOf('sr=n.jsxs');
assert.ok(varsIdx >= 0 && srIdx >= 0 && varsIdx < srIdx, 'tsRowRating must be declared before sr= in Oe()');
assert.doesNotMatch(rendered, /review-stars-inline">★★★★★<\/span>/);
assert.match(rendered, /\.ts-star-rating\{display:inline-flex/);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must match renderServedTrekBundle');

console.log('served star rating bundle tests passed');
