#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildVkHeadCaptureFixture } from './build-vk-head-capture-fixture.mjs';
import { bindingVerdict } from './vk-capture-payload-binding.mjs';
import { verifyReviewedCollectorPins } from './vk-gateb-collector-pin.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const jobRoot = process.env.VK477_JOB_ROOT
  || '/home/ubishere9995/tsv-dispatch/vk-477-harness-20261018-job';
const outDir = path.join(jobRoot, 'binding-proof');
mkdirSync(outDir, { recursive: true });

const setup = spawnSync(process.execPath, ['scripts/ops/verification/setup-reviewed-collector-job.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (setup.status !== 0) {
  process.stderr.write(setup.stderr || setup.stdout || 'collector job setup failed\n');
  process.exit(setup.status || 1);
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'git rev-parse failed');
  return r.stdout.trim();
}

const snapshotPath = path.join(root, 'scripts/fixtures/pr336-vk-search-places.snapshot.json');
const staticBase = new URL('./fixtures/vk-capture-static-base.stub.json', import.meta.url);
const boundFixture = path.join(outDir, 'head-capture-bound.json');
const manifestPath = path.join(outDir, 'capture-manifest.json');

buildVkHeadCaptureFixture(fileURLToPath(staticBase), snapshotPath, boundFixture);

const snapshotSha256 = sha256File(snapshotPath);
const fixtureSha256 = sha256File(boundFixture);
const repoHeadSha = gitHead();

const staticVerdict = bindingVerdict(snapshotPath, fileURLToPath(staticBase));
const boundVerdict = bindingVerdict(snapshotPath, boundFixture);

const contractRun = spawnSync(process.execPath, ['scripts/vk_contract_check_local.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
const contractOk = contractRun.status === 0;

const collectorRoot = process.env.VK_GATEB_COLLECTOR_ROOT
  || path.join(jobRoot, 'reviewed-collector-ec4d40de');
const collector = verifyReviewedCollectorPins({ collectorRoot });
const stalePinRoot = process.env.VK_STALE_COLLECTOR_ROOT || '/home/ubishere9995/tsv-gateb-pin-ec4d40de';
const staleCollector = verifyReviewedCollectorPins({ collectorRoot: stalePinRoot });

writeFileSync(
  manifestPath,
  `${JSON.stringify({
    repoHeadSha,
    snapshotPath,
    snapshotSha256,
    fixture: boundFixture,
    fixtureSha256,
    data_snapshot: snapshotPath,
    data_snapshot_sha256: snapshotSha256,
    fixture_sha256: fixtureSha256,
  }, null, 2)}\n`,
  'utf8',
);

const payload = {
  repoHeadSha,
  snapshotSha256,
  fixtureSha256,
  staticBaseVerdict: staticVerdict,
  boundFixtureVerdict: boundVerdict,
  vkContractCheckOk: contractOk,
  collector,
  staleCollectorRejected: !staleCollector.ok,
  manifestPath,
  boundFixture,
};

writeFileSync(path.join(outDir, 'binding-proof.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(payload)}\n`);

const fail =
  boundVerdict.overall !== 'PASS'
  || staticVerdict.overall === 'PASS'
  || !contractOk
  || !collector.ok
  || !staleCollector.ok;
process.exit(fail ? 1 : 0);
