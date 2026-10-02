import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsDir = fileURLToPath(new URL('../public/assets/', import.meta.url));
const files = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'));
const brandListNeedle = /marriott\|hyatt\|hilton\|sheraton/i;

const hits = [];
for (const name of files) {
  const text = await readFile(path.join(assetsDir, name), 'utf8');
  if (brandListNeedle.test(text)) hits.push(name);
}

assert.equal(hits.length, 0, `served site JS must not hard-code hotel brand lists: ${hits.join(', ')}`);
console.log('trip site hotel brand list ban passed');
