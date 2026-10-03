#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizePngBufferInput, measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const png = new PNG({ width: 4, height: 4 });
for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 4; x += 1) {
    const i = (y * 4 + x) * 4;
    const dark = x === 1 && y === 1;
    png.data[i] = dark ? 0 : 250;
    png.data[i + 1] = dark ? 0 : 250;
    png.data[i + 2] = dark ? 0 : 250;
    png.data[i + 3] = 255;
  }
}
const buf = PNG.sync.write(png);
const uint = new Uint8Array(buf);

const fromBuf = await measureLogoComFromPngBuffer(buf);
const fromUint = await measureLogoComFromPngBuffer(uint);
assert.equal(fromBuf.error, undefined);
assert.equal(fromUint.error, undefined);
assert.equal(Math.round(fromBuf.comX), Math.round(fromUint.comX));

assert.throws(() => normalizePngBufferInput({}), /unsupported/);

console.log('shepherd logo png buffer tests passed');
