#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  COMMITTED_PROOF_FIXTURE_IDS,
  COMMITTED_PROOF_JOB_ID,
  NO_MATCH_TEMPLATE,
  committedProofDigest,
  compactReceipt,
  evaluateStopRules,
  isRealOggAudio,
  isVoiceSurface,
  listFixtureFiles,
  loadFixture,
  noApplyCopy,
  noApplyHeard,
  noMatchCopy,
  runVacationEditPipeline,
  stableJobId,
  writeAllCommittedDryRunProofs,
} from '../src/vacation/edit-pipeline.mjs';
import { createTrekFixtureStore, placeDay } from '../src/vacation/trek-fixture-store.mjs';
import {
  REVIEWER_CI_COMMANDS,
  attestArtifactNameForSha,
  attestVacationVerifyJob,
  bindCommittedReceipt,
  committedReceiptShaAllowed,
  doctorArtifactNameForSha,
  doctorJsonFieldsOk,
  doctorJsonOk,
  doctorReportOk,
  gitRevParse,
  inspectCiAttestation,
  missingReviewerCiCommands,
  parseWorkflowRunCommands,
  readCommittedCiReceipt,
  requireCommittedCiReceipt,
} from '../src/vacation/ci-attestation.mjs';

const cwd = process.cwd();
const ciWorkflow = fs.readFileSync(path.join(cwd, '.github', 'workflows', 'vacation-verify.yml'), 'utf8');
assert.deepEqual(missingReviewerCiCommands(ciWorkflow), []);
assert.ok(parseWorkflowRunCommands(ciWorkflow).some((line) => line.startsWith('node scripts/control-vacation.mjs doctor')));
assert.ok(!/set \+e/.test(ciWorkflow), 'gate must not ignore doctor exit with set +e');
assert.ok(!/set \+o pipefail/.test(ciWorkflow), 'gate must not ignore doctor exit with set +o pipefail');
assert.ok(ciWorkflow.includes('doctorJsonOk'), 'uploaded doctor.json must be checked for ok:true');
assert.ok(ciWorkflow.includes('vacation-verify-attest-'), 'attest job must upload a proof artifact');
assert.ok(ciWorkflow.includes('vacation-verify-bind:'), 'default doctor path must run in vacation-verify-bind');
assert.ok(!ciWorkflow.includes('--produce-gate'), 'produce-gate must not bypass doctor.ok');
assert.ok(!ciWorkflow.includes('--produce-attest'), 'produce-attest must not bypass doctor.ok');
assert.ok(parseWorkflowRunCommands(ciWorkflow).some((line) => (
  line.startsWith('node scripts/control-vacation.mjs doctor --json')
  && !line.includes('--produce-')
)), 'workflow must run default doctor --json');
assert.ok(/fetch-depth:\s*0/.test(ciWorkflow), 'CI checkout must have history for ancestor receipt bind');
const commentOnly = [
  'name: vacation-verify',
  'jobs:',
  '  vacation-verify:',
  '    steps:',
  '      # node scripts/control-vacation.mjs doctor',
  '      - run: echo "node scripts/control-vacation.mjs doctor"',
  '      - run: echo "node scripts/control-vacation.mjs dry-run --all-fixtures"',
  `      - run: echo "${REVIEWER_CI_COMMANDS[2]}"`,
  `      - run: echo "${REVIEWER_CI_COMMANDS[3]}"`,
  `      - run: echo "${REVIEWER_CI_COMMANDS[4]}"`,
].join('\n');
assert.deepEqual(missingReviewerCiCommands(commentOnly), [...REVIEWER_CI_COMMANDS]);
const shaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const successRun = {
  id: 33817831176,
  name: 'vacation-verify',
  path: '.github/workflows/vacation-verify.yml',
  head_sha: shaB,
  conclusion: 'success',
};
const successJob = { id: 100853800148, name: 'vacation-verify', conclusion: 'success', status: 'completed' };
const successDoctorJob = { id: 100855092982, name: 'vacation-verify-doctor', conclusion: 'success', status: 'completed' };
const successGateJob = { id: 100856986539, name: 'vacation-verify-gate', conclusion: 'success', status: 'completed' };
const successAttestJob = { id: 100858000001, name: 'vacation-verify-attest', conclusion: 'success', status: 'completed' };
const successArtifact = {
  id: 9917176993,
  name: `vacation-verify-${shaB}`,
  digest: 'sha256:f5915a7de9d18017957507b6f3a7a9031ddaea396456bc786d9466d3ff621163',
};
const successMarkerArtifact = {
  id: 9917309579,
  name: `vacation-verify-doctor-${shaB}`,
  digest: 'sha256:3467be0cbc93a616e466ff8b3d2ee2513701acd9c149f1e46cb47d3160dba6cb',
};
const successGateArtifact = {
  id: 9917522696,
  name: `vacation-verify-gate-${shaB}`,
  digest: 'sha256:24e8627baf5c0550792c026121d3733d3c2da8e6618ebf2432bb0c1076e61a30',
};
const successAttestArtifact = {
  id: 9917600001,
  name: `vacation-verify-attest-${shaB}`,
  digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};
