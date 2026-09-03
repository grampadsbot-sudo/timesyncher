#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  PIPELINE_NAME,
  PIPELINE_VERSION,
  COMMITTED_PROOF_FIXTURE_ID,
  COMMITTED_PROOF_JOB_ID,
  artifactDirFor,
  committedProofDir,
  compactReceipt,
  listFixtureFiles,
  loadFixture,
  runVacationEditPipeline,
  writeCommittedDryRunProof,
} from '../src/vacation/edit-pipeline.mjs';
import { createTrekFixtureStore } from '../src/vacation/trek-fixture-store.mjs';

const cwd = process.cwd();
const FEATURE_MAP = path.join(cwd, 'features', 'README.md');
const SKILL = path.join(cwd, '.cursor', 'skills', 'verify-timesyncher-vacation', 'SKILL.md');
const PIPELINE = path.join(cwd, 'src', 'vacation', 'edit-pipeline.mjs');
const COMMITTED_PROOF_DIR = committedProofDir(cwd);
const COMMITTED_PROOF_JOB = COMMITTED_PROOF_JOB_ID;

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
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, json: false, fixtures: [], jobId: '', persist: true, localSnapshot: false, trekDb: '' };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--json') args.json = true;
    else if (token === '--no-persist') args.persist = false;
    else if (token === '--all-fixtures') args.all = true;
    else if (token === '--local-snapshot') args.localSnapshot = true;
    else if (token === '--trek-db') args.trekDb = rest[++i];
    else if (token === '--fixture' || token === '-f') args.fixtures.push(rest[++i]);
    else if (token === '--job-id') args.jobId = rest[++i];
    else if (!token.startsWith('-')) args.fixtures.push(token);
  }
  return args;
}

function doctor() {
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
  const proofReceiptPath = path.join(COMMITTED_PROOF_DIR, 'receipt.json');
  const proofEventsPath = path.join(COMMITTED_PROOF_DIR, 'events.jsonl');
  const proofDryRunPath = path.join(COMMITTED_PROOF_DIR, 'dry-run.json');
  let committedProof = { ok: false, reason: 'missing' };
  if (fs.existsSync(proofReceiptPath) && fs.existsSync(proofEventsPath) && fs.existsSync(proofDryRunPath)) {
    try {
      const receipt = JSON.parse(fs.readFileSync(proofReceiptPath, 'utf8'));
      const eventLines = fs.readFileSync(proofEventsPath, 'utf8').trim().split('\n').filter(Boolean);
      const steps = eventLines.map((line) => JSON.parse(line).step);
      committedProof = {
        ok: receipt.job_id === COMMITTED_PROOF_JOB
          && receipt.ok === true
          && Array.isArray(receipt.stop_rules)
          && receipt.stop_rules.length >= 8
          && steps.includes('initialize')
          && steps.includes('complete'),
        job_id: receipt.job_id || null,
        events: path.relative(cwd, proofEventsPath),
        receipt: path.relative(cwd, proofReceiptPath),
        dry_run: path.relative(cwd, proofDryRunPath),
        artifact_dir: path.relative(cwd, COMMITTED_PROOF_DIR),
      };
    } catch (error) {
      committedProof = { ok: false, reason: error.message || 'invalid_proof' };
    }
  }
  const report = {
    ok: false,
    pipeline: PIPELINE_NAME,
    pipeline_version: PIPELINE_VERSION,
    cwd,
    feature_map: FEATURE_MAP,
    skill: SKILL,
    committed_proof: committedProof,
    checks: {
      feature_map: fs.existsSync(FEATURE_MAP),
      skill: fs.existsSync(SKILL),
      pipeline_syntax: node.status === 0,
      fixture_count: fixtures.length,
      missing_features: missingFeatures,
      missing_map_rows: missingMapRows,
      missing_fixtures: missingFixtures,
      committed_proof: committedProof.ok,
    },
  };
  report.ok = report.checks.feature_map
    && report.checks.skill
    && report.checks.pipeline_syntax
    && missingFeatures.length === 0
    && missingMapRows.length === 0
    && missingFixtures.length === 0
    && committedProof.ok
    && fixtures.length >= requiredFixtures.length;
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
    if (!apply && fixture.fixture_id === COMMITTED_PROOF_FIXTURE_ID) {
      writeCommittedDryRunProof({ cwd, fixture });
    }
    return receipt;
  });
}

function readReceipt(jobId) {
  const committedPath = path.join(COMMITTED_PROOF_DIR, 'receipt.json');
  if (jobId === COMMITTED_PROOF_JOB && fs.existsSync(committedPath)) {
    return JSON.parse(fs.readFileSync(committedPath, 'utf8'));
  }
  const dir = artifactDirFor(jobId, cwd);
  const receiptPath = path.join(dir, 'receipt.json');
  if (fs.existsSync(receiptPath)) return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  throw new Error(`No receipt at ${receiptPath}${jobId === COMMITTED_PROOF_JOB ? ` or ${committedPath}` : ''}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.command || args.command === 'help' || args.command === '--help') {
  console.log(usage());
  process.exit(args.command ? 0 : 2);
}

try {
  if (args.command === 'doctor') {
    const report = doctor();
    if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
      console.log(`${report.ok ? 'PASS' : 'FAIL'} control-vacation doctor`);
      console.log(`  feature map: ${report.checks.feature_map ? FEATURE_MAP : 'missing'}`);
      console.log(`  skill: ${report.checks.skill ? SKILL : 'missing'}`);
      console.log(`  fixtures: ${report.checks.fixture_count}`);
      if (report.checks.missing_features.length) console.log(`  missing features: ${report.checks.missing_features.join(', ')}`);
      if (report.checks.missing_map_rows.length) console.log(`  missing map rows: ${report.checks.missing_map_rows.join(', ')}`);
      if (report.checks.missing_fixtures.length) console.log(`  missing fixtures: ${report.checks.missing_fixtures.join(', ')}`);
      if (report.committed_proof?.ok) {
        console.log(`  committed proof: ${report.committed_proof.job_id} ${report.committed_proof.receipt}`);
      } else {
        console.log('  committed proof: missing');
      }
    }
    process.exit(report.ok ? 0 : 1);
  }

  if (args.command === 'apply' && !args.localSnapshot && !args.trekDb) {
    console.error('apply requires --local-snapshot (JSON only; not product/TREK state) or --trek-db <path>.');
    process.exit(2);
  }

  if (args.command === 'commit-proof') {
    const proof = writeCommittedDryRunProof({ cwd });
    const compact = proof.compact;
    if (args.json) process.stdout.write(JSON.stringify({ receipt: compact, compact }, null, 2) + '\n');
    else {
      console.log(`${compact.ok ? 'PASS' : 'FAIL'} ${compact.job_id}`);
      console.log(`  events: ${compact.events_jsonl}`);
      console.log(`  dry-run: ${compact.dry_run}`);
      console.log(`  artifact_dir: ${compact.artifact_dir}`);
    }
    process.exit(compact.ok ? 0 : 1);
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
