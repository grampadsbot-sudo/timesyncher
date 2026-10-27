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
assert.match(rendered, /data-tab-category":G\.id/);
assert.match(rendered, /display:"inline-flex",alignItems:"center",verticalAlign:"middle"\},children:G\.label\}/);
assert.match(rendered, /function tsPaintTabEmoji\(/);
assert.match(rendered, /"data-tab-category":G\.id,"data-ts-category-tab-icon":"1","aria-hidden":"true",style:\{width:16,height:16,minWidth:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,flex:"0 0 16px",alignSelf:"center"\},children:n\.jsx\(G\.Icon,\{size:13\}\)/);
assert.doesNotMatch(rendered, /translateY\(0\.75px\)/);
assert.match(rendered, /if\(label\.style\.display!=="none"\)/);
assert.match(rendered, /AI-assisted vacation itinerary planning/);

const atR20Tip = execFileSync('git', ['show', '9986132:public/assets/index-BKun7ofk.js'], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');
assert.doesNotMatch(atR20Tip, /data-ts-category-tab-icon":"1"/);
assert.match(atR20Tip, /children:G\.icon\}\):n\.jsx\(G\.Icon/);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed, 'committed served bundle must include category tab icon centering patch');

console.log('shared category tab icon center bundle tests passed');
