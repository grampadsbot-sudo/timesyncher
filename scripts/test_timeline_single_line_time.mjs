#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { patchSharedLayoutOverflow } from '../src/vacation/trek-shared-layout-patches.mjs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

const GUARD = 'ua.time&&!ua.endTime&&!ua.isConflict?';
const TWO_LINE_CELL = 'n.jsxs("div",{style:{fontSize:11,fontWeight:700,color:ua.isConflict?"#b91c1c":ua.time?"#111827":"#9ca3af",textAlign:"right",paddingTop:Zn?8:2},children:[ua.time?Yo(ua.time):"",ua.endTime?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:Yo(ua.endTime)})]}):null]})';

assert.equal(bundle.split(GUARD).length - 1, 1, 'served bundle has one single-line time branch');
assert.equal(bundle.split(TWO_LINE_CELL).length - 1, 1, 'two-line time cell stays byte-identical');
const start = bundle.indexOf(GUARD);
const twoLineAt = bundle.indexOf(TWO_LINE_CELL, start);
const singleLine = bundle.slice(start, twoLineAt);
assert.ok(singleLine.endsWith(':'), 'single-line branch falls through to the two-line cell');
assert.ok(singleLine.length < 600, 'single-line branch sits directly before the two-line cell');

const titleStyle = bundle.match(/"data-ts-timeline-title":"1",onClick:\(\)=>Ne\(Qt\(ua\.item\)\),style:\{[^}]*?fontSize:(\d+),fontWeight:(\d+),lineHeight:([\d.]+),/);
assert.ok(titleStyle, 'timeline title style is readable');
const [, titleSize, titleWeight, titleLineHeight] = titleStyle;
const titlePad = bundle.match(/paddingRight:10,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,minWidth:0,width:"100%",boxSizing:"border-box"\}:\{paddingTop:(\d+)\}/);
assert.ok(titlePad, 'timeline title wrapper padding is readable');

const cell = singleLine.match(/^ua\.time&&!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1",style:\{([^}]*)\}/);
assert.ok(cell, 'single-line time cell is marked');
assert.match(cell[1], new RegExp(`(^|,)paddingTop:${titlePad[1]}(,|$)`), 'time cell padding matches the title wrapper');
assert.doesNotMatch(cell[1], /fontSize|lineHeight/, 'time cell inherits the row font so its strut matches the title wrapper');

const line = singleLine.match(/"data-ts-timeline-time-line":"1",style:\{([^}]*)\}/);
assert.ok(line, 'single-line time line box is marked');
assert.match(line[1], /display:"inline-block"/, 'line box is an inline-block like the title button');
assert.match(line[1], new RegExp(`fontSize:${titleSize},fontWeight:${titleWeight},lineHeight:"${titleLineHeight}em"`), 'line box uses the title font size, weight and line height');
assert.match(line[1], /position:"relative",width:"100%"/, 'line box spans the time column');

const text = singleLine.match(/children:\["\\u00a0",n\.jsx\("span",\{style:\{([^}]*)\},children:Yo\(ua\.time\)\}\)\]/);
assert.ok(text, 'line box holds a text strut and the time text');
assert.match(text[1], /position:"absolute",top:0,right:0/, 'time text sits on the line box first line, right aligned');
assert.match(text[1], /fontSize:11,fontWeight:700/, 'time text keeps the two-line cell font');
assert.match(text[1], /whiteSpace:"nowrap"/, 'single-line time never wraps');
assert.doesNotMatch(text[1], /lineHeight/, 'time text inherits the title line height');

function render(row) {
  const el = (type, props) => ({ type, props });
  const n = { jsx: el, jsxs: el, Fragment: 'Fragment' };
  const Yo = (t) => `fmt:${t}`;
  const Zn = !row.time;
  return new Function('n', 'Yo', 'ua', 'Zn', `return ${singleLine}${TWO_LINE_CELL}`)(n, Yo, row, Zn);
}

const single = render({ time: '12:00', isConflict: false });
assert.equal(single.props['data-ts-timeline-time'], '1', 'single-line row renders the aligned cell');
assert.equal(single.props.children.props.children[1].props.children, 'fmt:12:00', 'single-line row shows the formatted time');

const twoLine = render({ time: '05:05', endTime: '15:45', isConflict: false });
assert.equal(twoLine.props['data-ts-timeline-time'], undefined, 'two-line row keeps the original cell');
assert.equal(twoLine.props.style.paddingTop, 2, 'two-line row keeps its padding');
assert.equal(twoLine.props.style.fontSize, 11, 'two-line row keeps its font size');
assert.equal(twoLine.props.children[1].props.children[0].type, 'br', 'two-line row keeps the line break');

const conflict = render({ time: '17:00', isConflict: true });
assert.equal(conflict.props['data-ts-timeline-time'], undefined, 'conflict row keeps the original cell');

const untimed = render({ time: '', isConflict: false });
assert.equal(untimed.props['data-ts-timeline-time'], undefined, 'row with no time keeps the original cell');
assert.equal(untimed.props.style.paddingTop, 8, 'row with no time keeps its padding');

assert.equal(patchSharedLayoutOverflow(bundle, { served: true }), bundle, 'patch is idempotent on the served bundle');
const bare = bundle.replace(singleLine, '');
assert.equal(patchSharedLayoutOverflow(bare, { served: true }), bundle, 'patch inserts the branch before the two-line cell');
assert.throws(() => patchSharedLayoutOverflow(bare.replace(TWO_LINE_CELL, ''), { served: true }), /single-line time patch did not apply/);

console.log('timeline single-line time tests passed');
