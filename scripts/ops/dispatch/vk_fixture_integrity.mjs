#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildNycCraigKimDaybydayTrip } from '../../fixtures/nyc-craig-kim-daybyday-trip.mjs';
import { finalizeServedSharedTripPayload } from '../../../src/vacation/shared-trip-served-page.mjs';
import { gateBNycFixturePayloadSha256 } from '../../lib/gate-b-nyc-fixture-contract.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function sha256File(url) {
  const body = readFileSync(url);
  return createHash('sha256').update(body).digest('hex');
}

function gitHeadSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git rev-parse HEAD failed');
  }
  return result.stdout.trim();
}

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, [relativePath], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

const snapshotPath = new URL('../../fixtures/pr336-vk-search-places.snapshot.json', import.meta.url);
const snapshotSha256 = sha256File(snapshotPath);

const rawTrip = buildNycCraigKimDaybydayTrip();
const served = finalizeServedSharedTripPayload(rawTrip);
const bindingSha256 = gateBNycFixturePayloadSha256(served);

const contractErrors = [];
for (const script of [
  'scripts/vk_contract_check_local.mjs',
  'scripts/vk_search_place_source_contract_check.mjs',
]) {
  const run = runNodeScript(script);
  if (!run.ok) {
    contractErrors.push(`${script}: exit ${run.status}${run.stderr ? ` ${run.stderr.trim().slice(0, 400)}` : ''}`);
  }
}

const payload = {
  ok: contractErrors.length === 0,
  repoHeadSha: gitHeadSha(),
  snapshotSha256,
  bindingSha256,
  contractErrors,
};

process.stdout.write(`${JSON.stringify(payload)}\n`);
process.exit(payload.ok ? 0 : 1);
