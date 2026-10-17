import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const clientRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundled = await esbuild.build({
  absWorkingDir: clientRoot,
  entryPoints: ['src/lib/paintTabEmoji.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});

const bundleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { inkBBoxCentre, settleCentreShift } = await import(bundleUrl);

const WHITE = [255, 255, 255];
const DARK = [30, 41, 59];

function checkerCentre(data, width, height, bg) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const cover = data[i + 3] / 255;
      if (cover <= 0) continue;
      const r = data[i] * cover + bg[0] * (1 - cover);
      const g = data[i + 1] * cover + bg[1] * (1 - cover);
      const b = data[i + 2] * cover + bg[2] * (1 - cover);
      const delta = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      if (delta <= 24) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  assert.ok(maxX >= 0, 'synthetic glyph has visible ink');
  return { cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2 };
}

function blit(data, width, height, originY, shiftX, shiftY) {
  data.fill(0);
  const ox = Math.round(4 + shiftX);
  const oy = Math.round(originY + shiftY);
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      data[i] = 20;
      data[i + 1] = 40;
      data[i + 2] = 180;
      data[i + 3] = 255;
    }
  }
  for (let y = 6; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const i = (py * width + px) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 40;
    }
  }
}

function centreOn(bg, originY) {
  const width = 16;
  const height = 16;
  const data = new Uint8ClampedArray(width * height * 4);
  blit(data, width, height, originY, 0, 0);
  const before = checkerCentre(data, width, height, bg);
  const measured = inkBBoxCentre(data, width, height, bg);
  assert.ok(measured, 'production measure sees the glyph');
  assert.equal(measured.cy, before.cy);
  assert.ok(Math.abs(before.cy - height / 2) > 0.25);
  settleCentreShift(
    (shiftX, shiftY) => blit(data, width, height, originY, shiftX, shiftY),
    () => {
      const centre = inkBBoxCentre(data, width, height, bg);
      if (!centre) return { x: 100, y: 100 };
      return { x: centre.cx - width / 2, y: centre.cy - height / 2 };
    },
  );
  const after = checkerCentre(data, width, height, bg);
  assert.ok(
    Math.abs(after.cx - width / 2) <= 0.25,
    `bbox x ${after.cx} vs container ${width / 2}`,
  );
  assert.ok(
    Math.abs(after.cy - height / 2) <= 0.25,
    `bbox y ${after.cy} vs container ${height / 2}`,
  );
  return before;
}

const whiteHigh = centreOn(WHITE, 3);
const darkHigh = centreOn(DARK, 3);
assert.notEqual(whiteHigh.cy, darkHigh.cy);
centreOn(WHITE, 8);
centreOn(DARK, 8);

console.log('glyph bbox centre on dark and white backdrops passed');
