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

assert.match(rendered, /\[tsDetailEdit,setTsDetailEdit\]=I\.useState\(!1\)/);
assert.match(rendered, /className:"tsv-detail-title-row"/);
assert.match(rendered, /className:"tsv-detail-close"/);
assert.match(rendered, /"aria-label":"Edit thing"/);
assert.match(rendered, /n\.jsx\(Gs,\{size:16\}\)/);
assert.match(rendered, /setTsDetailEdit\(!0\)/);
assert.match(rendered, /Ne\(null\);setTsDetailEdit\(!1\)/);
assert.match(rendered, /Ce&&n\.jsx\("button"/);
assert.match(rendered, /className:"tsv-detail-price"/);
assert.match(rendered, /"data-ts-detail-field":"price"/);
assert.match(rendered, /!tsDetailEdit&&\/\\\$\?\\d\/\.test\(String\(bi\(Dt\)\|\|""\)\)/);
assert.match(rendered, /disabled:!\(Ce&&tsDetailEdit\)/);
assert.match(rendered, /"data-shared-readonly":Ce&&tsDetailEdit\?void 0:"true"/);

console.log('thing detail pencil + price #951 bundle acceptance passed');
