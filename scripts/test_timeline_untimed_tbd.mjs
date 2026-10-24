#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');

const GUARD = '!ua.endTime&&!ua.isConflict?n.jsx("div",{"data-ts-timeline-time":"1"';
const TWO_LINE_CELL = 'n.jsxs("div",{style:{fontSize:11,fontWeight:700,color:ua.isConflict?"#b91c1c":ua.time?"#111827":"#9ca3af",textAlign:"right",paddingTop:Zn?8:2},children:[ua.time?Yo(ua.time):("T"+"BD"),ua.endTime?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:Yo(ua.endTime)})]}):null]})';

const start = bundle.indexOf(GUARD);
assert.ok(start >= 0, 'live day timeline exposes the baseline time branch');
const singleLine = bundle.slice(start, bundle.indexOf(TWO_LINE_CELL, start));

function renderLiveTimeCell(row) {
  const el = (type, props) => ({ type, props });
  const n = { jsx: el, jsxs: el, Fragment: 'Fragment' };
  const Yo = (t) => `fmt:${t}`;
  const Zn = !row.time;
  return new Function('n', 'Yo', 'ua', 'Zn', `return ${singleLine}${TWO_LINE_CELL}`)(n, Yo, row, Zn);
}

const sleepLive = renderLiveTimeCell({ time: '', endTime: '', isConflict: false });
assert.equal(sleepLive.props.children, 'TBD', 'untimed Sleep row shows TBD in the live time column');
assert.equal(sleepLive.props['data-ts-timeline-time'], '1', 'untimed Sleep row uses the baseline time cell');

assert.match(bundle, /<div class="time">\$\{Zn\.time\?an\(Yo\(Zn\.time\)\):\("T"\+"BD"\)\}/, 'Style two centered print rows show TBD without a start time');
assert.match(bundle, /<div class="time">\$\{_i\.time\?an\(Yo\(_i\.time\)\):\("T"\+"BD"\)\}/, 'Style one daily print rows show TBD without a start time');

const printTimeCell = new Function(
  'Zn',
  'an',
  'Yo',
  'return `<div class="time">${Zn.time?an(Yo(Zn.time)):("T"+"BD")}${Zn.endTime?`<br /><span class="end-time">${an(Yo(Zn.endTime))}</span>`:""}</div>`;',
);
const sleepPrint = printTimeCell(
  { time: '', endTime: '', title: 'Sleep: The Plaza Hotel', type: 'hotel-sleep' },
  (v) => v,
  (v) => v,
);
assert.equal(sleepPrint, '<div class="time">TBD</div>', 'untimed Sleep print row shows TBD in the time column');
assert.match(bundle, /hotel-sleep/, 'served bundle still renders hotel-sleep timeline rows');

console.log('timeline untimed TBD tests passed');
