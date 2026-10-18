import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveEvidenceBaseRef } from './resolve-evidence-base-ref.mjs';

const script = fileURLToPath(new URL('./resolve-evidence-base-ref.mjs', import.meta.url));

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
  '',
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

const ok = spawnSync(process.execPath, [script, 'abc123deadbeef'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    GITHUB_BASE_REF: 'cursor/jev-quality-r20-1128',
    GITHUB_REPOSITORY: 'grampadsbot-sudo/timesyncher',
    GITHUB_REF_NAME: 'cursor/tsv-503-fix',
  },
});
assert.equal(ok.status, 0, ok.stderr || ok.stdout);
assert.equal(ok.stdout.trim(), 'cursor/jev-quality-r20-1128');

const missingSha = '0000000000000000000000000000000000000000';
const missing = spawnSync(process.execPath, [script, missingSha], {
  encoding: 'utf8',
  env: {
    ...process.env,
    GITHUB_BASE_REF: '',
    GITHUB_REPOSITORY: 'grampadsbot-sudo/timesyncher',
    GITHUB_REF_NAME: 'cursor/offline-resolve-evidence-base-ref-miss',
  },
});
assert.equal(missing.status, 1, missing.stdout);
assert.match(missing.stderr, new RegExp(`no PR for ${missingSha}: push through a PR`));

process.stdout.write('resolve evidence base ref test passed\n');
