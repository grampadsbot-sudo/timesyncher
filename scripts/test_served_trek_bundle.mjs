import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { OTHER_THINGS_BUCKET } from '../src/vacation/budget-bucket-keys.mjs';
import { LIST_LOGO_QR_GUARD_PATCH } from '../src/vacation/trek-list-logo-qr-patch.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import {
  BUDGET_BUCKET_CLASSIFIER_PATCH,
  BUDGET_CATEGORIES_PATCH,
  extractUpstreamMiscBucketLabel,
} from '../src/vacation/trek-budget-upstream-misc-patch.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const UPSTREAM_SHA256 = '014eedf20ccfdf2694bdf0c89aec4ddc20db93748872359208695616a9f3c198';

const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 20 * 1024 * 1024,
});
assert.equal(createHash('sha256').update(raw).digest('hex'), UPSTREAM_SHA256);

const upstreamJs = raw.toString('utf8');
const upstreamMiscLabel = extractUpstreamMiscBucketLabel(upstreamJs);
assert.ok(upstreamMiscLabel, 'upstream bundle must expose misc bucket label');
assert.notEqual(upstreamMiscLabel, OTHER_THINGS_BUCKET);
assert.match(upstreamJs, new RegExp(`Hotel":"${upstreamMiscLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));

const rendered = renderServedTrekBundle(upstreamJs);
assert.equal(rendered.includes('getAppConfig'), false);
assert.match(rendered, new RegExp(BUDGET_BUCKET_CLASSIFIER_PATCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(rendered, new RegExp(BUDGET_CATEGORIES_PATCH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(
  rendered,
  new RegExp(`Stores","${upstreamMiscLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
);
assert.doesNotMatch(
  rendered,
  new RegExp(`di==="${upstreamMiscLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"&&!fr.includes\\("entertainment"\\)`),
);

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

assert.ok(rendered.includes(LIST_LOGO_QR_GUARD_PATCH));
assert.match(rendered, /"data-ts-logo-chip":"1","aria-hidden":"true",style:\{width:Re,height:Re/);
assert.match(rendered, /className:"tiny-logo",src:zt,alt:""/);
assert.match(rendered, /tsLogoFallback/);
assert.match(rendered, /tsv-logo-fallback/);
assert.match(rendered, /ic&&ic!=="\?"\?ic:wl\(G\)/);
assert.match(rendered, /i==="car"\?"🚗"/);
assert.match(rendered, /"data-list-row":"1","data-has-logo":tsRowHasLogo/);
assert.doesNotMatch(rendered, /children:\[n\.jsx\("span",\{children:ua\}\),zt&&n\.jsx\("img"/);
assert.doesNotMatch(rendered, /LIST_LOGO_PATCH|ts-thing-media\\\/\)\|\|/);

console.log('served trek bundle matches the patcher');
