import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { patchThingLogoChipAlignment } from '../src/vacation/trek-live-product-patches.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});

const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.match(rendered, /onError:Rn=>\{.*dataset\.tsLogoFallback/);
assert.match(rendered, /tsCenterThingLogoFallbackEl/);
assert.match(rendered, /className:"tsv-logo-fallback",ref:Rn=>\{Rn&&tsCenterThingLogoFallbackEl\(Rn\)/);
assert.match(rendered, /function tsRepairExplicitLogoUrl\(/);
assert.match(rendered, /className:"tiny-logo","data-logo-src":zt\|\|"",src:tsRepairExplicitLogoUrl\(zt\)\|\|zt,alt:""/);
assert.match(rendered, /function tsCenterThingLogoInk\(/);
assert.match(rendered, /tsCenterThingLogoInk\(Rn\.currentTarget\)/);
assert.doesNotMatch(rendered, /function tsCenterThingLogoFallback\(/);
assert.match(rendered, /function tsCenterThingLogoFallbackEl\(/);
assert.match(rendered, /tsv-logo-fallback/);
assert.match(rendered, /_l=G=>\{if\(qr\(G\)\)return pDe;const Re=ha\(G\);return Re\.logoUrl\|\|Re\.iconUrl\|\|G\.logoUrl\|\|oi\(cc\(G\)\)\}/);
assert.match(rendered, /data-ts-category-tab-icon":"1"/);
assert.match(rendered, /data-ts-map-marker-logo="1" style="width:30px;height:30px;max-width:30px;max-height:30px;overflow:hidden/);
assert.doesNotMatch(rendered, /data-ts-map-marker-logo="1"[^`]{0,80}data-ts-logo-chip/);
assert.match(rendered, /width:26px;height:26px;max-width:26px;max-height:26px;object-fit:contain;border:0;background:transparent;filter:drop-shadow\(0 2px 3px rgba\(0,0,0,0\.30\)\)/);
assert.doesNotMatch(rendered, /translateY\(-0\.5px\)/);

assert.throws(
  () => patchThingLogoChipAlignment('dc=({item:G,size:Re=28})=>{noop}'),
  /missing upstream dc\(\) logo chain/,
);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must include logo chip centering patch');

console.log('shared logo chip center bundle tests passed');
