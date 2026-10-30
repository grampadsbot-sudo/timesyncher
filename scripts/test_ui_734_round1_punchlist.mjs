#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { boundMediaPlayUrl } from '../src/vacation/thing-media-bind.mjs';
import { patchThingDetailReadonlyBoxes } from '../src/vacation/trek-thing-detail-readonly-patch.mjs';
import { patchUi734Round1 } from '../src/vacation/trek-ui-734-round1-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

assert.equal(
  boundMediaPlayUrl({
    id: 'b1',
    shareToken: 'tok',
    url: 'https://example.com/demo.mp4',
  }),
  '/api/bind-thing-media?shareToken=tok&id=b1&raw=1',
);

assert.equal(
  boundMediaPlayUrl({ url: 'https://carbone.com/clip.mp4' }),
  'https://carbone.com/clip.mp4',
);

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rebaked = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rebaked, committed);

assert.match(committed, /Ce&&n\.jsx\("button",\{type:"button","aria-label":"Edit caption"/);
assert.match(committed, /tsBoundMediaPlayUrl=gr=>/);
assert.match(committed, /tsPlay=tsBoundMediaPlayUrl\(gr\)/);
assert.doesNotMatch(committed, /href:gr\.url,target:"_blank",rel:"noreferrer",style:\{display:"inline-flex",gap:4,alignItems:"center",marginTop:4,fontSize:11,fontWeight:900,color:"#0f766e"/);
assert.match(committed, /ic&&ic!=="\?"\?ic:wl\(G\)/);
assert.match(committed, /ua\.time\?Yo\(ua\.time\):"TBD"/);
assert.match(committed, /data-ts-review-stars":"1"/);
assert.doesNotMatch(committed, /children:\[x\.r,"★"\]/);

const readonlyOnly = patchThingDetailReadonlyBoxes(committed);
assert.doesNotMatch(readonlyOnly, /rev\.length\?n\.jsxs\("div",\{"data-ts-detail-reviews":"1"/);

const uiOnly = patchUi734Round1(committed);
assert.equal(uiOnly, committed);

console.log('ui #734 round1 punchlist checks passed');
