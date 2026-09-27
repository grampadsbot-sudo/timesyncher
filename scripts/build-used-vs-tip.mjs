/**
 * The graded build is the sha that was live at the drive.
 * Deploy that tip first, then drive once, so the drive build equals the tip.
 * A later tip can still be graded when every commit after the drive leaves reply code unchanged.
 * Render never copies the live sha onto the transcript.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeSha } from './void-stale-build.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const ACCEPTABLE = {
  'scripts/live-transcript-dialog-pdf.mjs': 'dialog PDF renderer',
  'scripts/live_v7_dialog_pdf.py': 'dialog PDF renderer',
  'scripts/screenshot-journey-pdf.mjs': 'journey capture script',
  'scripts/screenshot_journey_pdf.py': 'journey PDF renderer',
  'scripts/void-stale-build.mjs': 'stamp checker',
  'scripts/build-used-vs-tip.mjs': 'build-used-vs-tip line',
  'scripts/test_live_transcript_dialog_pdf.mjs': 'dialog renderer test',
  'scripts/test_screenshot_journey_pdf.mjs': 'journey renderer test',
  'scripts/test_void_stale_build.mjs': 'stamp checker test',
  'scripts/test_build_used_vs_tip.mjs': 'build-used-vs-tip test',
};

export class UntrustedPackError extends Error {
  constructor(message) {
    super(message.startsWith('untrusted:') ? message : `untrusted: ${message}`);
    this.name = 'UntrustedPackError';
  }
}

export function isUntrustedPack(error) {
  return error instanceof UntrustedPackError || String(error?.message || '').startsWith('untrusted:');
}

export function isReplyCodePath(file) {
  const rel = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!rel || rel.includes('..')) return true;
  if (rel.startsWith('evidence/')) return false;
  return !Object.prototype.hasOwnProperty.call(ACCEPTABLE, rel);
}

function whyAcceptable(files) {
  const reasons = files.map((file) => {
    if (file.startsWith('evidence/')) return `${file} (evidence pack file)`;
    return `${file} (${ACCEPTABLE[file]})`;
  });
  return `acceptable: ${reasons.join('; ')}; reply code at the drive build is identical to the tip.`;
}

export function explainBuildUsedVsTip({ driveSha, tipSha, commits }) {
  const drive = normalizeSha(driveSha);
  const tip = normalizeSha(tipSha);
  if (!drive) throw new UntrustedPackError('drive build sha is missing');
  if (!tip) throw new UntrustedPackError('tip sha is missing');
  if (drive === tip) return `build used vs tip: ${drive} equals the tip`;
  const list = Array.isArray(commits) ? commits : [];
  if (list.length === 0) {
    throw new UntrustedPackError('drive build does not equal the tip and no commits explain the difference');
  }
  const replyFiles = [];
  for (const commit of list) {
    for (const file of commit.files || []) {
      if (isReplyCodePath(file)) replyFiles.push(`${commit.sha} ${file}`);
    }
  }
  if (replyFiles.length) {
    throw new UntrustedPackError(`reply code at the drive build is not identical to the tip: ${replyFiles.join(', ')}`);
  }
  const lines = [`build used vs tip: drive ${drive} is older than tip ${tip}`];
  for (const commit of list) {
    const sha = normalizeSha(commit.sha);
    const subject = String(commit.subject || '').trim().replace(/\s+/g, ' ');
    const files = (commit.files || []).filter(Boolean);
    if (!sha || !subject || files.length === 0) {
      throw new UntrustedPackError('a commit between the drive build and the tip is missing its sha, subject, or files');
    }
    lines.push(sha);
    lines.push(subject);
    lines.push(`files: ${files.join(', ')}`);
    lines.push(whyAcceptable(files));
  }
  return lines.join('\n');
}

export function listCommitsBetween(driveSha, tipSha, cwd = root) {
  const drive = normalizeSha(driveSha);
  const tip = normalizeSha(tipSha);
  if (!drive || !tip || drive === tip) return [];
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', drive, tip], { cwd, encoding: 'utf8' });
  if (ancestor.status !== 0) throw new UntrustedPackError('drive build is not an ancestor of the tip');
  const list = spawnSync('git', ['rev-list', '--reverse', `${drive}..${tip}`], { cwd, encoding: 'utf8' });
  if (list.status !== 0) throw new UntrustedPackError('could not list commits between the drive build and the tip');
  const shas = String(list.stdout || '').trim().split('\n').filter(Boolean);
  if (shas.length === 0) {
    throw new UntrustedPackError('drive build does not equal the tip and no commits explain the difference');
  }
  return shas.map((sha) => {
    const subject = spawnSync('git', ['show', '-s', '--format=%s', sha], { cwd, encoding: 'utf8' });
    const files = spawnSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', sha], { cwd, encoding: 'utf8' });
    if (subject.status !== 0 || files.status !== 0) throw new UntrustedPackError(`could not read commit ${sha}`);
    return {
      sha: normalizeSha(sha),
      subject: String(subject.stdout || '').trim().replace(/\s+/g, ' '),
      files: String(files.stdout || '').trim().split('\n').filter(Boolean),
    };
  });
}

export function buildUsedVsTipLine(driveSha, tipSha, cwd = root) {
  const drive = normalizeSha(driveSha);
  const tip = normalizeSha(tipSha);
  return explainBuildUsedVsTip({
    driveSha: drive,
    tipSha: tip,
    commits: listCommitsBetween(drive, tip, cwd),
  });
}

export function driveBanner(driveSha) {
  const drive = normalizeSha(driveSha);
  if (!drive) throw new UntrustedPackError('drive build sha is missing');
  return `live ${drive} https://vacation-staging.timesyncher.com`;
}

export function driveShaFromTranscript(doc) {
  const turns = Array.isArray(doc?.turns) ? doc.turns : [];
  if (turns.length === 0) throw new UntrustedPackError('drive build sha is missing');
  const turnShas = turns.map((turn) => normalizeSha(turn?.buildSha));
  if (turnShas.some((sha) => !sha)) throw new UntrustedPackError('drive build sha is missing');
  const unique = [...new Set(turnShas)];
  if (unique.length !== 1 || doc?.buildMismatch === true) {
    throw new UntrustedPackError('drive build at start does not match drive build at end');
  }
  const drive = unique[0];
  const header = normalizeSha(doc?.buildSha);
  const end = normalizeSha(doc?.driveBuildEnd);
  if ((header && header !== drive) || (end && end !== drive)) {
    throw new UntrustedPackError('drive build at start does not match drive build at end');
  }
  return drive;
}
