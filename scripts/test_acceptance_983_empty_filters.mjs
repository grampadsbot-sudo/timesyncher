#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const unitScripts = [
  'scripts/test_issue_983_filter_stale_chips.mjs',
  'scripts/test_events_tab_cross_filter_chips.mjs',
  'scripts/test_shared_tab_filter_chips.mjs',
];

for (const script of unitScripts) {
  const run = spawnSync(process.execPath, [path.join(root, script)], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${script} failed: ${run.stderr || run.stdout}`);
}

const bundle = readFileSync(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');
assert.match(bundle, /Gn=tsPad\(Fs\.filter\(G=>\{const za=ze\.filter\(Re=>Oa\.includes\(Re\)\)/);
assert.match(bundle, /za\.length!==ze\.length&&Le\(za\)/);
assert.doesNotMatch(bundle, /Os=\["event","family_event"/);

console.log('acceptance 983 empty filters OK');
