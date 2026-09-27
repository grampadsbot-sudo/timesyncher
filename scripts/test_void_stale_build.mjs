import assert from 'node:assert/strict';
import {
  assertMatchingBuild,
  shaFromDeploymentMeta,
  shaFromVersionPayload,
  VoidStaleBuildError,
  voidDocumentStamp,
} from './void-stale-build.mjs';

const live = 'ab66dfe6d9f09b5382081f3ac198322a518cd9b4';
const tip = '2c511334b1f233de22c22346ab6dba2738d8d26c';

assert.throws(() => assertMatchingBuild(live, tip), (error) => {
  assert.equal(error instanceof VoidStaleBuildError, true);
  assert.equal(error.message, `VOID_STALE_BUILD live=${live} tip=${tip}`);
  return true;
});

assert.doesNotThrow(() => assertMatchingBuild(tip, tip.toUpperCase()));

assert.throws(
  () => assertMatchingBuild('', tip),
  (error) => error instanceof VoidStaleBuildError && error.message === `VOID_STALE_BUILD live=missing tip=${tip}`,
);

assert.equal(
  voidDocumentStamp(live, tip).split('\n')[0],
  'VOID',
);
assert.match(voidDocumentStamp(live, tip), new RegExp(`VOID_STALE_BUILD live=${live} tip=${tip}`));
assert.equal(shaFromVersionPayload({ sha: tip }), tip);
assert.equal(shaFromDeploymentMeta({ meta: { githubCommitSha: live } }), live);
assert.equal(shaFromVersionPayload({ sha: 'not-a-commit' }), '');

process.stdout.write('void stale build mismatch ok\n');
