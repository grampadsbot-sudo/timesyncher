import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { captureNameText } from './ops/gateb/lib/capture-name-line.mjs';
import { nameLineFrame, judgeRowNameFrame } from './ops/gateb/lib/row-name-frame.mjs';
import { runLogoCentres } from './ops/gateb/restore-check-logo-centres.mjs';

const ft = (cy) => ({ text: 'Known name', visible: true, box: [64, cy - 8, 177, 16] });
const first = ft(410);
assert.equal(judgeRowNameFrame(410, first).ok, true);
assert.equal(judgeRowNameFrame(411, first).ok, false);
assert.equal(judgeRowNameFrame(410.5, first).ok, true);
const wrapped = { ...first, box: [64, 402, 177, 36], line_boxes: [[64, 402, 90, 16], [64, 422, 75, 16]] };
assert.equal(nameLineFrame(wrapped).cy, 410);
assert.equal(judgeRowNameFrame(410, wrapped).ok, true);

function raster(firstText, low = 0) {
  const W = 100;
  const H = 80;
  const Cd = new Uint8Array(W * H * 4).fill(255);
  for (let y = 32 + low; y < 48 + low; y += 1) {
    for (let x = 27; x < 41; x += 1) {
      const k = (y * W + x) * 4;
      Cd[k] = Cd[k + 1] = Cd[k + 2] = 0;
    }
  }
  const out = { reasons: [] };
  runLogoCentres({
    spec: { logo_chips: [{ name: 'Fixture', box: [20, 26, 28, 28], first_text: firstText }] },
    out,
    Cd,
    W,
    Hc: H,
    VW: W,
    regions: { viewport: [W, H] },
  });
  return out;
}

assert.deepEqual(raster(ft(40)).reasons, []);
assert.ok(raster(ft(40), 1).reasons.some((s) => s.startsWith('logo not centred with name')));
assert.ok(raster(null).reasons.some((s) => s.includes('missing visible name line')));

const rect = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
});
const element = (bounds, style = {}) => ({
  getBoundingClientRect: () => bounds,
  textContent: '',
  style,
});
const captureHelper = fs.readFileSync(
  new URL('./ops/gateb/lib/capture-name-line.mjs', import.meta.url),
  'utf8',
).replace(/^export /, '');

const plainEl = element(rect(64, 32, 177, 16));
plainEl.textContent = 'Apple Fifth Avenue';
const plainNodes = [{ textContent: 'Apple Fifth Avenue', parentElement: plainEl, rects: [rect(64, 32, 177, 16)] }];
const plainContext = vm.createContext({
  innerWidth: 390,
  innerHeight: 844,
  NodeFilter: { SHOW_TEXT: 4 },
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1' }),
  document: {
    createTreeWalker: () => {
      let i = 0;
      return { nextNode: () => plainNodes[i++] };
    },
    createRange: () => {
      let selected;
      return {
        selectNodeContents: (node) => {
          selected = node;
        },
        getClientRects: () => selected.rects || [],
      };
    },
  },
});
const capturedPlain = vm.runInContext(`${captureHelper}; captureNameText`, plainContext)(plainEl);
assert.equal(capturedPlain.text, 'Apple Fifth Avenue');
assert.equal(judgeRowNameFrame(40, capturedPlain).ok, true);
assert.deepEqual(raster(capturedPlain).reasons, []);

console.log(`row-name-frame regression PASS (${fileURLToPath(import.meta.url)})`);
