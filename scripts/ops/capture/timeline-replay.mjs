import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { prepareFixtureReplaySharedTrip } from '../../../src/vacation/shared-trip-fixture-replay.mjs';

export { GATEB_FIXTURE_REPLAY_SLUG, loadFixtureReplaySharedTripFromPath } from '../../../src/vacation/shared-trip-fixture-replay.mjs';

const FULL_SHA_RE = /^[0-9a-f]{40}$/;
const FIXTURE_SHA_RE = /^[0-9a-f]{64}$/;

function resolveCaptureProducerBinding() {
  const root = String(process.env.TSV_CAPTURE_REPO_ROOT || '').trim();
  const sha = String(process.env.TSV_CAPTURE_PRODUCER_HEAD_SHA || '').trim();
  const renderHead = String(process.env.TSV_CAPTURE_RENDER_HEAD_SHA || '').trim();
  if (!root || !sha) {
    throw new Error(
      'capture replay binding missing: set TSV_CAPTURE_REPO_ROOT and TSV_CAPTURE_PRODUCER_HEAD_SHA',
    );
  }
  if (!FULL_SHA_RE.test(sha)) {
    throw new Error('TSV_CAPTURE_PRODUCER_HEAD_SHA must be a full 40-character lowercase hex commit');
  }
  if (!FULL_SHA_RE.test(renderHead)) {
    throw new Error('TSV_CAPTURE_RENDER_HEAD_SHA must be a full 40-character lowercase hex commit');
  }
  const producerPath = join(root, 'src/vacation/shared-trip-fixture-replay.mjs');
  if (!fs.existsSync(producerPath)) {
    throw new Error(`capture replay producer missing at ${producerPath}`);
  }
  let dirty = '';
  try {
    dirty = execFileSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`capture replay binding: cannot read git status for ${root}: ${msg}`);
  }
  if (dirty) {
    throw new Error('capture replay binding: producer root has tracked modifications');
  }
  let head;
  try {
    head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`capture replay binding: cannot read HEAD for ${root}: ${msg}`);
  }
  if (head !== sha) {
    throw new Error(`capture replay binding: repo HEAD ${head} !== TSV_CAPTURE_PRODUCER_HEAD_SHA ${sha}`);
  }
  return { root, sha, renderHead, producerPath };
}

function assertFixtureDigest(bytes) {
  const expected = String(process.env.TSV_CAPTURE_FIXTURE_SHA256 || '').trim().toLowerCase();
  if (!FIXTURE_SHA_RE.test(expected)) {
    throw new Error('TSV_CAPTURE_FIXTURE_SHA256 must be a full 64-character lowercase hex digest');
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(`capture replay fixture digest mismatch (expected ${expected}, got ${actual})`);
  }
}

export function prepareTimelineReplay(bytes) {
  const binding = resolveCaptureProducerBinding();
  assertFixtureDigest(bytes);
  const { payload, timelineReplay } = prepareFixtureReplaySharedTrip(bytes);
  timelineReplay.render_head = binding.renderHead;
  timelineReplay.replay_producer_head = binding.sha;
  timelineReplay.fixture_sha256 = String(process.env.TSV_CAPTURE_FIXTURE_SHA256 || '').trim().toLowerCase();
  return { payload, timelineReplay };
}
