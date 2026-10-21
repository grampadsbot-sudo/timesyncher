import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  const inputPath = join(os.tmpdir(), `tsv-replay-in-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(inputPath, bytes);
  const driver = `
    import { prepareFixtureReplaySharedTrip } from ${JSON.stringify(pathToFileURL(binding.producerPath).href)};
    import fs from 'node:fs';
    const b = fs.readFileSync(process.argv[1]);
    const { payload, timelineReplay } = prepareFixtureReplaySharedTrip(b);
    timelineReplay.render_head = ${JSON.stringify(binding.renderHead)};
    timelineReplay.replay_producer_head = ${JSON.stringify(binding.sha)};
    timelineReplay.fixture_sha256 = ${JSON.stringify(process.env.TSV_CAPTURE_FIXTURE_SHA256 || '')};
    process.stdout.write(JSON.stringify({
      payloadB64: Buffer.from(payload).toString('base64'),
      timelineReplay,
    }));
  `;
  let raw;
  try {
    raw = execFileSync('node', ['--input-type=module', '-e', driver, inputPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } finally {
    try {
      fs.unlinkSync(inputPath);
    } catch {
      void 0;
    }
  }
  const parsed = JSON.parse(raw);
  return {
    payload: Buffer.from(parsed.payloadB64, 'base64'),
    timelineReplay: parsed.timelineReplay,
  };
}