const successBindJob = { id: 100859000001, name: 'vacation-verify-bind', conclusion: 'success', status: 'completed' };
const successBindArtifact = {
  id: 9917700001,
  name: `vacation-verify-bind-${shaB}`,
  digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
};
const matchingReceipt = {
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  doctor_conclusion: 'success',
  attest_conclusion: 'success',
  workflow: 'vacation-verify',
  job_id: '100853800148',
  doctor_job_id: '100855092982',
  gate_job_id: '100856986539',
  attest_job_id: '100858000001',
  jobs: {
    'vacation-verify': 'success',
    'vacation-verify-doctor': 'success',
    'vacation-verify-gate': 'success',
    'vacation-verify-attest': 'success',
  },
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
};
const okDoctorJson = {
  ok: true,
  checks: {
    feature_map: true,
    skill: true,
    pipeline_syntax: true,
    ci_workflow: true,
    ci_attestation: true,
    committed_proof: true,
  },
  ci_attestation: {
    ok: true,
    run_id: '33817831176',
    job_id: '100853800148',
    doctor_job_id: '100855092982',
    gate_job_id: '100856986539',
    attest_job_id: '100858000001',
    conclusion: 'success',
    doctor_conclusion: 'success',
    attest_conclusion: 'success',
    artifact_digest: successArtifact.digest,
    doctor_artifact_digest: successGateArtifact.digest,
    attest_artifact_digest: successAttestArtifact.digest,
  },
};
assert.equal(doctorJsonOk(okDoctorJson), true);
assert.equal(doctorJsonFieldsOk({ ...okDoctorJson, ok: false }), true);
assert.equal(doctorJsonOk({ ...okDoctorJson, ok: false }), false, 'fields without ok:true are not a passing doctor.json');
assert.equal(doctorArtifactNameForSha(shaB), `vacation-verify-gate-${shaB}`);
assert.equal(attestArtifactNameForSha(shaB), `vacation-verify-attest-${shaB}`);
assert.equal(doctorJsonOk({ ok: true }), false, 'shallow {ok:true} must fail-closed');
assert.equal(doctorJsonOk({ ok: false }), false);
assert.equal(doctorJsonOk({}), false);
assert.equal(doctorReportOk({
  feature_map: true,
  skill: true,
  pipeline_syntax: true,
  ci_workflow: true,
  committed_proof: true,
  ci_attestation: false,
}), false, 'produce-style local checks must not pass doctor.ok without ci_attestation');
const forgedEnv = inspectCiAttestation({
  cwd,
  sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  env: { GITHUB_ACTIONS: 'true', GITHUB_WORKFLOW: 'vacation-verify', GITHUB_RUN_ID: '1' },
  fetchRun: () => null,
  fetchRuns: () => [],
  receipt: matchingReceipt,
});
assert.equal(forgedEnv.ok, false, 'forged GITHUB_* env without a real run must fail-closed');
const receiptOnly = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: {
    sha: shaB,
    run_id: 33817831176,
    conclusion: 'success',
    workflow: 'vacation-verify',
    artifact_digest: successArtifact.digest,
    doctor_artifact_digest: successGateArtifact.digest,
    attest_artifact_digest: successAttestArtifact.digest,
  },
  fetchRuns: () => [],
});
assert.equal(receiptOnly.ok, false, 'committed receipt must not skip GitHub API');
const inProgress = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: { GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '33817831176' },
  receipt: matchingReceipt,
  fetchRun: () => ({ ...successRun, conclusion: null, status: 'in_progress' }),
  fetchJobs: () => [{ ...successJob, conclusion: null, status: 'in_progress' }],
  fetchArtifacts: () => [successArtifact],
});
assert.equal(inProgress.ok, false, 'in_progress vacation-verify job must not pass doctor');
const allJobs = [successJob, successDoctorJob, successGateJob, successAttestJob];
const allArtifacts = [successArtifact, successMarkerArtifact, successGateArtifact, successAttestArtifact];
const fetchOkDoctorJson = () => okDoctorJson;
const noDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => [{ ...successArtifact, digest: null }, successMarkerArtifact, successGateArtifact],
});
assert.equal(noDigest.ok, false, 'missing artifact digest must fail-closed');
const harnessOnly = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [successJob],
  fetchArtifacts: () => [successArtifact],
});
assert.equal(harnessOnly.ok, false, 'harness job success alone must not pass doctor attestation');
const doctorFailed = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [successJob, { ...successDoctorJob, conclusion: 'failure' }, successGateJob],
  fetchArtifacts: () => allArtifacts,
});
assert.equal(doctorFailed.ok, false, 'failed vacation-verify-doctor job must fail-closed');
const markerOnly = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [successJob, successDoctorJob],
  fetchArtifacts: () => [successArtifact, successMarkerArtifact],
});
assert.equal(markerOnly.ok, false, 'marker digest must not count as doctor proof');
assert.match(attestVacationVerifyJob({
  run: successRun,
  jobs: [successJob, successDoctorJob],
  artifacts: [successArtifact, successMarkerArtifact],
  sha: shaB,
}).reason, /marker-only|vacation-verify-gate/);
const doctorNoDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => [successArtifact, successMarkerArtifact],
});
assert.equal(doctorNoDigest.ok, false, 'gate job without gate doctor.json digest must fail-closed');
const digestOnly = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
});
assert.equal(digestOnly.ok, false, 'artifact name+digest without obtained doctor.json must fail-closed');
const bound = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(bound.ok, true);
assert.equal(bound.run_id, '33817831176');
assert.equal(bound.job_id, '100853800148');
assert.equal(bound.doctor_job_id, '100855092982');
assert.equal(bound.gate_job_id, '100856986539');
assert.equal(bound.conclusion, 'success');
assert.equal(bound.doctor_conclusion, 'success');
assert.equal(bound.artifact_digest, successArtifact.digest);
assert.equal(bound.doctor_artifact_digest, successGateArtifact.digest);
assert.equal(bound.attest_job_id, '100858000001');
assert.equal(bound.attest_conclusion, 'success');
assert.equal(bound.attest_artifact_digest, successAttestArtifact.digest);
assert.notEqual(bound.doctor_artifact_digest, successMarkerArtifact.digest);
const receiptMismatch = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: {
    sha: shaB,
    run_id: 33817831176,
    conclusion: 'success',
    workflow: 'vacation-verify',
    artifact_digest: 'sha256:deadbeef',
    doctor_artifact_digest: successGateArtifact.digest,
  },
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(receiptMismatch.ok, false, 'committed receipt digest must match live artifact');
const midJobDoctor = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '33817831176',
    GITHUB_JOB: 'vacation-verify-doctor',
  },
  receipt: matchingReceipt,
  fetchRun: () => ({ ...successRun, conclusion: null, status: 'in_progress' }),
  fetchJobs: () => [successJob, { ...successDoctorJob, conclusion: null, status: 'in_progress' }],
  fetchArtifacts: () => [successArtifact],
});
assert.equal(midJobDoctor.ok, false, 'GITHUB_JOB=vacation-verify-doctor must not pass while doctor job is in_progress');
const midJobNoDoctorDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '33817831176',
    GITHUB_JOB: 'vacation-verify-gate',
  },
  receipt: matchingReceipt,
  fetchRun: () => ({ ...successRun, conclusion: null, status: 'in_progress' }),
  fetchJobs: () => [successJob, successDoctorJob, { ...successGateJob, conclusion: null, status: 'in_progress' }],
  fetchArtifacts: () => [successArtifact, successMarkerArtifact],
});
assert.equal(midJobNoDoctorDigest.ok, false, 'GITHUB_JOB=vacation-verify-gate must not pass without gate doctor.json digest');
const liveMidAttest = attestVacationVerifyJob({
  run: { ...successRun, conclusion: null, status: 'in_progress' },
  jobs: [successJob, { ...successDoctorJob, conclusion: null, status: 'in_progress' }],
  artifacts: [successArtifact],
  sha: shaB,
});
assert.equal(liveMidAttest.ok, false);
assert.match(liveMidAttest.reason, /vacation-verify-doctor job conclusion/);
const receiptMissingDoctorDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: {
    sha: shaB,
    run_id: 33817831176,
    conclusion: 'success',
    workflow: 'vacation-verify',
    artifact_digest: successArtifact.digest,
  },
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(receiptMissingDoctorDigest.ok, false, 'receipt missing doctor_artifact_digest must not match');
assert.equal(bindCommittedReceipt({
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  workflow: 'vacation-verify',
  artifact_digest: successArtifact.digest,
}, {
  sha: shaB,
  run_id: '33817831176',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
}).ok, false);
assert.equal(bindCommittedReceipt({
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  workflow: 'vacation-verify',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successMarkerArtifact.digest,
}, {
  sha: shaB,
  run_id: '33817831176',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
}).ok, false, 'receipt bound to marker digest must not match gate doctor.json digest');
assert.equal(bindCommittedReceipt({
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  workflow: 'vacation-verify',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
}, {
  sha: shaB,
  run_id: '33817831176',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
}).ok, false, 'receipt missing attest_artifact_digest must not match');
assert.equal(bindCommittedReceipt({
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  workflow: 'vacation-verify',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
}, {
  sha: shaB,
  run_id: '33817831176',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
}).ok, false, 'receipt missing job conclusions must not bind');
assert.equal(bindCommittedReceipt({
  sha: shaB,
  run_id: 33817831176,
  conclusion: 'success',
  doctor_conclusion: 'success',
  attest_conclusion: 'success',
  workflow: 'vacation-verify',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
}, {
  sha: shaB,
  run_id: '33817831176',
  artifact_digest: successArtifact.digest,
  doctor_artifact_digest: successGateArtifact.digest,
  attest_artifact_digest: successAttestArtifact.digest,
}).ok, true);
const receiptDoctorMatch = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: {
    sha: shaB,
    run_id: 33817831176,
    conclusion: 'success',
    doctor_conclusion: 'success',
    attest_conclusion: 'success',
    workflow: 'vacation-verify',
    artifact_digest: successArtifact.digest,
    doctor_artifact_digest: successGateArtifact.digest,
    attest_artifact_digest: successAttestArtifact.digest,
  },
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(receiptDoctorMatch.ok, true);
assert.equal(requireCommittedCiReceipt(null).ok, false);
assert.equal(requireCommittedCiReceipt(readCommittedCiReceipt(cwd)).ok, true);
const committedSha = readCommittedCiReceipt(cwd).sha;
assert.equal(committedReceiptShaAllowed(committedSha, committedSha, cwd), true);
assert.equal(committedReceiptShaAllowed(committedSha, gitRevParse(cwd), cwd), true, 'committed receipt SHA must be HEAD or an ancestor (full clone)');
const missingReceiptCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'vac-verify-ci-'));
const missingReceipt = inspectCiAttestation({
  cwd: missingReceiptCwd,
  sha: shaB,
  env: {},
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(missingReceipt.ok, false, 'doctor must fail-closed when committed CI receipt is missing');
assert.equal(missingReceipt.reason, 'committed_ci_receipt_missing');
const noAttestJob = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [successJob, successDoctorJob, successGateJob],
  fetchArtifacts: () => [successArtifact, successMarkerArtifact, successGateArtifact],
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(noAttestJob.ok, false, 'deleting vacation-verify-attest must fail attestation');
assert.match(attestVacationVerifyJob({
  run: successRun,
  jobs: [successJob, successDoctorJob, successGateJob],
  artifacts: [successArtifact, successMarkerArtifact, successGateArtifact],
  sha: shaB,
  doctorJson: { ok: true },
}).reason, /vacation-verify-attest/);
const attestSkipped = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [successJob, successDoctorJob, successGateJob, { ...successAttestJob, conclusion: 'skipped' }],
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(attestSkipped.ok, false, 'skipped vacation-verify-attest must fail attestation');
const attestNoDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => [successArtifact, successMarkerArtifact, successGateArtifact],
});
assert.equal(attestNoDigest.ok, false, 'attest job without attest doctor.json digest must fail-closed');
const doctorJsonFalse = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  doctorJson: { ok: false, checks: { ci_attestation: false } },
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
});
assert.equal(doctorJsonFalse.ok, false, 'ok:false doctor.json must not bind even with job success + digests');
assert.equal(attestVacationVerifyJob({
  run: successRun,
  jobs: allJobs,
  artifacts: allArtifacts,
  sha: shaB,
  doctorJson: { ok: false },
}).ok, false);
const doctorJsonTrue = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  doctorJson: okDoctorJson,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
});
assert.equal(doctorJsonTrue.ok, true);
const nullReceiptSkipsNothing = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: null,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(nullReceiptSkipsNothing.ok, false, 'receipt: null must not skip the missing-receipt gate');
assert.equal(nullReceiptSkipsNothing.reason, 'committed_ci_receipt_missing');
const bindPresentNoDigest = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [...allJobs, successBindJob],
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(bindPresentNoDigest.ok, false, 'bind job without bind doctor.json digest must fail-closed');
const bindBound = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => [...allJobs, successBindJob],
  fetchArtifacts: () => [...allArtifacts, successBindArtifact],
  fetchDoctorJson: fetchOkDoctorJson,
});
assert.equal(bindBound.ok, true);
assert.equal(bindBound.bind_job_id, '100859000001');
const downloadedFalse = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {},
  receipt: matchingReceipt,
  fetchRuns: () => [successRun],
  fetchJobs: () => allJobs,
  fetchArtifacts: () => allArtifacts,
  fetchDoctorJson: () => ({ ok: false }),
});
assert.equal(downloadedFalse.ok, false, 'downloaded doctor.json ok:false must fail-closed');
const midAttestProduces = attestVacationVerifyJob({
  run: successRun,
  jobs: [successJob, successDoctorJob, successGateJob, { ...successAttestJob, conclusion: null, status: 'in_progress' }],
  artifacts: [successArtifact, successMarkerArtifact, successGateArtifact],
  sha: shaB,
  env: {
    GITHUB_ACTIONS: 'true',
    GITHUB_JOB: 'vacation-verify-attest',
    GITHUB_RUN_ID: '33817831176',
  },
  doctorJson: { ok: true },
});
assert.equal(midAttestProduces.ok, false, 'in_progress vacation-verify-attest must not pass attestation');
assert.equal(midAttestProduces.attest_artifact_digest, null);
assert.match(midAttestProduces.reason, /vacation-verify-attest job conclusion/);
const midAttestInspect = inspectCiAttestation({
  cwd,
  sha: shaB,
  env: {
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '33817831176',
    GITHUB_JOB: 'vacation-verify-attest',
  },
  receipt: matchingReceipt,
  doctorJson: { ok: true },
  fetchRun: () => ({ ...successRun, conclusion: null, status: 'in_progress' }),
  fetchJobs: () => [successJob, successDoctorJob, successGateJob, { ...successAttestJob, conclusion: null, status: 'in_progress' }],
  fetchArtifacts: () => [successArtifact, successMarkerArtifact, successGateArtifact],
});
assert.equal(midAttestInspect.ok, false, 'GITHUB_JOB=vacation-verify-attest must not pass while attest is in_progress');
const attestSuccessNoDigest = attestVacationVerifyJob({
  run: successRun,
  jobs: allJobs,
  artifacts: [successArtifact, successMarkerArtifact, successGateArtifact],
  sha: shaB,
  doctorJson: { ok: true },
});
assert.equal(attestSuccessNoDigest.ok, false, 'attest conclusion=success without digest must fail-closed');
assert.match(attestSuccessNoDigest.reason, /vacation-verify-attest artifact digest missing/);
const forgedAttestSkip = attestVacationVerifyJob({
  run: successRun,
  jobs: [successJob, successDoctorJob, successGateJob],
  artifacts: [successArtifact, successMarkerArtifact, successGateArtifact],
  sha: shaB,
  doctorJson: { ok: true },
  env: {
    GITHUB_ACTIONS: 'true',
    GITHUB_JOB: 'vacation-verify-attest',
    GITHUB_RUN_ID: '33817831176',
  },
});
assert.equal(forgedAttestSkip.ok, false, 'forged GITHUB_JOB=vacation-verify-attest without an attest job must fail');
const committedProofs = writeAllCommittedDryRunProofs({ cwd });
assert.deepEqual(committedProofs.map((row) => row.compact.fixture_id), [...COMMITTED_PROOF_FIXTURE_IDS]);
const committedProof = committedProofs[0];
const committedProofDir = committedProof.dir;
const committedReceipt = JSON.parse(fs.readFileSync(path.join(committedProofDir, 'receipt.json'), 'utf8'));
const committedEvents = fs.readFileSync(path.join(committedProofDir, 'events.jsonl'), 'utf8').trim().split('\n');
assert.equal(committedReceipt.job_id, COMMITTED_PROOF_JOB_ID);
assert.equal(committedReceipt.ok, true);
assert.equal(committedReceipt.events_jsonl, 'features/proof/vac-verify-telegram-text-single-edit/events.jsonl');
assert.equal(committedReceipt.dry_run, 'features/proof/vac-verify-telegram-text-single-edit/dry-run.json');
assert.equal(committedReceipt.artifact_dir, 'features/proof/vac-verify-telegram-text-single-edit');
assert.ok(!path.isAbsolute(committedReceipt.events_jsonl), 'committed receipt paths must be repo-relative');
assert.ok(committedReceipt.stop_rules.length >= 8, 'committed receipt must record stop rules');
assert.ok(fs.existsSync(path.join(cwd, committedReceipt.events_jsonl)));
assert.ok(committedEvents.some((line) => JSON.parse(line).step === 'initialize'));
assert.ok(committedEvents.some((line) => JSON.parse(line).step === 'complete'));
assert.equal(committedEvents.length, 6, 'committed proof events.jsonl must be one initialize→complete pass');
assert.ok(fs.existsSync(path.join(committedProofDir, 'dry-run.json')));
assert.deepEqual(committedReceipt.event_steps, ['initialize', 'lock_identity', 'parse', 'validate', 'copy_check', 'complete']);
const liveSingle = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), { persist: false, cwd });
assert.equal(committedReceipt.proof_digest, committedProofDigest(liveSingle.receipt));
assert.equal(JSON.parse(fs.readFileSync(path.join(committedProofDir, 'dry-run.json'), 'utf8')).proof_digest, committedReceipt.proof_digest);
assert.equal(
  committedProofDigest({ ...liveSingle.receipt, generated_at: '2099-01-01T00:00:00.000Z' }),
  committedReceipt.proof_digest,
  'generated_at is not proof material',
);
assert.notEqual(
  committedProofDigest({ ...liveSingle.receipt, customer_facing_response: 'forged' }),
  committedReceipt.proof_digest,
  'digest must move when receipt material moves',
);
assert.equal(committedReceipt.apply_gate.prove_state_movement, 'hold');
assert.equal(committedReceipt.apply_gate.apply_on_this_receipt, false);
assert.equal(committedReceipt.customer_facing_response, noApplyCopy('Move Bellagio Fountains to day 2'));
assert.doesNotMatch(committedReceipt.customer_facing_response, /^(Moved |Removed )/);
assert.equal(committedReceipt.before_hash, committedReceipt.after_hash);
assert.deepEqual(committedReceipt.writes_applied, []);

