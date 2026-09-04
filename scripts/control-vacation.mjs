#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  PIPELINE_NAME,
  PIPELINE_VERSION,
  COMMITTED_PROOF_FIXTURE_IDS,
  artifactDirFor,
  committedProofDigest,
  committedProofDir,
  committedProofJobId,
  compactReceipt,
  eventPayloadsWithoutTs,
  listFixtureFiles,
  loadFixture,
  runVacationEditPipeline,
  snapshotHash,
  writeAllCommittedDryRunProofs,
  writeCommittedDryRunProof,
} from '../src/vacation/edit-pipeline.mjs';
import { createTrekFixtureStore } from '../src/vacation/trek-fixture-store.mjs';
import {
  CI_WORKFLOW_REL,
  inspectCiAttestation,
  missingReviewerCiCommands,
} from '../src/vacation/ci-attestation.mjs';

const cwd = process.cwd();
const FEATURE_MAP = path.join(cwd, 'features', 'README.md');
const SKILL = path.join(cwd, '.cursor', 'skills', 'verify-timesyncher-vacation', 'SKILL.md');
const PIPELINE = path.join(cwd, 'src', 'vacation', 'edit-pipeline.mjs');
const CI_WORKFLOW = path.join(cwd, CI_WORKFLOW_REL);

function usage() {
  return [
    'control-vacation — TimeSyncher Vacation verification control driver',
    '',
    'Commands:',
    '  doctor                         Read-only check that the lever is worth driving',
    '  dry-run --fixture <path>       Run vacation-edit-pipeline in dry-run JSON mode',
    '  dry-run --all-fixtures         Run every features/fixtures/*.json case',
    '  commit-proof                   Refresh the committed inspectable dry-run receipt',
    '  apply --local-snapshot --fixture <path>',
    '                                 Apply validated writes to a local JSON snapshot only',
    '                                 (not product/TREK state; prove_state_movement=hold)',
    '  apply --trek-db <path> --fixture <path>',
    '                                 Apply validated writes to a local TREK SQLite fixture',
    '                                 and record id-set / row-count before vs after',
    '  receipt --job-id <id>          Print the compact receipt for a prior artifact dir',
    '',
    'Reviewer commands:',
    '  node scripts/control-vacation.mjs doctor',
    '  node scripts/control-vacation.mjs commit-proof',
    '  node scripts/control-vacation.mjs dry-run --all-fixtures --json',
    '  node scripts/control-vacation.mjs apply --local-snapshot --fixture features/fixtures/telegram-text-single-edit.json --json',
    '  node scripts/control-vacation.mjs apply --trek-db /tmp/vacation-trek-verify.db --fixture features/fixtures/telegram-text-single-edit.json --json',
    '  node scripts/test_vacation_edit_pipeline.mjs',
    '  node scripts/test_vacation_trek_apply.mjs',
    '  node scripts/test_vacation_intake_pipeline_seam.mjs',
    '  CI: .github/workflows/vacation-verify.yml runs those five commands on pull_request',
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, json: false, fixtures: [], jobId: '', persist: true, localSnapshot: false, trekDb: '', produceGate: false, produceAttest: false };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--json') args.json = true;
    else if (token === '--no-persist') args.persist = false;
    else if (token === '--all-fixtures') args.all = true;
    else if (token === '--local-snapshot') args.localSnapshot = true;
    else if (token === '--produce-gate') args.produceGate = true;
    else if (token === '--produce-attest') args.produceAttest = true;
    else if (token === '--trek-db') args.trekDb = rest[++i];
    else if (token === '--fixture' || token === '-f') args.fixtures.push(rest[++i]);
    else if (token === '--job-id') args.jobId = rest[++i];
    else if (!token.startsWith('-')) args.fixtures.push(token);
  }
  return args;
}

