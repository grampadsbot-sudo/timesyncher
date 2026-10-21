#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareFixtureReplaySharedTrip } from '../src/vacation/shared-trip-fixture-replay.mjs';
import { rowSummary } from '../apps/vacation-client/src/lib/listTabModel.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const captureDir = path.join(repo, 'scripts/ops/capture');
const headSha = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

function narrativeWordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function runTimelineReplay(env, fixtureBytes) {
  const tmp = path.join(os.tmpdir(), `tsv-replay-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tmp, fixtureBytes);
  const driver = `
    import { prepareTimelineReplay } from ${JSON.stringify(pathToFileURL(path.join(captureDir, 'timeline-replay.mjs')).href)};
    import fs from 'node:fs';
    const b = fs.readFileSync(process.argv[1]);
    try {
      const r = prepareTimelineReplay(b);
      process.stdout.write(JSON.stringify({ ok: true, timelineReplay: r.timelineReplay, payloadLen: r.payload.length }));
    } catch (e) {
      console.error(String(e.message || e));
      process.exit(1);
    }
  `;
  const res = spawnSync('node', ['--input-type=module', '-e', driver, tmp], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  fs.unlinkSync(tmp);
  return res;
}

function bindingEnv(sha, renderHead, fixturePath, fixtureDigest) {
  const py = `
import json, os, sys
sys.path.insert(0, os.path.join(${JSON.stringify(repo)}, 'scripts', 'ops', 'dispatch'))
from capture_replay_binding import capture_replay_env_for_pair, pair_from_fixture
pair = pair_from_fixture(${JSON.stringify(renderHead)}, ${JSON.stringify(sha)}, ${JSON.stringify(fixturePath)}, ${JSON.stringify(fixtureDigest)})
print(json.dumps(capture_replay_env_for_pair(pair, ${JSON.stringify(repo)})))
`;
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim();
  return JSON.parse(out);
}

const smokeFixture = {
  places: [{
    id: 49,
    name: 'Smoke',
    category_name: 'Activity',
    description: 'Documented NYC option (music)',
    price: 45,
  }],
  thingOverrides: {
    'place:49': { timeline: false, startTime: '9:00 PM' },
  },
};
const fixtureBytes = Buffer.from(JSON.stringify(smokeFixture));
const fixturePath = path.join(os.tmpdir(), `tsv-smoke-fixture-${process.pid}.json`);
fs.writeFileSync(fixturePath, fixtureBytes);
const fixtureDigest = createHash('sha256').update(fixtureBytes).digest('hex');
const rawTrip = JSON.parse(fixtureBytes.toString('utf8'));
const rawPlace = rawTrip.places.find((place) => place.id === 49);
const rawWords = narrativeWordCount(rowSummary(rawPlace, rawTrip));
assert.ok(rawWords < 10, `raw fixture row must stay thin (${rawWords} words)`);

const boundEnv = bindingEnv(headSha, headSha, fixturePath, fixtureDigest);
const okRun = runTimelineReplay(boundEnv, fixtureBytes);
assert.equal(okRun.status, 0, okRun.stderr || okRun.stdout);
const okData = JSON.parse(okRun.stdout);
const { served } = prepareFixtureReplaySharedTrip(fixtureBytes);
const servedPlace = served.places.find((place) => place.id === 49);
const servedWords = narrativeWordCount(rowSummary(servedPlace, served));
assert.ok(servedWords >= 30, `replay must bind stored ccab narrative (${servedWords} words)`);
assert.equal(okData.timelineReplay.source_fixture_sha256, fixtureDigest);
assert.equal(okData.timelineReplay.render_head, headSha);
assert.equal(okData.timelineReplay.replay_producer_head, headSha);

const otherRender = 'c'.repeat(40);
const splitRenderEnv = bindingEnv(headSha, otherRender, fixturePath, fixtureDigest);
assert.equal(splitRenderEnv.TSV_CAPTURE_RENDER_HEAD_SHA, otherRender);
assert.equal(splitRenderEnv.TSV_CAPTURE_PRODUCER_HEAD_SHA, headSha);
assert.equal(splitRenderEnv.TSV_CAPTURE_REPO_ROOT, boundEnv.TSV_CAPTURE_REPO_ROOT);

const shortSha = {
  ...boundEnv,
  TSV_CAPTURE_PRODUCER_HEAD_SHA: headSha.slice(0, 7),
};
const shortRun = runTimelineReplay(shortSha, fixtureBytes);
assert.notEqual(shortRun.status, 0);
assert.match(shortRun.stderr + shortRun.stdout, /full 40-character/i);

const missingRender = { ...boundEnv };
delete missingRender.TSV_CAPTURE_RENDER_HEAD_SHA;
const missingRenderRun = runTimelineReplay(missingRender, fixtureBytes);
assert.notEqual(missingRenderRun.status, 0);
assert.match(missingRenderRun.stderr + missingRenderRun.stdout, /RENDER_HEAD/i);

const wrongDigest = { ...boundEnv, TSV_CAPTURE_FIXTURE_SHA256: '0'.repeat(64) };
const digestRun = runTimelineReplay(wrongDigest, fixtureBytes);
assert.notEqual(digestRun.status, 0);
assert.match(digestRun.stderr + digestRun.stdout, /digest mismatch/i);

const wrongHead = {
  ...boundEnv,
  TSV_CAPTURE_PRODUCER_HEAD_SHA: 'a'.repeat(40),
};
const wrongRun = runTimelineReplay(wrongHead, fixtureBytes);
assert.notEqual(wrongRun.status, 0);
assert.match(wrongRun.stderr + wrongRun.stdout, /HEAD/i);

const missing = runTimelineReplay({}, fixtureBytes);
assert.notEqual(missing.status, 0);
assert.match(missing.stderr + missing.stdout, /binding missing/i);

const badJson = runTimelineReplay(boundEnv, Buffer.from('{not json'));
assert.notEqual(badJson.status, 0);

const dirtyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tsv-dirty-producer-'));
execFileSync('git', ['init'], { cwd: dirtyRoot });
const producerRel = 'src/vacation/shared-trip-fixture-replay.mjs';
fs.mkdirSync(path.dirname(path.join(dirtyRoot, producerRel)), { recursive: true });
const producerFile = path.join(dirtyRoot, producerRel);
const producerStub = [
  'export function ',
  'prepareFixtureReplaySharedTrip',
  '(bytes) { return { payload: {}, timelineReplay: { policy: "timeline-explicit-v1", source_fixture_sha256: "',
  '0'.repeat(64),
  '", served_payload_sha256: "',
  '1'.repeat(64),
  '", selected_place_keys: [] } }; }',
].join('');
fs.writeFileSync(producerFile, producerStub);
const gitAuthorEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'tsv-test',
  GIT_AUTHOR_EMAIL: 'tsv-test@local',
  GIT_COMMITTER_NAME: 'tsv-test',
  GIT_COMMITTER_EMAIL: 'tsv-test@local',
};
execFileSync('git', ['add', '-A'], { cwd: dirtyRoot, env: gitAuthorEnv });
execFileSync('git', ['commit', '-m', 'producer'], { cwd: dirtyRoot, env: gitAuthorEnv });
const dirtyHead = execFileSync('git', ['-C', dirtyRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
fs.appendFileSync(producerFile, '\n');
const dirtyEnv = {
  TSV_CAPTURE_REPO_ROOT: dirtyRoot,
  TSV_CAPTURE_PRODUCER_HEAD_SHA: dirtyHead,
  TSV_CAPTURE_RENDER_HEAD_SHA: dirtyHead,
  TSV_CAPTURE_FIXTURE_SHA256: fixtureDigest,
};
const dirtyRun = runTimelineReplay(dirtyEnv, fixtureBytes);
assert.notEqual(dirtyRun.status, 0);
assert.match(dirtyRun.stderr + dirtyRun.stdout, /tracked modifications/i);
fs.rmSync(dirtyRoot, { recursive: true, force: true });

const captureSrc = fs.readFileSync(path.join(captureDir, 'capture.mjs'), 'utf8');
assert.match(captureSrc, /prepareTimelineReplay/);
assert.match(captureSrc, /const TOKEN = 'gateb-fixture-replay';/);
assert.doesNotMatch(captureSrc, /capture_binding/);

const py = spawnSync('python3', [path.join(repo, 'scripts/test_capture_replay_binding.py')], {
  encoding: 'utf8',
});
assert.equal(py.status, 0, py.stderr || py.stdout);

const callers = spawnSync('python3', [path.join(repo, 'scripts/test_capture_replay_callers.py')], {
  encoding: 'utf8',
});
assert.equal(callers.status, 0, callers.stderr || callers.stdout);

console.log(
  'capture-fixture-replay-harness OK:',
  JSON.stringify({ rawWords, servedWords, producerHead: headSha.slice(0, 7) }),
);
