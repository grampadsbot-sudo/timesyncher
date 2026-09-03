#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadFixture,
  listFixtureFiles,
  runVacationEditPipeline,
  compactReceipt,
} from '../src/vacation/edit-pipeline.mjs';

const cwd = process.cwd();

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
    json: false,
    persist: true,
    fixtures: [],
    jobId: '',
    all: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') args.dryRun = true;
    else if (token === '--apply') args.apply = true;
    else if (token === '--json') args.json = true;
    else if (token === '--no-persist') args.persist = false;
    else if (token === '--all-fixtures') args.all = true;
    else if (token === '--fixture' || token === '-f') args.fixtures.push(argv[++i]);
    else if (token === '--job-id') args.jobId = argv[++i];
    else if (token === '--help' || token === '-h') args.help = true;
    else if (!token.startsWith('-')) args.fixtures.push(token);
  }
  return args;
}

function usage() {
  return [
    'vacation-edit-pipeline — shared TimeSyncher Vacation edit dry-run',
    '',
    'Usage:',
    '  node scripts/vacation-edit-pipeline.mjs --dry-run --json --fixture features/fixtures/telegram-text-single-edit.json',
    '  node scripts/vacation-edit-pipeline.mjs --dry-run --all-fixtures --json',
    '  node scripts/vacation-edit-pipeline.mjs --apply --fixture features/fixtures/telegram-text-single-edit.json',
    '',
    'Apply mutates only the local fixture snapshot written under artifacts/vacation-verify/<job_id>/.',
    'It does not call Stripe, TREK production, Telegram, or customer simulation.',
  ].join('\n');
}

function runOne(filePath, args) {
  const fixture = loadFixture(filePath, cwd);
  const { receipt } = runVacationEditPipeline(fixture, {
    apply: args.apply,
    persist: args.persist,
    jobId: args.jobId || undefined,
    cwd,
  });
  return receipt;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const files = args.all ? listFixtureFiles(cwd) : args.fixtures;
if (!files.length) {
  console.error(usage());
  process.exit(2);
}

const receipts = files.map((filePath) => runOne(filePath, args));
const failed = receipts.filter((receipt) => !receipt.ok);
if (args.json) {
  const payload = receipts.length === 1
    ? { receipt: receipts[0], compact: compactReceipt(receipts[0]) }
    : { receipts, compact: receipts.map(compactReceipt) };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
} else {
  for (const receipt of receipts) {
    const compact = compactReceipt(receipt);
    console.log(`${receipt.ok ? 'PASS' : 'FAIL'} ${receipt.job_id}  ${receipt.surface}  ${path.relative(cwd, receipt.fixture_path || '')}`);
    console.log(`  events: ${compact.events_jsonl}`);
    console.log(`  artifacts: ${compact.artifact_dir}`);
    console.log(`  response: ${String(compact.customer_facing_response).split('\n')[0]}`);
  }
}

if (failed.length) process.exit(1);
