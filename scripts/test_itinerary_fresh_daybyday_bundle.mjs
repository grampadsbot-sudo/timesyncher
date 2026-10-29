import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { itineraryLineText, ITINERARY_LINE_BUNDLE } from '../src/vacation/itinerary-line.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';

const raw = execFileSync('git', ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'], {
  maxBuffer: 30 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(rendered, committed);

assert.match(committed, /data-summary-thing-only":"1","data-summary-src":"thing"/);
assert.match(committed, /data-itinerary-note":"1"/);
assert.match(committed, /tsItinLine\(ua\.item\)/);
assert.doesNotMatch(committed, /children:Bs\(rr\(ua\.item\)\)/);
assert.match(committed, /data-summary-stored":"1"/);
const readLine = new Function('ha', `return (${ITINERARY_LINE_BUNDLE})`)((row) => row);
const downgraded = {
  summary: 'Zabars is the Upper West Side food store at 2245 Broadway, open every day.',
  evidenceDossier: {
    fields: {
      itineraryNote: {
        value: '',
        claims: [{ text: 'Grab the nova and a coffee.', supported: false }],
      },
    },
  },
};
assert.equal(readLine(downgraded), 'Grab the nova and a coffee.');
assert.equal(itineraryLineText(downgraded), 'Grab the nova and a coffee.');
assert.equal(itineraryLineText({ itineraryNote: 'Book the corner booth.', summary: downgraded.summary }), 'Book the corner booth.');
assert.equal(itineraryLineText({ summary: downgraded.summary }), '');
assert.match(committed, /data-ts-list-row-name":"1"/);
assert.match(committed, /data-ts-thing-header":"1",style:\{display:"grid",gridTemplateColumns:"minmax\(0,1fr\) auto minmax\(0,1fr\)",alignItems:"center"/);
assert.match(committed, /data-ts-logo-name-pair":"1"/);
assert.match(committed, /data-ts-list-row-rating":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap"/);
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
assert.match(committed, /ua\.time&&!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.match(committed, /alignSelf:ua\.time&&!ua\.endTime&&!ua\.isConflict\?"baseline":"start"/);
assert.match(committed, /paddingTop:Zn\?8:2/);

const timelineStart = committed.indexOf('return n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(52px,64px)');
const timelineEndMarker = ']},`${ua.type}-${Rn}-${ua.title}`)';
const timelineEnd = committed.indexOf(timelineEndMarker, timelineStart);
assert.ok(timelineStart > 0 && timelineEnd > timelineStart);
const rowExpression = committed.slice(timelineStart, timelineEnd + timelineEndMarker.length);
const jsx = (type, props) => ({ type, props });
const rowFor = new Function('n', 'ua', 'Rn', 'Zn', 'Xr', 'sr', 'zr', 'Pn', 'Yo', 'Bs', 'rr', 'Nr', 'tsItinLine', rowExpression);
const row = (extra = {}) => rowFor({ jsx, jsxs: jsx, Fragment: 'fragment' }, { time: '12:00', title: 'Lunch', type: 'restaurant', item: {}, ...extra }, 0, false, '', '', [], 'Lunch', String, String, () => '', null, () => 'Grab the nova.');
const single = row();
assert.equal(single.props.children[0].props.style.alignSelf, 'baseline');
assert.equal(single.props.children[2].props.style.alignSelf, 'baseline');
assert.equal(single.props.children[0].props.children, '12:00');
const ranged = row({ endTime: '13:00' });
assert.equal(ranged.props.children[0].props.children[1].props.children[1].props.children, '13:00');
assert.equal(ranged.props.children[2].props.style.alignSelf, 'start');
const conflict = row({ isConflict: true });
assert.equal(conflict.props.children[0].props.style.color, '#b91c1c');
assert.equal(conflict.props.children[2].props.style.borderLeft, '3px solid #60a5fa');
assert.equal(row({ time: '' }).props.children[2].props.style.alignSelf, 'start');

console.log('itinerary fresh day-by-day bundle checks passed');
