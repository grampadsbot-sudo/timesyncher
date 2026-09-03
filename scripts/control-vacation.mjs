#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  PIPELINE_NAME,
  PIPELINE_VERSION,
  artifactDirFor,
  listFixtureFiles,
  loadFixture,
  runVacationEditPipeline,
  compactReceipt,
} from '../src/vacation/edit-pipeline.mjs';

const cwd = process.cwd();
const FEATURE_MAP = path.join(cwd, 'features', 'README.md');
const SKILL = path.join(cwd, '.cursor', 'skills', 'verify-timesyncher-vacation', 'SKILL.md');
const PIPELINE = path.join(cwd, 'src', 'vacation', 'edit-pipeline.mjs');

function usage() {
  return [
    'control-vacation — TimeSyncher Vacation verification control driver',
    '',
    'Commands:',
    '  doctor                         Read-only check that the lever is worth driving',
    '  dry-run --fixture <path>       Run vacation-edit-pipeline in dry-run JSON mode',
    '  dry-run --all-fixtures         Run every features/fixtures/*.json case',
    '  apply --fixture <path>         Apply validated writes to the local snapshot only',
    '  receipt --job-id <id>          Print the compact receipt for a prior artifact dir',
    '',
    'Reviewer commands:',
    '  node scripts/control-vacation.mjs doctor',
    '  node scripts/control-vacation.mjs dry-run --all-fixtures --json',
    '  node scripts/test_vacation_edit_pipeline.mjs',
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, json: false, fixtures: [], jobId: '', persist: true };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === '--json') args.json = true;
    else if (token === '--no-persist') args.persist = false;
    else if (token === '--all-fixtures') args.all = true;
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
  const fixtureIds = fixtures.map((filePath) => loadFixture(filePath, cwd).fixture_id);
  const requiredFixtures = [
    'telegram-text-single-edit',
    'telegram-voice-multi-intent',
    'telegram-voice-audio',
    'shared-page-voice-day',
    'shared-page-voice-list',
    'alias-omeke',
    'unsupported-research',
    'incomplete-move',
    'stale-trip-media',
    'unauthorized-upload',
    'split-trip-trek-uniqueness',
    'checkout-entitlements',
    'checkout-entitlements-missing',
    'exact-no-match',
    'successful-edit-wording',
  ];
  const missingFixtures = requiredFixtures.filter((id) => !fixtureIds.includes(id));
  const node = spawnSync(process.execPath, ['--check', PIPELINE], { encoding: 'utf8' });
  const report = {
    ok: false,
    pipeline: PIPELINE_NAME,
    pipeline_version: PIPELINE_VERSION,
    cwd,
    feature_map: FEATURE_MAP,
    skill: SKILL,
    checks: {
      feature_map: fs.existsSync(FEATURE_MAP),
      skill: fs.existsSync(SKILL),
      pipeline_syntax: node.status === 0,
      fixture_count: fixtures.length,
      missing_features: missingFeatures,
      missing_fixtures: missingFixtures,
    },
  };
  report.ok = report.checks.feature_map
    && report.checks.skill
    && report.checks.pipeline_syntax
    && missingFeatures.length === 0
    && missingFixtures.length === 0
    && fixtures.length >= requiredFixtures.length;
  return report;
}

function runFixtures(args, apply) {
  const files = args.all ? listFixtureFiles(cwd) : args.fixtures;
  if (!files.length) throw new Error('Pass --fixture <path> or --all-fixtures');
  return files.map((filePath) => {
    const fixture = loadFixture(filePath, cwd);
    const { receipt } = runVacationEditPipeline(fixture, {
      apply,
      persist: args.persist,
      jobId: args.jobId || undefined,
      cwd,
    });
    return receipt;
  });
}

function readReceipt(jobId) {
  const dir = artifactDirFor(jobId, cwd);
  const receiptPath = path.join(dir, 'receipt.json');
  if (!fs.existsSync(receiptPath)) throw new Error(`No receipt at ${receiptPath}`);
  return JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
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
      if (report.checks.missing_fixtures.length) console.log(`  missing fixtures: ${report.checks.missing_fixtures.join(', ')}`);
    }
    process.exit(report.ok ? 0 : 1);
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
