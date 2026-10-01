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
assert.equal(rendered.includes('Cr.getAppConfig'), false);

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
const Sn = new Function('Ke', 'le', `${sliceBetween(rendered, 'Sn=(G,Re)=>', 'return a&&Ke.includes(a)?a:""}')}; return Sn`)(emptyChips, {});
assert.equal(Sn('', {}), '');
assert.equal(Sn('Unused Label', { id: 2, name: 'Sample Venue' }), '');
assert.equal(Sn('', { id: 1, name: 'Sample Venue', source: { neighborhood: 'Sample Area' } }), 'Sample Area');
const areaSelect = sliceBetween(rendered, '["Area",n.jsx("select"', 'Ke.map(G=>n.jsx("option"');
assert.match(areaSelect, /value:En\(Dt\)/);
assert.equal(areaSelect.includes('selected'), false);

const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed);

console.log('served trek bundle matches the patcher');
