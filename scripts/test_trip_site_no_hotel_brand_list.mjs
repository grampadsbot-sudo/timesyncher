import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = fileURLToPath(new URL('../public/assets/', import.meta.url));
const patchPath = fileURLToPath(new URL('../src/vacation/trek-live-product-patches.mjs', import.meta.url));
const brandWords = ['marriott', 'hyatt', 'hilton', 'sheraton', 'westin'];
const brandListNeedle = /marriott\|hyatt\|hilton\|sheraton/i;

const hits = [];
for (const name of (await readdir(assetsDir)).filter((file) => file.endsWith('.js'))) {
  const text = await readFile(path.join(assetsDir, name), 'utf8');
  if (brandListNeedle.test(text)) hits.push(`public/assets/${name}`);
}
const patchSource = await readFile(patchPath, 'utf8');
for (const word of brandWords) {
  if (new RegExp(word, 'i').test(patchSource)) hits.push(`trek-live-product-patches.mjs:${word}`);
}

assert.equal(hits.length, 0, `served site JS and patch source must not hard-code hotel brand lists: ${hits.join(', ')}`);
console.log('trip site hotel brand list ban passed');
