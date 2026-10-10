import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { TREK_SHARED_DAY_MAP_TILE_URL } from '../src/vacation/trek-default-map-tiles.mjs';
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
assert.match(committed, /Rn=Bs\(rr\(G\)\|\|String\(G\.description\|\|G\.notes\|\|""\)\.replace\(\/\\s\+\/g," "\)\.trim\(\)\)/);
assert.match(committed, /data-row-video-qr":"1"/);
assert.match(committed, /zr\.length\?n\.jsx\(Nr,\{items:zr/);
assert.match(committed, /data-ts-day-map":"1"/);
assert.match(committed, /gpe,\{center:Ia,zoom:11/);
assert.match(committed, /a\.tile\.opentopomap\.org/);

assert.match(committed, /data-ts-day-map":"1"/);
assert.doesNotMatch(committed, /static-day-map-host/);
assert.match(committed, /gpe,\{center:Ia,zoom:11/);
assert.match(committed, /La\.map\(G=>n\.jsx\(zx,\{position:\[G\.lat,G\.lng\],icon:mDe\(G\),eventHandlers:\{click:\(\)=>Ne\(Qt\(G\)\)\}/);
assert.match(committed, new RegExp(`${TREK_SHARED_DAY_MAP_TILE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
assert.match(committed, /© OpenStreetMap contributors/);

const dayMapStart = committed.indexOf('{"data-ts-day-map":"1"');
assert.ok(dayMapStart >= 0, 'day map marker');
const dayMapEnd = committed.indexOf('q==="plan"&&Ki&&(()=>{const G=Ki', dayMapStart);
assert.ok(dayMapEnd > dayMapStart, 'day map block end');
const dayMapBlock = committed.slice(dayMapStart, dayMapEnd);
assert.doesNotMatch(dayMapBlock, /tsKickDayMapTiles\(this\)/);
assert.doesNotMatch(dayMapBlock, /tile\.opentopomap\.org/);
assert.doesNotMatch(dayMapBlock, /openstreetmap\.de/);
assert.doesNotMatch(dayMapBlock, /openstreetmap\.fr\/hot/);

console.log('itinerary fresh day-by-day bundle checks passed');