for (const proof of committedProofs.filter((row) => String(row.compact.fixture_id).startsWith('thing-media-'))) {
  const receipt = JSON.parse(fs.readFileSync(path.join(proof.dir, 'receipt.json'), 'utf8'));
  const events = fs.readFileSync(path.join(proof.dir, 'events.jsonl'), 'utf8').trim().split('\n');
  const thingRule = receipt.stop_rules.find((rule) => rule.id === 'fail_closed_thing_id');
  assert.equal(receipt.job_id, `vac-verify-${receipt.fixture_id}`);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.artifact_dir, `features/proof/vac-verify-${receipt.fixture_id}`);
  assert.ok(fs.existsSync(path.join(cwd, receipt.events_jsonl)));
  assert.ok(fs.existsSync(path.join(proof.dir, 'dry-run.json')));
  assert.ok(events.some((line) => JSON.parse(line).step === 'initialize'));
  assert.ok(events.some((line) => JSON.parse(line).step === 'complete'));
  assert.deepEqual(receipt.writes_applied, []);
  assert.equal(thingRule.status, 'pass');
  assert.match(thingRule.detail, /write=null/);
  const liveThing = runVacationEditPipeline(loadFixture(`features/fixtures/${receipt.fixture_id}.json`, cwd), { persist: false, cwd });
  assert.equal(receipt.proof_digest, committedProofDigest(liveThing.receipt));
  assert.equal(JSON.parse(fs.readFileSync(path.join(proof.dir, 'dry-run.json'), 'utf8')).proof_digest, receipt.proof_digest);
}

