import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const start = bundle.indexOf('function tsPaintTabEmoji(');
const end = bundle.indexOf('function pze(', start);
assert.ok(start >= 0 && end > start, 'served bundle must define tsPaintTabEmoji before pze');
const painterSource = bundle.slice(start, end);

const CSS = 16;
const DPR = 2;
const RED = [220, 38, 38];
const WHITE = [255, 255, 255];
const GREY = [60, 60, 60];
const DARK_PILL = [17, 24, 39];
const WHITE_PILL = [255, 255, 255];
const PAGE = [249, 250, 251];

function calendarBands(c) {
  return [
    [c - 6, c - 2, RED],
    [c - 2, c + 1, WHITE],
    [c + 1, c + 3, GREY],
    [c + 3, c + 6, WHITE],
  ];
}

function fakeContext(canvas) {
  let data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  return {
    setTransform() {},
    clearRect() { data = new Uint8ClampedArray(canvas.width * canvas.height * 4); },
    fillText(_emoji, _x, y) {
      for (let j = 0; j < canvas.height; j += 1) {
        const top = j / DPR;
        const bottom = (j + 1) / DPR;
        for (const [a, b, rgb] of calendarBands(y)) {
          const cover = Math.max(0, Math.min(bottom, b) - Math.max(top, a)) * DPR;
          if (cover <= 0) continue;
          for (let i = 3 * DPR; i < canvas.width - 3 * DPR; i += 1) {
            const k = (j * canvas.width + i) * 4;
            const prev = data[k + 3] / 255;
            const add = Math.min(cover, 1 - prev);
            if (add <= 0) continue;
            const total = prev + add;
            for (let c = 0; c < 3; c += 1) data[k + c] = Math.round((data[k + c] * prev + rgb[c] * add) / total);
            data[k + 3] = Math.round(total * 255);
          }
        }
      }
    },
    getImageData() { return { data: new Uint8ClampedArray(data) }; },
  };
}

const rgbText = (rgb) => `rgb(${rgb.join(', ')})`;

function renderTab({ inlineBackground, resolvedBackground, staleComputedBackground }) {
  const style = (init = {}) => ({ setProperty() {}, ...init });
  const page = { nodeType: 1, style: style(), parentElement: null };
  const label = { style: style() };
  const btn = { nodeType: 1, style: style({ background: inlineBackground }), parentElement: page, appendChild() {}, removeChild() {} };
  const chip = { nodeType: 1, style: style(), parentElement: btn, closest: (sel) => (sel === 'button' ? btn : null) };
  btn.children = [chip, label];
  const canvas = { nodeType: 1, width: 32, height: 32, style: style(), parentElement: chip, closest: () => chip };
  let ctx = null;
  canvas.getContext = () => { ctx ||= fakeContext(canvas); return ctx; };
  const probes = new Set();
  const doc = { createElement: () => { const p = { nodeType: 1, style: { cssText: '', background: '' } }; probes.add(p); return p; } };
  const computed = (el) => {
    if (probes.has(el)) return { backgroundColor: el.style.background === inlineBackground ? rgbText(resolvedBackground) : 'rgba(0, 0, 0, 0)' };
    if (el === btn) return { backgroundColor: rgbText(staleComputedBackground) };
    if (el === page) return { backgroundColor: rgbText(PAGE) };
    return { backgroundColor: 'rgba(0, 0, 0, 0)', fontWeight: '400', fontSize: '12px', fontFamily: 'sans-serif' };
  };
  const paint = new Function('getComputedStyle', 'document', `${painterSource};return tsPaintTabEmoji;`)(computed, doc);
  paint(canvas, '\u{1F4C5}');
  return ctx.getImageData().data;
}

function screenOffset(device, backdrop) {
  let sum = 0;
  let mass = 0;
  for (let r = 0; r < CSS; r += 1) {
    for (let x = 0; x < CSS; x += 1) {
      const px = [0, 0, 0];
      for (let s = 0; s < DPR; s += 1) {
        for (let t = 0; t < DPR; t += 1) {
          const k = (((r * DPR + s) * CSS * DPR) + (x * DPR + t)) * 4;
          const a = device[k + 3] / 255;
          for (let c = 0; c < 3; c += 1) px[c] += (device[k + c] * a + backdrop[c] * (1 - a)) / (DPR * DPR);
        }
      }
      const w = Math.abs(px[0] - backdrop[0]) + Math.abs(px[1] - backdrop[1]) + Math.abs(px[2] - backdrop[2]);
      if (w < 18) continue;
      sum += r * w;
      mass += w;
    }
  }
  return sum / mass - CSS / 2;
}

const idle = renderTab({ inlineBackground: 'var(--bg-card, white)', resolvedBackground: WHITE_PILL, staleComputedBackground: WHITE_PILL });
const idleOff = screenOffset(idle, WHITE_PILL);
assert.ok(Math.abs(idleOff) <= 0.5, `idle white pill: emoji ink centre off by ${idleOff.toFixed(2)} px`);

const active = renderTab({ inlineBackground: '#111827', resolvedBackground: DARK_PILL, staleComputedBackground: WHITE_PILL });
const activeOff = screenOffset(active, DARK_PILL);
assert.ok(Math.abs(activeOff) <= 0.5, `active dark pill mid-transition: emoji ink centre off by ${activeOff.toFixed(2)} px`);

const sameGlyphOnDark = screenOffset(idle, DARK_PILL);
assert.ok(Math.abs(sameGlyphOnDark - activeOff) > 0.25, 'painter must re-centre for the pill colour it sits on');

console.log(`tab emoji contrast centre tests passed (idle ${idleOff.toFixed(2)} px, active ${activeOff.toFixed(2)} px)`);