function inspectCommittedProof(fixtureId) {
  const dir = committedProofDir(cwd, fixtureId);
  const jobId = committedProofJobId(fixtureId);
  const proofReceiptPath = path.join(dir, 'receipt.json');
  const proofEventsPath = path.join(dir, 'events.jsonl');
  const proofDryRunPath = path.join(dir, 'dry-run.json');
  if (!fs.existsSync(proofReceiptPath) || !fs.existsSync(proofEventsPath) || !fs.existsSync(proofDryRunPath)) {
    return { ok: false, reason: 'missing', fixture_id: fixtureId, job_id: jobId, artifact_dir: path.relative(cwd, dir) };
  }
  try {
    const receipt = JSON.parse(fs.readFileSync(proofReceiptPath, 'utf8'));
    const dryRun = JSON.parse(fs.readFileSync(proofDryRunPath, 'utf8'));
    const eventLines = fs.readFileSync(proofEventsPath, 'utf8').trim().split('\n').filter(Boolean);
    const parsedEvents = eventLines.map((line) => JSON.parse(line));
    const steps = parsedEvents.map((event) => event.step);
    const fixture = loadFixture(path.join(cwd, 'features', 'fixtures', `${fixtureId}.json`), cwd);
    const live = runVacationEditPipeline(fixture, { persist: false, cwd, jobId });
    const liveDigest = committedProofDigest(live.receipt);
    const receiptDigest = receipt.proof_digest;
    const dryRunBodyDigest = committedProofDigest(dryRun);
    const dryRunDigest = dryRun.proof_digest;
    const beforePath = path.join(dir, 'before.json');
    const afterPath = path.join(dir, 'after.json');
    const beforeHash = fs.existsSync(beforePath) ? snapshotHash(JSON.parse(fs.readFileSync(beforePath, 'utf8'))) : null;
    const afterHash = fs.existsSync(afterPath) ? snapshotHash(JSON.parse(fs.readFileSync(afterPath, 'utf8'))) : null;
    const eventsMatch = snapshotHash(eventPayloadsWithoutTs(parsedEvents))
      === snapshotHash(eventPayloadsWithoutTs(live.events));
    const copyMatch = receipt.customer_facing_response === live.receipt.customer_facing_response
      && dryRun.customer_facing_response === live.receipt.customer_facing_response;
    const applyHold = receipt.apply_gate?.prove_state_movement === 'hold'
      && receipt.apply_gate?.apply_on_this_receipt === false;
    const reexec = Boolean(liveDigest)
      && liveDigest === receiptDigest
      && liveDigest === dryRunDigest
      && liveDigest === dryRunBodyDigest
      && beforeHash === live.receipt.before_hash
      && afterHash === live.receipt.after_hash
      && eventsMatch
      && copyMatch
      && applyHold;
    const thingIdRule = (receipt.stop_rules || []).find((rule) => rule.id === 'fail_closed_thing_id');
    const thingProof = fixtureId.startsWith('thing-media-');
    const honestCopy = (text) => /did not change the itinerary/.test(String(text || ''))
      && !/^(Moved |Removed )/i.test(String(text || ''));
    const thingClosed = thingIdRule?.status === 'pass'
      && /write=null/.test(String(thingIdRule?.detail || ''))
      && Array.isArray(receipt.no_ops)
      && receipt.no_ops.length > 0
      && (receipt.writes_applied || []).length === 0;
    const ok = receipt.job_id === jobId
      && receipt.ok === true
      && Array.isArray(receipt.stop_rules)
      && receipt.stop_rules.length >= 8
      && steps.includes('initialize')
      && steps.includes('complete')
      && receipt.before_hash === receipt.after_hash
      && dryRun.before_hash === dryRun.after_hash
      && Array.isArray(receipt.writes_applied)
      && receipt.writes_applied.length === 0
      && Boolean(receiptDigest)
      && reexec
      && (thingProof ? thingClosed : honestCopy(receipt.customer_facing_response) && honestCopy(dryRun.customer_facing_response));
    return {
      ok,
      fixture_id: fixtureId,
      job_id: receipt.job_id || jobId,
      proof_digest: receiptDigest || null,
      reexec,
      events: path.relative(cwd, proofEventsPath),
      receipt: path.relative(cwd, proofReceiptPath),
      dry_run: path.relative(cwd, proofDryRunPath),
      artifact_dir: path.relative(cwd, dir),
    };
  } catch (error) {
    return { ok: false, reason: error.message || 'invalid_proof', fixture_id: fixtureId, job_id: jobId };
  }
}

