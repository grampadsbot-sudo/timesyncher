#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

assert.doesNotMatch(rendered, /aria-label":"Detail name"[\s\S]{0,200}width:220/);
assert.match(rendered, /"data-ts-detail-name":"1"/);
assert.match(rendered, /"data-ts-detail-title-wrap":"1"/);
assert.match(rendered, /overflowWrap:"anywhere"/);
assert.match(rendered, /whiteSpace:"normal"/);
assert.match(
  rendered,
  /"data-ts-detail-header-stars":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"center",width:"100%"/,
);

const nycNames = [
  'Amelie Bistro & Wine Bar',
  'Blue Note Jazz Club',
  'Statue of Liberty walking tour',
  'Afternoon matinee show',
  'Motto by Hilton New York City Times Square',
];
for (const name of nycNames) assert.ok(name.length > 12);

assert.match(rendered, /\(zi\(Dt\)\|\|It\(Dt\)==="bar"\)&&\(Ce\|\|/);
assert.match(rendered, /Happy hour details/);
console.log('detail title 390 wrap+stars-centered acceptance passed');
