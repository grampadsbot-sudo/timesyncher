#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

assert.match(rendered, /"data-ts-detail-overall-rating-label":"1"/);
assert.match(rendered, /children:"Overall Rating:"/);
assert.match(rendered, /"data-ts-detail-logo-chip":"1"/);
assert.match(
  rendered,
  /"data-ts-detail-rating-row":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"space-between"/,
);
assert.match(
  rendered,
  /"data-ts-detail-header-stars":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"flex-start"/,
);
assert.doesNotMatch(
  rendered,
  /"data-ts-detail-rating-row":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"center",columnGap:12/,
  'legacy centered rating row must be gone',
);

const ratingRow = rendered.indexOf('"data-ts-detail-rating-row":"1"');
const priceField = rendered.indexOf('"data-ts-detail-field":"price"');
assert.ok(ratingRow > 0 && priceField > ratingRow);
const rowStart = rendered.lastIndexOf('(()=>{const tsHeadStars=', ratingRow);
const rowEnd = rendered.indexOf('})()', priceField) + 4;
const jsx = (type, props) => ({ type, props });
const renderRow = new Function('n', 'Dt', 'ha', 'tsRenderStarRatingHtml', 'tsPrimaryPlaceStarRating', 'Ce', 'Sa', 'bi', 'Xa', `return ${rendered.slice(rowStart, rowEnd)}`);
const textOf = (node) =>
  node == null || node === false
    ? ''
    : typeof node !== 'object'
      ? String(node)
      : Array.isArray(node)
        ? node.map(textOf).join('')
        : textOf(node.props?.children);
const row = renderRow({ jsx, jsxs: jsx, Fragment: jsx }, {}, () => ({ price: 48 }), () => '<svg></svg>', () => 4.5, false, false);
assert.equal(row.props['data-ts-detail-rating-row'], '1');
assert.equal(row.props.style.justifyContent, 'space-between');
const [leftCluster, priceSpan] = row.props.children;
const label = leftCluster.props.children[0];
const stars = leftCluster.props.children[1];
assert.equal(label.props['data-ts-detail-overall-rating-label'], '1');
assert.equal(textOf(label), 'Overall Rating:');
assert.equal(stars.props['data-ts-detail-header-stars'], '1');
assert.equal(priceSpan.props['data-ts-detail-field'], 'price');
assert.equal(textOf(priceSpan), 'Price: $48');

const writes = [];
const editing = renderRow({ jsx, jsxs: jsx }, {}, () => ({ price: 48 }), () => '<svg></svg>', () => 4.5, true, true, () => 48, (place, key, value) => writes.push({ key, value }));
const editor = editing.props.children[1];
assert.equal(editor.type, 'label');
const input = editor.props.children[1];
assert.equal(input.props['aria-label'], 'Price');
assert.equal(input.props.value, 48);
input.props.onChange({ target: { value: '72' } });
assert.deepEqual(writes, [{ key: 'price', value: '72' }]);

console.log('issue #964 detail overall rating row checks passed');