function doctor({ produceGate = false, produceAttest = false } = {}) {
  const fixtures = listFixtureFiles(cwd);
  const requiredFeatures = [
    'checkout.md',
    'onboarding.md',
    'telegram-messages.md',
    'voice-notes.md',
    'collaborator-edits.md',
    'media-uploads.md',
    'timeline-thing-media.md',
    'keepsake-pdfs.md',
  ];
  const missingFeatures = requiredFeatures.filter((name) => !fs.existsSync(path.join(cwd, 'features', name)));
  const featureMapText = fs.existsSync(FEATURE_MAP) ? fs.readFileSync(FEATURE_MAP, 'utf8') : '';
  const missingMapRows = requiredFeatures.filter((name) => !featureMapText.includes(`](./${name})`));
  const fixtureIds = fixtures.map((filePath) => loadFixture(filePath, cwd).fixture_id);
  const requiredFixtures = [
    'telegram-text-single-edit',
    'telegram-voice-multi-intent',
    'telegram-voice-audio',
    'telegram-voice-clause-drop',
    'shared-page-voice-day',
    'shared-page-voice-list',
    'alias-omeke',
    'unsupported-research',
    'incomplete-move',
    'stale-trip-media',
    'thing-media-stale',
    'thing-media-visible',
    'authorized-owner-upload',
    'unauthorized-upload',
    'unauthorized-upload-logged-out',
    'unauthorized-upload-unpaid-collaborator',
    'split-trip-trek-uniqueness',
    'checkout-entitlements',
    'checkout-entitlements-missing',
    'exact-no-match',
    'successful-edit-wording',
  ];
  const missingFixtures = requiredFixtures.filter((id) => !fixtureIds.includes(id));
  const node = spawnSync(process.execPath, ['--check', PIPELINE], { encoding: 'utf8' });
  const committedProofs = COMMITTED_PROOF_FIXTURE_IDS.map((fixtureId) => inspectCommittedProof(fixtureId));
  const committedProof = committedProofs[0];
  const committedProofsOk = committedProofs.every((row) => row.ok);
  const ciText = fs.existsSync(CI_WORKFLOW) ? fs.readFileSync(CI_WORKFLOW, 'utf8') : '';
  const missingCiCommands = missingReviewerCiCommands(ciText);
  const ciAttestation = inspectCiAttestation({ cwd });
  const report = {
    ok: false,
    pipeline: PIPELINE_NAME,
    pipeline_version: PIPELINE_VERSION,
    cwd,
    feature_map: FEATURE_MAP,
    skill: SKILL,
    committed_proof: committedProof,
    committed_proofs: committedProofs,
    ci_attestation: ciAttestation,
    hosted_target: {
      status: 'hold',
      named: 'timesyncher / timesyncher.com',
      detail: 'Vercel project is named in-repo. doctor and dry-run have no remote target; do not invent a deploy harness. SHA evidence is vacation-verify + vacation-verify-doctor + vacation-verify-gate + vacation-verify-attest job success plus the committed features/proof/vac-verify-ci/receipt.json. Doctor proof is the downloaded gate/attest doctor.json (ok:true required), not a name+digest bind and not the marker.',
    },
    checks: {
      feature_map: fs.existsSync(FEATURE_MAP),
      skill: fs.existsSync(SKILL),
      pipeline_syntax: node.status === 0,
      fixture_count: fixtures.length,
      missing_features: missingFeatures,
      missing_map_rows: missingMapRows,
      missing_fixtures: missingFixtures,
      committed_proof: committedProofsOk,
      ci_workflow: Boolean(ciText) && missingCiCommands.length === 0,
      missing_ci_commands: missingCiCommands,
      ci_attestation: Boolean(ciAttestation.ok),
    },
  };
  report.ok = report.checks.feature_map
    && report.checks.skill
    && report.checks.pipeline_syntax
    && missingFeatures.length === 0
    && missingMapRows.length === 0
    && missingFixtures.length === 0
    && committedProofsOk
    && report.checks.ci_workflow
    && (produceGate || produceAttest || report.checks.ci_attestation)
    && fixtures.length >= requiredFixtures.length;
  if (produceGate) report.produce_gate = true;
  if (produceAttest) report.produce_attest = true;
  return report;
}

function seedTripFromFixture(fixture) {
  return {
    ...fixture.trip,
    trek_trip_id: fixture.trip?.trek_rows?.[0]?.id || fixture.trip?.trek_trip_id || 41,
    token: fixture.trip?.trek_rows?.[0]?.token || fixture.trip?.token,
    items: fixture.trip?.items || [],
  };
}

function runFixtures(args, apply) {
  const files = args.all ? listFixtureFiles(cwd) : args.fixtures;
  if (!files.length) throw new Error('Pass --fixture <path> or --all-fixtures');
  const applyScope = !apply ? 'dry-run' : (args.trekDb ? 'trek_sqlite' : 'local_snapshot');
  return files.map((filePath) => {
    const fixture = loadFixture(filePath, cwd);
    const trekStore = apply && args.trekDb
      ? createTrekFixtureStore({ dbPath: args.trekDb, trip: seedTripFromFixture(fixture) })
      : undefined;
    const { receipt } = runVacationEditPipeline(fixture, {
      apply,
      applyScope,
      trekStore,
      persist: args.persist,
      jobId: args.jobId || undefined,
      cwd,
    });
    if (!apply && COMMITTED_PROOF_FIXTURE_IDS.includes(fixture.fixture_id)) {
      writeCommittedDryRunProof({ cwd, fixture });
    }
    return receipt;
  });
}