const leakedThingId = evaluateStopRules({
  input: { media: { attachment_scope: 'thing', thing_id: 'thing-hawaii-luau' }, allowProductionBilling: false },
  intents: [],
  decisions: [{ stop: 'thing_id_cross_trip', write: { op: 'attach_media' }, validation: 'rejected' }],
  receipt: {
    trek_state: {},
    planned_writes: [{ op: 'attach_media' }],
    writes_applied: [],
    dropped_clause: false,
    customer_facing_response: 'Attached a photo.',
    no_ops: [],
  },
  apply: false,
}).find((rule) => rule.id === 'fail_closed_thing_id');
assert.equal(leakedThingId.status, 'fail', 'fail_closed_thing_id must fail when a thing_id stop still has a write, even without item_id');

const cleanThingId = evaluateStopRules({
  input: { media: { attachment_scope: 'thing', thing_id: 'thing-hawaii-luau' }, allowProductionBilling: false },
  intents: [],
  decisions: [{ stop: 'thing_id_cross_trip', write: null, validation: 'rejected' }],
  receipt: {
    trek_state: {},
    planned_writes: [],
    writes_applied: [],
    dropped_clause: false,
    customer_facing_response: 'left it unchanged',
    no_ops: [{ reason: 'thing_id_cross_trip' }],
  },
  apply: false,
}).find((rule) => rule.id === 'fail_closed_thing_id');
assert.equal(cleanThingId.status, 'pass');
assert.match(cleanThingId.detail, /write=null/);

