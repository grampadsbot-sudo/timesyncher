import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
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
assert.ok(raster(ft(41), 1).reasons.some((s) => s.startsWith('logo not vertically centred')));
assert.ok(!raster(ft(41), 1).reasons.some((s) => s.startsWith('logo not centred with name')));
const contract = spawnSync('python3', ['-B', '-c', `
import copy, importlib.util, json, pathlib, sys, tempfile, types
judge = types.ModuleType('managing_dr_judge')
class NoJudge:
    def __init__(self, *args, **kwargs): raise AssertionError('offline observer test called a judge')
judge.ManagingDrJudge = NoJudge
judge.ManagingDrJudgmentPending = RuntimeError
judge.ROOT = '/unused-offline-judge'
sys.modules['managing_dr_judge'] = judge
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location('row_contract', sys.argv[1] + '/restore_check.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
from ui_paths import render_files
ui = ['src/vacation/trip-things.mjs', 'src/vacation/arbitrary-server.mjs',
      'public/assets/served.js', 'public/new-asset.bin', 'apps/vacation-client/src/model.ts',
      'styles/tokens.json', 'images/asset.bin', 'fonts/asset.bin', 'nested/index.html',
      'nested/vite.config.ts', 'tailwind.config.js', 'postcss.config.cjs',
      'src/theme.scss', 'src/font.woff2', 'src/onboarding/eula-markdown.mjs',
      'scripts/rebake_served_trek_bundle.mjs', 'package.json']
assert render_files(ui) == ui
assert render_files(['scripts/test_sample.mjs', 'db/migrations/009.sql', 'docs/readme.md']) == []
assert render_files([]) == []
for args, kwargs in [(None, {}), ([], {'truncated': True}), ([], {'fetch_error': True}),
                     (['scripts/a.mjs'] * 3000, {}), ([{}], {}), ([''], {})]:
    assert render_files(args, **kwargs)
for width in (390, 1280):
    lg = {'box': [width / 2 + 3, 38, 22, 22],
          'group': [width / 2 - 100, 38, 200, 22], 'group_kind': 'brand-row'}
    assert m.header_group_reasons(lg, width) == []
    shifted = copy.deepcopy(lg); shifted['group'][0] += 1
    assert m.header_group_reasons(shifted, width)
    assert m.header_group_reasons({'box': lg['box']}, width)
    row = {'title': 'Known name', 'title_cy': 40, 'title_baseline': 45,
           'title_box': [64, 32, 90, 16], 'title_block': [64, 32, 90, 16],
           'title_block_cy': 40, 'icon_cy': 40, 'conflict': False,
           'time_lines': [{'cy': 40, 'baseline': 43}]}
    assert any('baseline' in r for r in m.timeline_checks({'timeline': [row]}))
    for offset in (-0.5, 0, 0.5):
        row['time_lines'][0]['baseline'] = row['title_baseline'] + offset
        assert m.timeline_checks({'timeline': [row]}) == []
    for offset in (-0.51, 0.51):
        row['time_lines'][0]['baseline'] = row['title_baseline'] + offset
        assert m.timeline_time_checks({'timeline': [row]})
    row['time_lines'] = [{'baseline': 10}, {'baseline': 20}]
    row['title_block'] = [64, 32, 90, 36]; row['title_block_cy'] = 50; row['icon_cy'] = 50
    assert m.timeline_checks({'timeline': [row]}) == []
    row['icon_cy'] = row['title_cy']
    assert any('title block' in r for r in m.timeline_checks({'timeline': [row]}))
    row['conflict'] = True; row['row_box'] = [0, 20, width, 80]; row['icon'] = [20, 20, 28, 28]
    assert m.timeline_checks({'timeline': [row]}) == []
    row['icon'][1] += 1
    assert any('conflict-row icon' in r for r in m.timeline_checks({'timeline': [row]}))
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
reg['items'][0]['box'] = [0, 0, 100, 100]
with tempfile.TemporaryDirectory(prefix='s458-') as work:
    shot = 'hotels-390-top.png'
    pathlib.Path(work, shot).touch()
    recorded = []
    def check_node(args, **kwargs):
        recorded.append(json.loads(pathlib.Path(args[-1]).read_text()))
        return types.SimpleNamespace(stdout=json.dumps({'ok': False, 'reasons': ['capture coverage gap: row logo clipped']}), stderr='', returncode=0)
    m.subprocess.run = check_node
    result = m.check_screen({'mode': 'structure'}, shot, work, work, work, {shot: reg})
    assert recorded[0]['logo_chips'][0]['first_text'] == reg['items'][0]['first_text']
    assert 'name_cy' not in recorded[0]['logo_chips'][0]
    assert not result['ok'] and any(r.startswith('capture coverage gap:') for r in result['reasons'])
`, fileURLToPath(new URL('./ops/gateb/', import.meta.url))], { encoding: 'utf8' });
assert.equal(contract.status, 0, contract.stderr);
const py = fs.readFileSync(new URL('./ops/gateb/restore_check.py', import.meta.url), 'utf8');
const structure = py.split('def structure_check(')[1].split('DETAIL_RE =')[0];
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
const rect = (x, y, width, height) => ({ x, y, width, height, left: x, top: y, right: x + width, bottom: y + height });
const element = (bounds, style = {}) => ({ getBoundingClientRect: () => bounds, style });
const nameEl = element(rect(64, 32, 177, 36));
const hiddenEl = element(rect(64, 32, 90, 16), { display: 'none' });
const hidden = { textContent: 'Hidden name', parentElement: hiddenEl };
const offscreen = { textContent: 'Outside viewport', parentElement: nameEl, rects: [rect(64, -20, 90, 16)] };
const visible = { textContent: 'Wrapped name', parentElement: nameEl, rects: [rect(64, 32, 90, 16), rect(64, 52, 75, 16)] };
const nodes = [{ textContent: '   ', parentElement: nameEl }, hidden, offscreen, visible];
const context = vm.createContext({
  innerWidth: 390, innerHeight: 844, NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle: (el) => ({ visibility: 'visible', display: 'block', opacity: '1', ...el.style }),
  document: {
    createTreeWalker: () => { let i = 0; return { nextNode: () => nodes[i++] }; },
    createRange: () => { let selected; return { selectNodeContents: (node) => { selected = node; }, getClientRects: () => selected.rects }; },
  },
});
const captureNameText = vm.runInContext(`${helper}\ncaptureNameText`, context);
assert.equal(captureNameText(null), null);
assert.equal(captureNameText(hiddenEl), null);
const captured = JSON.parse(JSON.stringify(captureNameText(nameEl)));
assert.equal(captured.text, 'Wrapped name');
assert.deepEqual(captured.line_boxes, [[64, 32, 90, 16], [64, 52, 75, 16]]);
assert.equal(nameLineFrame(captured).cy, 40);
for (const box of [[20, 70, 28, 28], [20, 90, 28, 28]]) {
  const out = { reasons: [] };
  runLogoCentres({ spec: { logo_chips: [{ name: 'Clipped', box, first_text: null }] },
    out, Cd: new Uint8Array(100 * 80 * 4).fill(255), W: 100, Hc: 80, VW: 100,
    regions: { viewport: [100, 80] } });
  assert.ok(out.reasons.some((s) => s.startsWith('capture coverage gap:')));
  assert.ok(!out.reasons.some((s) => s.includes('no glyph drawn')));
}
const blank = { reasons: [] };
runLogoCentres({ spec: { logo_chips: [{ name: 'Blank', box: [20, 26, 28, 28], first_text: ft(40) }] },
  out: blank, Cd: new Uint8Array(100 * 80 * 4).fill(255), W: 100, Hc: 80, VW: 100,
  regions: { viewport: [100, 80] } });
assert.ok(blank.reasons.some((s) => s.includes('no glyph drawn')));
console.log('ruling99 name-frame calibrations PASS: centred, 1px off, 0.5px boundary, wrapped first line, missing name, real flight geometry, raster and contract guard');