function readReceipt(jobId) {
  for (const fixtureId of COMMITTED_PROOF_FIXTURE_IDS) {
    const committedPath = path.join(committedProofDir(cwd, fixtureId), 'receipt.json');
    if (jobId === committedProofJobId(fixtureId) && fs.existsSync(committedPath)) {
      return JSON.parse(fs.readFileSync(committedPath, 'utf8'));
    }
  }
  const dir = artifactDirFor(jobId, cwd);
  const receiptPath = path.join(dir, 'receipt.json');
  if (fs.existsSync(receiptPath)) return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  throw new Error(`No receipt at ${receiptPath}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || args.command === 'help' || args.command === '--help') {
  console.log(usage());
  process.exit(args.command ? 0 : 2);
}

try {
  if (args.command === 'doctor') {
    const report = doctor({ produceGate: args.produceGate, produceAttest: args.produceAttest });
    if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} control-vacation doctor`);
      console.log(`  feature map: ${report.checks.feature_map ? FEATURE_MAP : 'missing'}`);
      console.log(`  skill: ${report.checks.skill ? SKILL : 'missing'}`);
      console.log(`  fixtures: ${report.checks.fixture_count}`);
      if (report.checks.missing_features.length) console.log(`  missing features: ${report.checks.missing_features.join(', ')}`);
      if (report.checks.missing_map_rows.length) console.log(`  missing map rows: ${report.checks.missing_map_rows.join(', ')}`);
      if (report.checks.missing_fixtures.length) console.log(`  missing fixtures: ${report.checks.missing_fixtures.join(', ')}`);
      for (const proof of report.committed_proofs || []) {
        console.log(`  committed proof: ${proof.ok ? proof.job_id : `${proof.fixture_id} missing`} ${proof.receipt || ''}`);
      }
      console.log(`  ci workflow: ${report.checks.ci_workflow ? CI_WORKFLOW : 'missing'}`);
      if (report.checks.missing_ci_commands.length) {
        console.log(`  missing ci commands: ${report.checks.missing_ci_commands.join(', ')}`);
      }
      const attest = report.ci_attestation || {};
      console.log(`  ci attestation: ${attest.ok ? `${attest.run_id} job ${attest.job_id}/${attest.doctor_job_id || '-'}/${attest.attest_job_id || '-'} ${attest.conclusion}` : 'missing'} ${attest.artifact_digest || attest.reason || ''} ${attest.doctor_artifact_digest || ''} ${attest.attest_artifact_digest || ''} ${attest.sha || ''}`);
      console.log(`  hosted target: ${report.hosted_target.status} (${report.hosted_target.named})`);
    }
    process.exit(report.ok ? 0 : 1);
  }

  if (args.command === 'apply' && !args.localSnapshot && !args.trekDb) {
    console.error('apply requires --local-snapshot (JSON only; not product/TREK state) or --trek-db <path>.');
    process.exit(2);
  }

  if (args.command === 'commit-proof') {
    const proofs = writeAllCommittedDryRunProofs({ cwd });
    const failed = proofs.filter((proof) => !proof.compact.ok);
    if (args.json) process.stdout.write(JSON.stringify({ proofs: proofs.map((proof) => proof.compact) }, null, 2) + '\n');
    else {
      for (const proof of proofs) {
        const compact = proof.compact;
        console.log(`${compact.ok ? 'PASS' : 'FAIL'} ${compact.job_id}`);
        console.log(`  events: ${compact.events_jsonl}`);
        console.log(`  dry-run: ${compact.dry_run}`);
        console.log(`  artifact_dir: ${compact.artifact_dir}`);
      }
    }
    process.exit(failed.length ? 1 : 0);
  }

  if (args.command === 'dry-run' || args.command === 'apply') {
    const receipts = runFixtures(args, args.command === 'apply');
    const failed = receipts.filter((receipt) => !receipt.ok);
    if (args.json) {
      const payload = receipts.length === 1
        ? { receipt: receipts[0], compact: compactReceipt(receipts[0]) }
        : { receipts, compact: receipts.map(compactReceipt) };
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } else {
      for (const receipt of receipts) {
        console.log(`${receipt.ok ? 'PASS' : 'FAIL'} ${receipt.job_id}`);
        console.log(`  events: ${receipt.artifacts.events}`);
        console.log(`  dry-run: ${receipt.artifacts.dry_run}`);
      }
    }
    process.exit(failed.length ? 1 : 0);
  }

  if (args.command === 'receipt') {
    if (!args.jobId && !args.fixtures[0]) throw new Error('receipt requires --job-id');
    const receipt = readReceipt(args.jobId || args.fixtures[0]);
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    process.exit(0);
  }

  console.error(usage());
  process.exit(2);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