const boundTripStale = evaluateStopRules({
  input: { media: { bound_trip_id: 'trip-hawaii-old-009', attachment_scope: 'trip' }, allowProductionBilling: false },
  intents: [],
  decisions: [{ stop: 'stale_trip_media', write: null, validation: 'rejected' }],
  receipt: {
    trek_state: {},
    planned_writes: [],
    writes_applied: [],
    dropped_clause: false,
    customer_facing_response: 'not bound to the live trip',
    no_ops: [{ reason: 'stale_trip_media' }],
  },
  apply: false,
}).find((rule) => rule.id === 'fail_closed_thing_id');
assert.equal(boundTripStale.status, 'pass');
assert.match(boundTripStale.detail, /No thing_id fail-close/);

const fixtures = listFixtureFiles(cwd);
assert.ok(fixtures.length >= 18, `expected at least 18 fixtures, got ${fixtures.length}`);

const byId = new Map();
for (const filePath of fixtures) {
  const fixture = loadFixture(filePath, cwd);
  const first = runVacationEditPipeline(fixture, { persist: true, cwd });
  const firstEventLines = fs.readFileSync(first.receipt.artifacts.events, 'utf8').trim().split('\n');
  const second = runVacationEditPipeline(fixture, { persist: true, cwd });
  assert.equal(first.receipt.job_id, second.receipt.job_id, `${fixture.fixture_id} job_id must be stable`);
  assert.equal(first.receipt.job_id, stableJobId({ fixtureId: fixture.fixture_id }));
  assert.equal(first.receipt.mode, 'dry-run');
  assert.ok(fs.existsSync(first.receipt.artifacts.events), `${fixture.fixture_id} must write events.jsonl`);
  assert.ok(fs.existsSync(first.receipt.artifacts.dry_run), `${fixture.fixture_id} must write dry-run.json`);
  assert.ok(firstEventLines.length >= 4, `${fixture.fixture_id} events.jsonl must record initialize through complete`);
  assert.equal(JSON.parse(firstEventLines[0]).job_id, first.receipt.job_id);
  const secondEventLines = fs.readFileSync(second.receipt.artifacts.events, 'utf8').trim().split('\n');
  assert.ok(secondEventLines.length > firstEventLines.length, `${fixture.fixture_id} events.jsonl must append, never overwrite`);
  assert.deepEqual(secondEventLines.slice(0, firstEventLines.length), firstEventLines);
  for (const line of secondEventLines) {
    const event = JSON.parse(line);
    assert.ok(event.step, `${fixture.fixture_id} each events.jsonl line is one handoff`);
    assert.equal(event.job_id, first.receipt.job_id);
  }
  assert.ok(first.receipt.stop_rules.length >= 8);
  assert.ok(first.receipt.ok, `${fixture.fixture_id} stop rules failed: ${JSON.stringify(first.receipt.stop_rules.filter((rule) => rule.status === 'fail'))}`);
  if (fixture.expect?.write_ops) {
    assert.deepEqual(first.receipt.planned_writes.map((row) => row.op), fixture.expect.write_ops);
  }
  if (fixture.expect?.no_op_stops) {
    for (const stop of fixture.expect.no_op_stops) {
      assert.ok(first.receipt.no_ops.some((row) => row.reason === stop), `${fixture.fixture_id} missing no-op ${stop}`);
    }
  }
  if (fixture.expect?.response_includes) {
    assert.match(first.receipt.customer_facing_response, new RegExp(fixture.expect.response_includes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  if (fixture.expect?.exact_response) {
    assert.equal(first.receipt.customer_facing_response, fixture.expect.exact_response);
  }
  if (fixture.expect?.forbids) {
    for (const banned of fixture.expect.forbids) {
      assert.doesNotMatch(first.receipt.customer_facing_response, new RegExp(banned, 'i'));
    }
  }
  if (first.receipt.planned_writes.length && first.receipt.writes_applied.length === 0) {
    assert.equal(first.receipt.before_hash, first.receipt.after_hash, `${fixture.fixture_id} dry-run hashes must stay honest`);
    assert.match(first.receipt.customer_facing_response, /did not change the itinerary/);
    assert.doesNotMatch(first.receipt.customer_facing_response, /^(Moved |Removed )/);
  }
  if (fixture.expect?.page_kind) {
    assert.equal(first.receipt.page_context.kind, fixture.expect.page_kind);
  }
  if (fixture.expect?.context_includes) {
    assert.ok(first.receipt.page_context.item_ids.includes(fixture.expect.context_includes));
  }
  if (fixture.expect?.dropped_clause != null) {
    assert.equal(first.receipt.dropped_clause, fixture.expect.dropped_clause, `${fixture.fixture_id} dropped_clause`);
  }
  if (isVoiceSurface(fixture.surface)) {
    assert.ok(first.receipt.audio_path, `${fixture.fixture_id} voice fixture must keep original audio`);
    assert.ok(fs.existsSync(first.receipt.audio_path), `${fixture.fixture_id} audio path missing`);
    assert.ok(isRealOggAudio(first.receipt.audio_path), `${fixture.fixture_id} .ogg must be real OggS audio, not a text stub`);
    const magic = Buffer.alloc(4);
    const fd = fs.openSync(first.receipt.audio_path, 'r');
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    assert.equal(magic.toString('ascii'), 'OggS');
    assert.equal(first.receipt.transcript, fixture.transcript || fixture.text);
    assert.ok(fs.existsSync(path.join(first.receipt.artifacts.dir, 'transcript.txt')));
    if (Array.isArray(fixture.itinerary_before)) {
      assert.deepEqual(
        first.receipt.before_state.items.map((item) => ({ id: item.id, day: item.day })),
        fixture.itinerary_before.map((item) => ({ id: item.id, day: item.day })),
      );
    }
  }
  if (fixture.expect?.preserve_audio_path) {
    assert.ok(first.receipt.audio_path && first.receipt.audio_path.endsWith('.ogg'));
    assert.ok(fs.existsSync(first.receipt.audio_path));
  }
  byId.set(fixture.fixture_id, first);
}

assert.equal(byId.get('exact-no-match').receipt.customer_facing_response, noMatchCopy('Remove the volcano helicopter tour'));
assert.equal(NO_MATCH_TEMPLATE, 'I heard "{heard}", couldn\'t find a match, what do you mean?');

const list = byId.get('shared-page-voice-list');
assert.equal(list.receipt.page_context.item_ids.length, 4, 'list-page voice must receive every visible item');

const multi = byId.get('telegram-voice-multi-intent');
assert.equal(multi.intents.length, 3);
assert.deepEqual(multi.intents.map((intent) => intent.kind), ['remove', 'move', 'research']);
assert.ok(multi.receipt.planned_writes.length === 2);
assert.ok(multi.receipt.no_ops.some((row) => row.reason === 'unsupported_research'));
assert.equal(multi.receipt.dropped_clause, false);
const multiHeard = noApplyHeard({ intents: multi.intents, text: multi.receipt.transcript });
assert.match(multiHeard, /Remove Topgolf Las Vegas/);
assert.match(multiHeard, /move In-N-Out Burger to day 3/i);
assert.match(multiHeard, /live music/i);
assert.equal(multi.receipt.customer_facing_response, noApplyCopy(multiHeard));
assert.notEqual(multiHeard, multi.intents[0].heard);
assert.ok(multi.receipt.audio_path.endsWith('kim-vegas-multi-clause.ogg'));

const dropped = byId.get('telegram-voice-clause-drop');
assert.equal(dropped.receipt.dropped_clause, true);
assert.equal(dropped.receipt.planned_writes.length, 0, 'multi-request voice must fail closed if a clause drops');
assert.ok(dropped.receipt.no_ops.every((row) => row.reason === 'dropped_clause'));
assert.deepEqual(
  dropped.receipt.after_state.items.map((item) => item.day),
  dropped.receipt.before_state.items.map((item) => item.day),
);

const stale = byId.get('stale-trip-media');
assert.equal(stale.receipt.planned_writes.length, 0);
assert.ok(stale.receipt.no_ops.some((row) => row.reason === 'stale_trip_media'));
assert.match(stale.receipt.stop_rules.find((rule) => rule.id === 'fail_closed_thing_id').detail, /No thing_id fail-close/);

const thingStale = byId.get('thing-media-stale');
assert.equal(thingStale.receipt.planned_writes.length, 0);
assert.ok(thingStale.receipt.no_ops.some((row) => row.reason === 'thing_id_cross_trip'));
assert.equal(loadFixture(thingStale.receipt.fixture_path, cwd).media.thing_id, 'thing-hawaii-luau');
assert.match(thingStale.receipt.stop_rules.find((rule) => rule.id === 'fail_closed_thing_id').detail, /write=null/);
assert.match(thingStale.receipt.customer_facing_response, /belongs to another trip/);
assert.doesNotMatch(stale.receipt.customer_facing_response, /belongs to another trip/);

const thingVisible = byId.get('thing-media-visible');
assert.equal(thingVisible.receipt.planned_writes.length, 0);
assert.ok(thingVisible.receipt.no_ops.some((row) => row.reason === 'thing_not_visible'));
assert.equal(thingVisible.receipt.page_context.kind, 'day');
assert.ok(!thingVisible.receipt.page_context.item_ids.includes('thing-bellagio-fountains'));
assert.match(thingVisible.receipt.stop_rules.find((rule) => rule.id === 'fail_closed_thing_id').detail, /write=null/);

const ownerUpload = byId.get('authorized-owner-upload');
const publicLink = byId.get('unauthorized-upload');
const loggedOut = byId.get('unauthorized-upload-logged-out');
const kimUnpaid = byId.get('unauthorized-upload-unpaid-collaborator');
assert.deepEqual(ownerUpload.receipt.planned_writes.map((row) => row.op), ['attach_media']);
assert.equal(publicLink.receipt.planned_writes.length, 0);
assert.equal(loggedOut.receipt.planned_writes.length, 0);
assert.equal(kimUnpaid.receipt.planned_writes.length, 0);
assert.notEqual(ownerUpload.receipt.actor.identity, kimUnpaid.receipt.actor.identity);
assert.notEqual(ownerUpload.receipt.actor.identity, loggedOut.receipt.actor.identity);
assert.notEqual(ownerUpload.receipt.actor.identity, publicLink.receipt.actor.identity);
assert.equal(ownerUpload.receipt.actor.role, 'owner');
assert.equal(kimUnpaid.receipt.actor.role, 'unpaid_collaborator');
assert.equal(loggedOut.receipt.actor.role, 'logged-out');
assert.equal(publicLink.receipt.actor.role, 'public-link');
for (const row of [ownerUpload, publicLink, loggedOut, kimUnpaid]) {
  assert.equal(row.receipt.intents[0]?.kind || 'media_upload', 'media_upload');
  assert.equal(loadFixture(row.receipt.fixture_path, cwd).media.bound_trip_id, 'trip-vegas-live-001');
}

const split = byId.get('split-trip-trek-uniqueness');
assert.equal(split.receipt.planned_writes.length, 0);
assert.ok(split.receipt.no_ops.some((row) => row.reason === 'duplicate_trek'));
assert.deepEqual(split.receipt.trek_state.row_ids_before, ['41']);
assert.deepEqual(split.receipt.trek_state.row_ids_after, ['41']);
assert.equal(split.receipt.trek_state.row_count_before, 1);
assert.equal(split.receipt.trek_state.row_count_after, 1);

const missing = byId.get('checkout-entitlements-missing');
assert.equal(missing.receipt.planned_writes.length, 0);
assert.ok(missing.receipt.no_ops.some((row) => row.reason === 'checkout_entitlement'));

const checkout = byId.get('checkout-entitlements');
assert.match(checkout.receipt.customer_facing_response, /unlimited trips, photo upload, and video upload/);

const alias = byId.get('alias-omeke');
assert.equal(alias.receipt.planned_writes[0].title, 'Umekes Fish Market Bar & Grill');

const applied = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  apply: true,
  applyScope: 'local_snapshot',
  persist: true,
  cwd,
});
assert.equal(applied.receipt.mode, 'apply_local_snapshot');
assert.equal(applied.receipt.apply_scope, 'local_snapshot');
assert.notEqual(applied.receipt.before_hash, applied.receipt.after_hash);
assert.equal(applied.receipt.after_state.items.find((item) => item.id === 'thing-bellagio-fountains').day, 2);
assert.equal(applied.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').status, 'hold');
assert.match(applied.receipt.stop_rules.find((rule) => rule.id === 'prove_state_movement').detail, /not product\/TREK state/);
assert.match(applied.receipt.customer_facing_response, /^Moved Bellagio Fountains from day 1 20:00 to day 2/);

const noopApply = runVacationEditPipeline(loadFixture('features/fixtures/exact-no-match.json', cwd), {
  apply: true,
  applyScope: 'local_snapshot',
  persist: true,
  cwd,
});
assert.equal(noopApply.receipt.before_hash, noopApply.receipt.after_hash);

const receipt = compactReceipt(applied.receipt);
assert.ok(receipt.required_artifacts.includes('final keepsake PDF'));
assert.ok(receipt.events_jsonl.endsWith('events.jsonl'));
assert.equal(receipt.apply_scope, 'local_snapshot');

const appendJobId = `vac-verify-events-append-${process.pid}`;
const appendFirst = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  persist: true,
  jobId: appendJobId,
  cwd,
});
const appendFirstLines = fs.readFileSync(appendFirst.receipt.artifacts.events, 'utf8');
const appendSecond = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  persist: true,
  jobId: appendJobId,
  cwd,
});
const appendSecondLines = fs.readFileSync(appendSecond.receipt.artifacts.events, 'utf8');
assert.ok(appendSecondLines.startsWith(appendFirstLines), 'events.jsonl must keep prior handoffs when appending');
assert.ok(appendSecondLines.split('\n').filter(Boolean).length > appendFirstLines.split('\n').filter(Boolean).length);

