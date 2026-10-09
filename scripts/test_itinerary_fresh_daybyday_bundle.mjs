import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed);

assert.match(committed, /data-summary-thing-only":"1","data-summary-src":"thing"/);
assert.match(committed, /data-summary-stored":"1"/);
assert.match(committed, /data-ts-list-row-name":"1"/);
assert.match(committed, /Rn=Bs\(rr\(G\)\)/);
assert.match(committed, /data-row-video-qr":"1"/);
assert.match(committed, /zr\.length\?n\.jsx\(Nr,\{items:zr/);
assert.match(committed, /data-ts-day-map":"1"/);
assert.match(committed, /gpe,\{center:Ia,zoom:11[\s\S]{0,400}tile\.opentopomap\.org/);
assert.match(committed, /a\.tile\.opentopomap\.org/);

console.log('itinerary fresh day-by-day bundle checks passed');
