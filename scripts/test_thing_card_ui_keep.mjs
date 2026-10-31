#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { renderStarRatingHtml } from '../src/vacation/star-rating-model.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

const stars = renderStarRatingHtml(4.5);
assert.match(stars, /flex-direction:row/);
assert.match(stars, /flex-wrap:nowrap/);
assert.match(rendered, /style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center/);

assert.match(rendered, /data-ts-thing-header":"1",style:\{display:"grid",gridTemplateColumns:"minmax\(0,1fr\) auto minmax\(0,1fr\)",alignItems:"center"/);
assert.match(rendered, /data-ts-logo-name-pair":"1",style:\{display:"inline-flex",alignItems:"center",justifyContent:"center"/);
assert.match(rendered, /data-ts-list-row-rating":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"flex-end"/);
assert.doesNotMatch(rendered, /data-ts-list-row-rating":"1"[\s\S]{0,80}flexDirection:"column"/);
assert.match(rendered, /data-ts-detail-header-stars":"1"/);
assert.match(rendered, /data-ts-thing-review-line":"1"/);
assert.match(rendered, /tsThingReviewLines=G=>/);
assert.match(rendered, /data-ts-thing-review="1"/);

assert.match(
  rendered,
  /Mo=Array\.from\(new Map\(Qa\.flatMap\(di=>Ci\(di\)\)\.filter\(di=>\(di==null\?void 0:di\.item\)&&!\[/,
);
assert.doesNotMatch(rendered, /\]\.concat\(rs,Po,bc,Oc,Fs,Cc\)/);

assert.doesNotMatch(rendered, /children:ot\.map\(G=>\{const Re=or\(Dt\)\.includes\(G\)/);
assert.doesNotMatch(rendered, /children:gt\.map\(G=>\{const Re=vn\(Dt\)\.includes\(G\)/);
assert.match(rendered, /data-ts-cuisine-chips":"1"/);
assert.match(rendered, /data-ts-cuisine-chips-viewer":"1"/);
assert.match(rendered, /data-ts-cuisine-chips-selected":"1"/);
assert.doesNotMatch(rendered, /Restaurant tags \/ chips"[\s\S]{0,1200}children:ot\.map\(G=>\{const Re=or\(Dt\)\.includes\(G\)/);
assert.match(rendered, /!\/\^no happy hour\\b\/i\.test\(raw\)/);
assert.doesNotMatch(
  rendered,
  /\(zi\(Dt\)\|\|It\(Dt\)==="bar"\)&&n\.jsxs\("label",\{style:Hn,children:\["Happy hour details"/,
);

const css = readFileSync(new URL('../public/assets/index-CbEHlMj6.css', import.meta.url), 'utf8');
assert.doesNotMatch(css, /\[data-shared-live-tab="hotels"\] \[data-list-summary="1"\]\{white-space:nowrap!important/);
assert.match(css, /\.ts-star-rating\{display:inline-flex!important;flex-direction:row!important/);
assert.match(
  rendered,
  /"data-list-summary":"1","data-summary-src":"thing",style:\{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,whiteSpace:"normal"/,
);

console.log('thing card ui keep checks passed');
