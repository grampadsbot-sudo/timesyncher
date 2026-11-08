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
assert.match(committed, /tsItinLine\(ua\.item,ua\.notes\)/);
assert.doesNotMatch(committed, /children:Bs\(rr\(ua\.item\)\)/);
assert.match(committed, /data-summary-stored":"1"/);
const readLine = new Function('ha', `return (${ITINERARY_LINE_BUNDLE})`)((row) => row);
const downgraded = {
  description: 'Grab the nova and a coffee.',
  summary: 'Zabars is the Upper West Side food store at 2245 Broadway, open every day.',
};
assert.equal(readLine(downgraded), '');
assert.equal(itineraryLineText(downgraded), '');
assert.equal(
  itineraryLineText({ itineraryNote: 'Book the corner booth.', description: 'x' }),
  'Book the corner booth.',
);
assert.equal(itineraryLineText({ summary: downgraded.summary }), '');
assert.match(committed, /data-ts-list-row-name":"1"/);
assert.match(committed, /data-ts-thing-header":"1",style:\{display:"grid",gridTemplateColumns:"minmax\(0,1fr\) auto minmax\(0,1fr\)",alignItems:"center"/);
assert.match(committed, /data-ts-logo-name-pair":"1"/);
assert.match(committed, /data-ts-list-row-rating":"1",style:\{display:"flex",flexDirection:"row",flexWrap:"nowrap"/);
assert.doesNotMatch(committed, /minHeight:28},children:Zn}\)\]\}\),Xr=fo/);
assert.match(
  committed,
  /Zi\(G\)\?n\.jsx\(je,\{item:G,title:ua\}\):n\.jsx\("strong",\{style:\{lineHeight:1,display:"block"\},children:ua\}\)/,
);
assert.match(committed, /Rn=tsListRowDescription\(G\)/);
assert.match(committed, /data-row-video-qr":"1"/);
assert.match(committed, /zr\.length\?n\.jsx\(Nr,\{items:zr/);
assert.match(committed, /data-ts-day-map":"1"/);
assert.match(committed, /gpe,\{center:Ia,zoom:11/);
assert.match(committed, /a\.tile\.opentopomap\.org/);
assert.match(committed, /!ua\.endTime&&!ua\.isConflict\?n\.jsx\("div",\{"data-ts-timeline-time":"1"/);
assert.match(committed, /alignSelf:!ua\.endTime&&!ua\.isConflict\?"baseline":"start"/);
assert.match(committed, /paddingTop:Zn\?8:2/);

const timelineStart = committed.indexOf('return n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(52px,64px)');
const timelineEndMarker = ']},`${ua.type}-${Rn}-${ua.title}`)';
const timelineEnd = committed.indexOf(timelineEndMarker, timelineStart);
assert.ok(timelineStart > 0 && timelineEnd > timelineStart);
const rowExpression = committed.slice(timelineStart, timelineEnd + timelineEndMarker.length);
const jsx = (type, props) => ({ type, props });
const rowFor = new Function('n', 'ua', 'Rn', 'Zn', 'Xr', 'sr', 'zr', 'Pn', 'Yo', 'Bs', 'rr', 'Nr', 'tsItinLine', 'Zi', rowExpression);
const row = (extra = {}) => rowFor({ jsx, jsxs: jsx, Fragment: 'fragment' }, { time: '12:00', title: 'Lunch', type: 'restaurant', item: {}, ...extra }, 0, false, '', '', [], 'Lunch', String, String, () => '', null, () => 'Grab the nova.', () => false);
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
assert.equal(row({ time: '' }).props.children[0].props.style.alignSelf, 'baseline');
assert.equal(row({ time: '' }).props.children[0].props.children, 'TBD');
assert.equal(row({ time: '' }).props.children[2].props.style.alignSelf, 'baseline');

console.log('itinerary fresh day-by-day bundle checks passed');

for (const bag of [
  { itinerary_note: '  Keep the 09:30 slot.\nBring a coat.  ' },
  { evidenceDossier: { fields: { itineraryNote: { value: '  Dossier note.  ' } } } },
  { evidenceDossier: { fields: { itineraryNote: { claims: [{ text: '  Claim note.  ' }] } } } },
  { description: 'Long description', summary: 'Summary' },
]) {
  assert.equal(readLine(bag), itineraryLineText(bag));
}
assert.equal(readLine({ description: 'Never use this.' }, '  Assignment note.  '), '');
assert.equal(readLine({ notes: '  Override note.  ' }), '');
assert.equal(readLine({ itineraryNote: 'Stored note.', notes: 'Override note.' }, 'Assignment note.'), 'Stored note.');
assert.equal(readLine({ evidenceDossier: { fields: { itineraryNote: { value: 'Dossier note.' } } }, notes: 'Override note.' }, 'Assignment note.'), 'Dossier note.');
