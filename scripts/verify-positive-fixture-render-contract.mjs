#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { GATE_B_APPROVED_SHARED_SLUG } from './fixtures/gate-b-approved-shared-trip.mjs';
import { buildNycCraigKimDaybydayTrip } from './fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  buildNycCraigKimDaybydayTripPositiveV1,
  NYC_POSITIVE_FIXTURE_VERSION,
} from './fixtures/nyc-craig-kim-daybyday-positive-v1.mjs';
import { gateBNycFixturePayloadSha256 } from './lib/gate-b-nyc-fixture-contract.mjs';
import {
  ensureBuiltClient,
  gitSha,
  payloadBytesDigest,
  runRenderedContract,
} from './lib/positive-fixture-render-contract-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const POSITIVE_PAYLOAD_SHA256 =
  '98119a045d6b3053816cc5b97bc183fb2b33c605bc0f7878740d52116c75b9c8';
const POSITIVE_PAYLOAD_BYTES = 711352;

function parseArtifactDir(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--artifact-dir=')) return arg.slice('--artifact-dir='.length);
  }
  return process.env.TSV343_ARTIFACT_DIR || path.join(root, 'evidence', 'tsv-343-positive-render-contract');
}

async function main() {
  const artifactDir = parseArtifactDir(process.argv.slice(2));
  await mkdir(artifactDir, { recursive: true });

  const sourceSha = gitSha();
  await ensureBuiltClient(sourceSha);
  const buildSha = gitSha();

  const positiveTrip = buildNycCraigKimDaybydayTripPositiveV1();
  const positiveJson = JSON.stringify(positiveTrip);
  const positiveDigest = payloadBytesDigest(positiveTrip);
  if (positiveDigest.bytes !== POSITIVE_PAYLOAD_BYTES || positiveDigest.sha256 !== POSITIVE_PAYLOAD_SHA256) {
    console.error(
      JSON.stringify(
        {
          pass: false,
          blocked: 'positive payload bytes/sha256 mismatch',
          expected: { bytes: POSITIVE_PAYLOAD_BYTES, sha256: POSITIVE_PAYLOAD_SHA256 },
          actual: { bytes: positiveDigest.bytes, sha256: positiveDigest.sha256 },
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const negativeTrip = finalizeServedSharedTripPayload(buildNycCraigKimDaybydayTrip());
  const negativeJson = JSON.stringify(negativeTrip);

  const positive = await runRenderedContract({
    profile: 'positive',
    trip: positiveTrip,
    tripJson: positiveJson,
    slug: GATE_B_APPROVED_SHARED_SLUG,
    sourceSha: buildSha,
    expectPass: true,
  });

  const negative = await runRenderedContract({
    profile: 'negative',
    trip: negativeTrip,
    tripJson: negativeJson,
    slug: `${GATE_B_APPROVED_SHARED_SLUG}-negative`,
    sourceSha: buildSha,
    expectPass: false,
  });

  const report = {
    check: 'positive-fixture-render-contract',
    pass: positive.pass && negative.pass,
    sourceGitSha: sourceSha,
    buildGitSha: buildSha,
    fixtureVersion: NYC_POSITIVE_FIXTURE_VERSION,
    payloadBytesSha256: positiveDigest.sha256,
    payloadBytes: positiveDigest.bytes,
    contractProjectionSha256: gateBNycFixturePayloadSha256(positiveTrip),
    command: 'node scripts/verify-positive-fixture-render-contract.mjs',
    positive,
    negative,
    notGateBVerdict: true,
  };

  const outPath = path.join(artifactDir, 'positive-fixture-render-contract.json');
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
