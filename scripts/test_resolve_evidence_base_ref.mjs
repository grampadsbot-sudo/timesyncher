import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  integrationLaneSelfBase,
  resolveEvidenceBaseRef,
} from './resolve-evidence-base-ref.mjs';

assert.equal(integrationLaneSelfBase('cursor/jev-quality-r20-1128'), 'cursor/jev-quality-r20-1128');
assert.equal(integrationLaneSelfBase('cursor/jev-quality-r19-1128'), 'cursor/jev-quality-r19-1128');
assert.equal(integrationLaneSelfBase('cursor/jev-quality-r20-evidence-1128'), '');
assert.equal(integrationLaneSelfBase('main'), '');

assert.equal(
  resolveEvidenceBaseRef({ baseRef: 'main', refName: 'cursor/feature' }),
  'main',
);

assert.equal(
  resolveEvidenceBaseRef({
    refName: 'cursor/jev-quality-r20-1128',
    sha: '4378b5a239d0a665e850876411a5fcdf567e9813',
    repository: 'grampadsbot-sudo/timesyncher',
    ghPullsForCommit: () => '',
    ghPrListHead: () => '',
  }),
  'cursor/jev-quality-r20-1128',
);

assert.equal(
  resolveEvidenceBaseRef({
    refName: 'cursor/jev-quality-r20-1128',
    sha: 'bfd31ac',
    repository: 'grampadsbot-sudo/timesyncher',
    ghPullsForCommit: () => 'cursor/jev-quality-r20-1128',
    ghPrListHead: () => 'cursor/jev-quality-r19-1128',
  }),
  'cursor/jev-quality-r20-1128',
);

assert.equal(
  resolveEvidenceBaseRef({
    refName: 'cursor/tsv-494-fix',
    ghPullsForCommit: () => '',
    ghPrListHead: () => 'cursor/jev-quality-r20-1128',
  }),
  'cursor/jev-quality-r20-1128',
);

const workflow = fs.readFileSync(
  fileURLToPath(new URL('../.github/workflows/evidence-secrets.yml', import.meta.url)),
  'utf8',
);
assert.match(workflow, /resolve-evidence-base-ref\.mjs/);

process.stdout.write('resolve evidence base ref test passed\n');
