#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { patchSharedLayoutOverflow } from '../src/vacation/trek-shared-layout-patches.mjs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

const GUARD = '!ua.endTime&&!ua.isConflict?n.jsx("div",{"data-ts-timeline-time":"1"';
const TWO_LINE_CELL = 'n.jsxs("div",{style:{fontSize:11,fontWeight:700,color:ua.isConflict?"#b91c1c":ua.time?"#111827":"#9ca3af",textAlign:"right",paddingTop:Zn?8:2},children:[ua.time?Yo(ua.time):("T"+"BD"),ua.endTime?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:Yo(ua.endTime)})]}):null]})';
const WRAP_PLAIN = '}:{paddingTop:1},children:[ua.isConflict&&n.jsxs(';

assert.equal(bundle.split(GUARD).length - 1, 1, 'served bundle has one single-line time branch');
assert.equal(bundle.split(TWO_LINE_CELL).length - 1, 1, 'two-line time cell stays byte-identical');
const start = bundle.indexOf(GUARD);
const twoLineAt = bundle.indexOf(TWO_LINE_CELL, start);
const singleLine = bundle.slice(start, twoLineAt);
assert.ok(singleLine.endsWith(':'), 'single-line branch falls through to the two-line cell');
assert.ok(singleLine.length < 400, 'single-line branch sits directly before the two-line cell');

const grid = bundle.slice(bundle.lastIndexOf('n.jsxs("div",{style:{', start), start);
assert.match(grid, /display:"grid",gridTemplateColumns:"[^"]+",gap:\d+,alignItems:"start"/, 'time cell and title wrapper share one grid row');

const cell = singleLine.match(/^!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1",style:\{([^}]*)\},children:ua\.time\?Yo\(ua\.time\):\("T"\+"BD"\)\}\):$/);
assert.ok(cell, 'single-line time cell is marked and shows TBD when start time is missing');
assert.match(cell[1], /(^|,)alignSelf:"baseline"(,|$)/, 'time cell sits on the grid row baseline');
assert.match(cell[1], /fontSize:11,fontWeight:700/, 'time text keeps the two-line cell font');
assert.match(cell[1], /textAlign:"right"/, 'time stays right aligned');
assert.match(cell[1], /whiteSpace:"nowrap"/, 'single-line time never wraps');
assert.match(cell[1], /color:ua\.time\?"#111827":"#9ca3af"/, 'untimed rows keep the muted time color');
assert.doesNotMatch(cell[1], /padding|margin|top|transform|position|lineHeight/i, 'no pixel nudges: the baseline comes from layout');

const wrap = bundle.match(/style:ua\.isConflict\?\{([^}]*)\}:\{paddingTop:1,alignSelf:(!ua\.endTime&&!ua\.isConflict\?"baseline":"start")\},children:\[ua\.isConflict&&n\.jsxs\(/);
assert.ok(wrap, 'title wrapper joins the baseline group on single-line rows');
assert.equal(bundle.split(WRAP_PLAIN).length - 1, 0, 'no unpatched title wrapper is left');
assert.doesNotMatch(wrap[1], /alignSelf/, 'conflict wrapper keeps its own alignment');
assert.match(bundle, /"data-ts-timeline-title":"1",onClick:\(\)=>Ne\(Qt\(ua\.item\)\),style:\{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1\.15,/, 'title button style is unchanged');

function render(row) {
  const el = (type, props) => ({ type, props });
  const n = { jsx: el, jsxs: el, Fragment: 'Fragment' };
  const Yo = (t) => `fmt:${t}`;
  const Zn = !row.time;
  return new Function('n', 'Yo', 'ua', 'Zn', `return ${singleLine}${TWO_LINE_CELL}`)(n, Yo, row, Zn);
}
const wrapAlign = (row) => new Function('ua', `return ${wrap[2]}`)(row);

const single = render({ time: '12:00', isConflict: false });
assert.equal(single.props['data-ts-timeline-time'], '1', 'single-line row renders the baseline cell');
assert.equal(single.props.style.alignSelf, 'baseline', 'single-line time is baseline aligned');
assert.equal(single.props.children, 'fmt:12:00', 'single-line row shows the formatted time');
assert.equal(wrapAlign({ time: '12:00', isConflict: false }), 'baseline', 'single-line title wrapper is baseline aligned');

const twoLine = render({ time: '05:05', endTime: '15:45', isConflict: false });
assert.equal(twoLine.props['data-ts-timeline-time'], undefined, 'two-line row keeps the original cell');
assert.equal(twoLine.props.style.paddingTop, 2, 'two-line row keeps its padding');
assert.equal(twoLine.props.style.alignSelf, undefined, 'two-line time keeps the row start alignment');
assert.equal(twoLine.props.children[1].props.children[0].type, 'br', 'two-line row keeps the line break');
assert.equal(wrapAlign({ time: '05:05', endTime: '15:45', isConflict: false }), 'start', 'two-line title wrapper keeps the row start alignment');

const conflict = render({ time: '17:00', isConflict: true });
assert.equal(conflict.props['data-ts-timeline-time'], undefined, 'conflict row keeps the original cell');

const untimed = render({ time: '', isConflict: false });
assert.equal(untimed.props['data-ts-timeline-time'], '1', 'row with no time uses the baseline cell');
assert.equal(untimed.props.style.alignSelf, 'baseline', 'untimed row is baseline aligned');
assert.equal(untimed.props.children, 'TBD', 'row with no time shows TBD via concat');
assert.equal(untimed.props.style.color, '#9ca3af', 'untimed row keeps the muted time color');
assert.equal(wrapAlign({ time: '', isConflict: false }), 'baseline', 'untimed title wrapper is baseline aligned');

assert.equal(patchSharedLayoutOverflow(bundle, { served: true }), bundle, 'patch is idempotent on the served bundle');
const bare = bundle.replace(singleLine, '').replace(wrap[0], wrap[0].replace(`,alignSelf:${wrap[2]}`, ''));
assert.ok(bare.includes(WRAP_PLAIN), 'bare bundle has the plain title wrapper');
assert.equal(patchSharedLayoutOverflow(bare, { served: true }), bundle, 'patch inserts the branch and the wrapper baseline');
assert.throws(() => patchSharedLayoutOverflow(bare.replace(TWO_LINE_CELL, ''), { served: true }), /single-line time patch did not apply/);
assert.throws(() => patchSharedLayoutOverflow(bare.replace(WRAP_PLAIN, '}:{},children:[ua.isConflict&&n.jsxs('), { served: true }), /title baseline patch did not apply/);

console.log('timeline single-line time tests passed');
