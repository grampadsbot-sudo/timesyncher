#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  inCommentScope,
  scanComments,
  stripComments,
} from './lib/comment-tools.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const checker = path.join(repo, 'scripts/check-no-comments.mjs');

assert.equal(inCommentScope('scripts/fixtures/code-ratchet/workaround.mjs'), false);
assert.equal(inCommentScope('src/vacation/place-search.mjs'), true);

const stripped = stripComments(
  'const sampleValue = 1;\n// explain hack\n',
  { ext: '.mjs', file: 'src/sample.mjs' },
);
assert.doesNotMatch(stripped, /explain hack/);
assert.match(stripped, /sampleValue = 1/);

const kept = stripComments(
  'void fn();\n// eslint-disable-next-line no-empty\nfn();\n',
  { ext: '.mjs', file: 'src/sample.mjs' },
);
assert.match(kept, /eslint-disable-next-line/);

assert.deepEqual(
  scanComments('src/sample.mjs', 'const sampleValue = 1;\n// leftover\n').map((row) => row.line),
  [2],
);

const repoRun = spawnSync(process.execPath, [checker], { cwd: repo, encoding: 'utf8' });
assert.equal(
  repoRun.status,
  0,
  `${repoRun.stderr}\n${repoRun.stdout}`,
);

assert.equal(scanComments('src/sample.mjs', '/** doc */\nexport const a = 1;\n').length, 1);

process.stdout.write('no-comment check tests passed\n');
