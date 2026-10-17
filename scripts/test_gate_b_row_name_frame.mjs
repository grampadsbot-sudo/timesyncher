import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runLogoCentres } from './ops/gateb/restore-check-logo-centres.mjs';
import { nameLineFrame, judgeRowNameFrame } from './ops/gateb/lib/row-name-frame.mjs';

const ft = (cy) => ({ text: 'Known name', visible: true, box: [64, cy - 8, 177, 16] });
const first = ft(410);
assert.equal(judgeRowNameFrame(410, first).ok, true);
assert.equal(judgeRowNameFrame(411, first).ok, false);
assert.equal(judgeRowNameFrame(410.5, first).ok, true);
assert.equal(judgeRowNameFrame(410.500001, first).ok, false);
const wrapped = { ...first, box: [64, 402, 177, 36], line_boxes: [[64, 402, 90, 16], [64, 422, 75, 16]] };
assert.equal(nameLineFrame(wrapped).cy, 410);
assert.equal(judgeRowNameFrame(410, wrapped).ok, true);
for (const bad of [null, {}, { ...first, text: '' }, { ...first, visible: false },
  { ...first, box: null }, { ...first, line_boxes: [] }, { ...first, line_boxes: [[1, NaN, 2, 3]] }]) {
  assert.equal(judgeRowNameFrame(410, bad).ok, false);
}
// Recorded first flight in flights-390-top.png: item centre 430 is never a frame.
assert.equal(judgeRowNameFrame(410, { text: 'American', visible: true, box: [64, 402, 177, 17] }).ok, true);

function raster(firstText, low = 0) {
  const W = 100, H = 80, Cd = new Uint8Array(W * H * 4).fill(255);
  for (let y = 32 + low; y < 48 + low; y += 1) for (let x = 27; x < 41; x += 1) {
    const k = (y * W + x) * 4; Cd[k] = Cd[k + 1] = Cd[k + 2] = 0;
  }
  const out = { reasons: [] };
  runLogoCentres({ spec: { logo_chips: [{ name: 'Fixture', box: [20, 26, 28, 28], first_text: firstText }] },
    out, Cd, W, Hc: H, VW: W, regions: { viewport: [W, H] } });
  return out;
}
assert.deepEqual(raster(ft(40)).reasons, []);
assert.ok(raster(ft(40), 1).reasons.some((s) => s.startsWith('logo not centred with name')));
assert.ok(raster(null).reasons.some((s) => s.includes('missing visible name line')));
assert.deepEqual(raster({ ...ft(40), box: [64, 32, 177, 36], line_boxes: [[64, 32, 90, 16], [64, 52, 75, 16]] }).reasons, []);
// Retain the independent row-ink check even when the name frame itself passes.
assert.ok(raster(ft(41), 1).reasons.some((s) => s.startsWith('logo not vertically centred')));
assert.ok(!raster(ft(41), 1).reasons.some((s) => s.startsWith('logo not centred with name')));
// A poisoned whole-item box makes any second Python row-frame owner fail,
// regardless of its variable names or the spelling of its centre arithmetic.
const contract = spawnSync('python3', ['-c', `
import importlib.util, sys
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location('row_contract', sys.argv[1] + '/restore_check.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.structure_extras = lambda *args: []
m.row_design = lambda *args: ([], [])
class ForbiddenItemBox(list):
    def __getitem__(self, key): raise AssertionError('row frame read whole item box')
    def __iter__(self): raise AssertionError('row frame iterated whole item box')
    def __bool__(self): raise AssertionError('row frame inspected whole item box')
reg = {'ok': True, 'viewport': [390, 844], 'struct': {'header': {'text': 'Title', 'box': [0,0,390,40]}},
       'items': [{'name': 'Known name', 'box': ForbiddenItemBox([0,0,100,100]),
                  'chip': {'visible': True, 'box': [20,20,28,28]},
                  'first_text': {'visible': True, 'text': 'Known name', 'box': [64,26,90,16]}}]}
assert not any(r.startswith('row logos:') for r in m.structure_check('flights-390-top.png', reg, {}))
`, fileURLToPath(new URL('./ops/gateb/', import.meta.url))], { encoding: 'utf8' });
assert.equal(contract.status, 0, contract.stderr);
const py = fs.readFileSync(new URL('./ops/gateb/restore_check.py', import.meta.url), 'utf8');
const structure = py.split('def structure_check(')[1].split('# ---- Detail-page')[0];
assert.ok(!structure.includes('offc'));
assert.ok(!structure.includes('ch["box"][1]'));
assert.ok(!py.includes('"name_cy":'));
assert.ok(py.includes('"first_text": it.get("first_text")'));
const logos = fs.readFileSync(new URL('./ops/gateb/restore-check-logo-centres.mjs', import.meta.url), 'utf8');
assert.equal((logos.match(/judgeRowNameFrame\(measured\.gc, firstText\)/g) || []).length, 1);
assert.ok(!logos.includes('name_cy'));
const helper = fs.readFileSync(new URL('./ops/gateb/lib/capture-name-line.mjs', import.meta.url), 'utf8').replace(/^export /, '').trimEnd();
const patch = fs.readFileSync(new URL('./ops/gateb/capture-name-line.patch', import.meta.url), 'utf8');
const added = patch.split('\n').filter((s) => s.startsWith('+') && !s.startsWith('+++')).map((s) => s.slice(1)).join('\n');
assert.ok(added.includes(helper));
assert.ok(helper.includes('range.getClientRects()'));
console.log('ruling99 name-frame calibrations PASS: centred, 1px off, 0.5px boundary, wrapped first line, missing name, real flight geometry, raster and contract guard');
