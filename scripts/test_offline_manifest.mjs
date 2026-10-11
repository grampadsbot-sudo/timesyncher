import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

function lines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function duplicates(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) out.push(item);
    seen.add(item);
  }
  return out;
}

const names = (await readdir(new URL('./', import.meta.url)))
  .filter((name) => /^test_.*\.mjs$/.test(name))
  .map((name) => `scripts/${name}`)
  .sort();
const offline = lines(await readFile(new URL('./offline-tests.txt', import.meta.url), 'utf8'));
const online = lines(await readFile(new URL('./online-tests.txt', import.meta.url), 'utf8')).map((line) => {
  const match = line.match(/^(\S+)\s+(.+)$/);
  assert.ok(match, `online list needs a path and a one-line reason: ${line}`);
  return { file: match[1], reason: match[2].trim() };
});

for (const file of offline) {
  assert.equal(file.split(/\s+/).length, 1, `offline list entries are paths only: ${file}`);
}
assert.deepEqual(duplicates(offline), []);
assert.deepEqual(duplicates(online.map((entry) => entry.file)), []);

const offlineSet = new Set(offline);
const onlineSet = new Set(online.map((entry) => entry.file));
const both = [...offlineSet].filter((file) => onlineSet.has(file));
assert.deepEqual(both, []);

const known = new Set(names);
for (const file of [...offlineSet, ...onlineSet]) {
  assert.ok(known.has(file), `listed test is not a scripts/test_*.mjs file: ${file}`);
}

const missing = names.filter((file) => !offlineSet.has(file) && !onlineSet.has(file));
assert.deepEqual(missing, [], `unclassified: ${missing.join(', ')}`);

console.log(`offline manifest ok (${offline.length} offline, ${online.length} online)`);
