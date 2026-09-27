import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildUsedVsTipLine,
  driveShaFromTranscript,
  explainBuildUsedVsTip,
  isReplyCodePath,
  UntrustedPackError,
} from './build-used-vs-tip.mjs';

const drive = 'e830a5d177fcb5091cf127129ca9ea9481c4b5e2';
const tip = 'a'.repeat(40);
const replyTip = 'b'.repeat(40);

assert.equal(
  explainBuildUsedVsTip({ driveSha: drive, tipSha: drive, commits: [] }),
  `build used vs tip: ${drive} equals the tip`,
);

assert.throws(
  () => explainBuildUsedVsTip({ driveSha: '', tipSha: drive, commits: [] }),
  (error) => error instanceof UntrustedPackError && /drive build sha is missing/.test(error.message),
);

assert.throws(
  () => explainBuildUsedVsTip({
    driveSha: drive,
    tipSha: replyTip,
    commits: [{ sha: replyTip, subject: 'Change a reply', files: ['src/vacation/live-app-turn.mjs'] }],
  }),
  (error) => error instanceof UntrustedPackError && /reply code at the drive build is not identical to the tip/.test(error.message),
);

const older = explainBuildUsedVsTip({
  driveSha: drive,
  tipSha: tip,
  commits: [{
    sha: tip,
    subject: 'Pass the clip-text limit into the journey page.',
    files: ['scripts/screenshot-journey-pdf.mjs'],
  }],
});
assert.match(older, new RegExp(`build used vs tip: drive ${drive} is older than tip ${tip}`));
assert.match(older, /scripts\/screenshot-journey-pdf\.mjs/);
assert.match(older, /journey capture script/);
assert.match(older, /reply code at the drive build is identical to the tip/);
assert.equal(isReplyCodePath('src/vacation/live-app-turn.mjs'), true);
assert.equal(isReplyCodePath('scripts/screenshot-journey-pdf.mjs'), false);
assert.equal(isReplyCodePath('routes/keepsake-order.mjs'), false);
assert.equal(isReplyCodePath('evidence/pack/REPORT.md'), false);

const root = fileURLToPath(new URL('..', import.meta.url));
const pinned = spawnSync('git', ['rev-parse', 'a263b0f'], { cwd: root, encoding: 'utf8' });
assert.equal(pinned.status, 0, pinned.stderr);
const pinnedSha = pinned.stdout.trim();
const listed = buildUsedVsTipLine(drive, pinnedSha, root);
assert.match(listed, new RegExp(pinnedSha));
assert.match(listed, /scripts\/screenshot-journey-pdf\.mjs/);
assert.doesNotMatch(listed, /live-app-turn/);

assert.throws(
  () => driveShaFromTranscript({ turns: [{ buildSha: '' }] }),
  /drive build sha is missing/,
);
assert.throws(
  () => driveShaFromTranscript({
    buildSha: drive,
    driveBuildEnd: tip,
    turns: [{ buildSha: drive }, { buildSha: tip }],
  }),
  /drive build at start does not match drive build at end/,
);
assert.equal(driveShaFromTranscript({
  buildSha: drive,
  driveBuildEnd: drive,
  turns: [{ buildSha: drive }, { buildSha: drive.toUpperCase() }],
}), drive);

const publisher = readFileSync(fileURLToPath(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url)), 'utf8');
assert.equal(publisher.includes('transcript.buildSha ='), false);

console.log('build used vs tip passed');
