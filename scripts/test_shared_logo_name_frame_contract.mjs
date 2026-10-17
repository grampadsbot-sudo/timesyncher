import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { judgeRowNameFrame, nameLineFrame } from './ops/gateb/lib/row-name-frame.mjs';

const source = await readFile(new URL('./test_shared_logo_rendered_geometry.mjs', import.meta.url), 'utf8');
assert.match(source, /import \{ judgeRowNameFrame \} from '\.\/ops\/gateb\/lib\/row-name-frame\.mjs';/);
const rowLoop = source.slice(source.indexOf('      for (const row of geometry.rows) {'), source.indexOf('      for (const t of geometry.tabs) {'));
assert.ok(rowLoop.length > 0, 'rendered row checks must be calibrated');
assert.doesNotMatch(rowLoop, /row\.row\b|nameCy|chip-to-row/, 'a second row-logo frame is forbidden');
assert.equal((rowLoop.match(/judgeRowNameFrame\(/g) || []).length, 2, 'box and raster must share GateB name frame');
const runRows = new Function('geometry', 'judgeRowNameFrame', 'ink', 'check', 'width', 'category', 'png', rowLoop);
function failures(rows) {
  const out = [];
  runRows({ rows }, judgeRowNameFrame, (_png, box) => box[1] + box[3] / 2,
    (ok, message) => { if (!ok) out.push(message); }, 390, 'calibration', null);
  return out;
}

const centred = { row: [0, 10, 300, 110], chip: [8, 20, 18, 18], name: [32, 19, 180, 20], label: 'Known centred' };
assert.deepEqual(failures([centred]), [], 'known centred must PASS despite tall row');
const offset = { ...centred, chip: [8, 21, 18, 18] };
assert.deepEqual(failures([offset]).map(message => message.split(': ').at(-1)),
  ['chip-to-first-name-line', 'raster-ink-to-first-name-line'], 'same fixture 1px off must FAIL');
for (const height of [40, 80, 160]) {
  assert.deepEqual(failures([{ ...centred, row: [0, 0, 300, height] }]), [], 'row frame must not affect judgement');
}
const firstText = { visible: true, text: 'Wrapped two-line name', line_boxes: [[32, 39, 100, 20], centred.name] };
assert.deepEqual(nameLineFrame(firstText), { box: centred.name, cy: 29, source: 'range-first-line' });
assert.equal(judgeRowNameFrame(29, firstText).ok, true, 'wrapped name uses line 1 even with unsorted rects');
assert.equal(judgeRowNameFrame(39, firstText).ok, false, 'wrapped name aggregate centre must FAIL');
assert.deepEqual(failures([{ ...centred, label: firstText.text }]), [], 'rendered wrapped first-line box must PASS');
assert.match(failures([{ ...centred, name: null }])[0], /unmeasured row\/name/, 'missing name must FAIL');
for (const name of [null, { ...firstText, visible: false }, { ...firstText, text: '' }, { ...firstText, line_boxes: [] }]) {
  assert.equal(judgeRowNameFrame(29, name).ok, false, 'unmeasured names fail closed');
}
assert.equal(judgeRowNameFrame(null, firstText).ok, false, 'missing raster must FAIL');
assert.equal(judgeRowNameFrame(29.5, firstText).ok, true, '0.5px boundary preserved');
assert.equal(judgeRowNameFrame(29.501, firstText).ok, false, 'outside 0.5px must FAIL');
console.log('row-name frame contract PASS: centred, 1px offset, wrapped line 1, missing name; rendered checks share GateB predicate');
