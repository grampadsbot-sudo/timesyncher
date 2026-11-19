import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readOfflineTestList } from './lib/offline-test-list.mjs';

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
const offlineDir = fileURLToPath(new URL('./offline-tests.d/', import.meta.url));
const offline = readOfflineTestList(offlineDir);
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

const scratch = mkdtempSync(join(tmpdir(), 'offline-tests-d-'));
try {
  assert.throws(() => readOfflineTestList(join(scratch, 'missing')), /offline-tests\.d unreadable/);
  const empty = join(scratch, 'empty');
  mkdirSync(empty);
  assert.throws(() => readOfflineTestList(empty), /offline-tests\.d is empty/);
  const blocked = join(scratch, 'blocked');
  mkdirSync(blocked);
  mkdirSync(join(blocked, 'gap.txt'));
  assert.throws(() => readOfflineTestList(blocked), /gap\.txt unreadable/);
  const one = join(scratch, 'one');
  mkdirSync(one);
  writeFileSync(join(one, '0001-sample.txt'), 'scripts/test_offline_manifest.mjs\n');
  assert.deepEqual(readOfflineTestList(one), ['scripts/test_offline_manifest.mjs']);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`offline manifest ok (${offline.length} offline, ${online.length} online)`);
