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
assert.match(committed, /gridTemplateColumns:"28px minmax\(0, 1fr\)"/);
assert.doesNotMatch(committed, /minHeight:28},children:Zn}\)\]\}\),Xr=fo/);
assert.match(
  committed,
  /Zi\(G\)\?n\.jsx\(je,\{item:G,title:ua\}\):n\.jsx\("strong",\{children:ua\}\)/,
);
assert.match(committed, /Rn=Bs\(rr\(G\)\)/);
assert.match(committed, /data-row-video-qr":"1"/);
assert.match(committed, /zr\.length\?n\.jsx\(Nr,\{items:zr/);
assert.match(committed, /data-ts-day-map":"1"/);
assert.match(committed, /gpe,\{center:Ia,zoom:11/);
assert.match(committed, /a\.tile\.opentopomap\.org/);

const singleTimeGuard = 'ua.time&&!ua.endTime&&!ua.isConflict?';
const originalTimeCell = 'n.jsxs("div",{style:{fontSize:11,fontWeight:700,color:ua.isConflict?"#b91c1c":ua.time?"#111827":"#9ca3af",textAlign:"right",paddingTop:Zn?8:2},children:[ua.time?Yo(ua.time):"",ua.endTime?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:Yo(ua.endTime)})]}):null]})';
assert.equal(committed.split(singleTimeGuard).length - 1, 1);
assert.equal(committed.split(originalTimeCell).length - 1, 1);
const singleTimeStart = committed.indexOf(singleTimeGuard);
const singleTimeBranch = committed.slice(singleTimeStart, committed.indexOf(originalTimeCell, singleTimeStart));
assert.match(singleTimeBranch, /fontSize:11,fontWeight:700/);
assert.match(singleTimeBranch, /whiteSpace:"nowrap",alignSelf:"baseline"/);
assert.doesNotMatch(singleTimeBranch, /padding|margin|top|transform|position|lineHeight/i);
assert.match(committed, /\}:\{paddingTop:1,alignSelf:ua\.time&&!ua\.endTime\?"baseline":"start"\},children:\[ua\.isConflict/);

console.log('itinerary fresh day-by-day bundle checks passed');