const shared = JSON.parse(fs.readFileSync(path.join(cwd, 'features/fixtures/_shared-vegas-trip.json'), 'utf8'));
const bellagioDb = path.join(os.tmpdir(), `vacation-trek-sqlite-bellagio-${process.pid}.db`);
const bellagioStore = createTrekFixtureStore({
  dbPath: bellagioDb,
  trip: { ...shared, trek_trip_id: 41, token: 'las-vegas-strip-vacation' },
});
const idsBefore = bellagioStore.snapshot().row_ids;
assert.equal(placeDay(bellagioStore.snapshot(), 'thing-bellagio-fountains'), 1);
const bellagio = runVacationEditPipeline(loadFixture('features/fixtures/telegram-text-single-edit.json', cwd), {
  apply: true,
  applyScope: 'trek_sqlite',
  trekStore: bellagioStore,
  persist: true,
  cwd,
});
assert.equal(placeDay(bellagioStore.snapshot(), 'thing-bellagio-fountains'), 2, 'trek_sqlite bellagio test: day1→day2');
assert.deepEqual(bellagioStore.snapshot().row_ids, idsBefore, 'trek_sqlite bellagio test: TREK id-set must stay unique');
assert.equal(bellagio.receipt.trek_state.row_count_before, 1);
assert.equal(bellagio.receipt.trek_state.row_count_after, 1);
assert.equal(bellagio.receipt.trek_state.item_moved, true);
assert.equal(bellagio.receipt.mode, 'apply_trek_sqlite');
assert.match(bellagio.receipt.customer_facing_response, /^Moved Bellagio Fountains from day 1 20:00 to day 2/);
bellagioStore.dispose();

console.log(`vacation-edit-pipeline verification lever passed (${fixtures.length} fixtures)`);
