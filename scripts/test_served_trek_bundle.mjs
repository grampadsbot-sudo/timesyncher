import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const UPSTREAM_SHA256 = '014eedf20ccfdf2694bdf0c89aec4ddc20db93748872359208695616a9f3c198';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});
assert.equal(createHash('sha256').update(raw).digest('hex'), UPSTREAM_SHA256);

const rendered = renderServedTrekBundle(raw.toString('utf8'));
assert.equal(rendered.includes('getAppConfig'), false);

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(end >= 0, endMarker);
  return source.slice(start, end + endMarker.length);
}

const chipExpr = sliceBetween(rendered, '(function(){const key=', 'return chips})()');
const emptyChips = new Function('Gt', 'Ut', 'le', `return ${chipExpr}`)([], [], {});
assert.deepEqual(emptyChips, []);
const sourcedChips = new Function('Gt', 'Ut', 'le', `return ${chipExpr}`)(
  [{ id: 1, name: 'Sample Venue', source: { neighborhood: 'Sample Area' } }],
  [{ id: 9, title: 'Sample Walk', neighborhood: 'Other Area' }],
  {},
);
assert.deepEqual(sourcedChips, ['Sample Area', 'Other Area']);
const Ot = (G) => `${G.title || ''} ${G.name || ''} ${G.type || ''} ${G.notes || ''} ${G.description || ''} ${G.address || ''} ${G.place_address || ''}`;
const aaSrc = sliceBetween(rendered, 'aa=G=>', ':""}');
const snSrc = sliceBetween(rendered, 'Sn=(G,Re)=>', 'return named||"Citywide / Flexible"');
const Sn = new Function('Ke', 'le', 'Ot', `${aaSrc}; ${snSrc}}; return Sn`)(emptyChips, {}, Ot);
assert.equal(Sn('', {}), 'Citywide / Flexible');
assert.equal(Sn('Unused Label', { id: 2, name: 'Sample Venue' }), 'Citywide / Flexible');
assert.equal(Sn('', { id: 1, name: 'Arthouse Hotel' }), 'Upper West Side / Lincoln Center');
assert.equal(Sn('', { id: 1, name: 'Sample Venue', source: { neighborhood: 'Sample Area' } }), 'Sample Area');
const areaSelect = sliceBetween(rendered, '["Area",n.jsx("select"', 'Ke.map(G=>n.jsx("option"');
assert.match(areaSelect, /value:En\(Dt\)/);
assert.equal(areaSelect.includes('selected'), false);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed);

assert.match(rendered, /_l=G=>\{if\(qr\(G\)\)return pDe;const Re=ha\(G\);return Re\.logoUrl\|\|Re\.iconUrl\|\|G\.logoUrl\|\|oi\(cc\(G\)\)\}/);
assert.match(rendered, /"data-ts-logo-chip":"1","aria-hidden":"true",style:\{width:Re,height:Re/);
assert.match(rendered, /className:"tiny-logo",src:zt,alt:""/);
assert.match(rendered, /onError:Rn=>\{Rn\.currentTarget\.style\.display="none"\}/);
assert.match(rendered, /i==="car"\?"🚗"/);
assert.match(rendered, /"data-list-row":"1","data-has-logo":tsRowHasLogo/);
assert.doesNotMatch(rendered, /children:\[n\.jsx\("span",\{children:ua\}\),zt&&n\.jsx\("img"/);
assert.doesNotMatch(rendered, /LIST_LOGO_PATCH|ts-thing-media\\\/\)\|\|/);

console.log('served trek bundle matches the patcher');
