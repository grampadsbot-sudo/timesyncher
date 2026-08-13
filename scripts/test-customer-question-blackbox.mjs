#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const fixturePath = process.argv[2] || './customer-question-fixtures.json';
const spec = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const fixtures = Array.isArray(spec.fixtures) ? spec.fixtures : [];
const defaultPayload = spec.defaultPayload || {};

const LIVE_TREK_DB_PATH = process.env.TIMESYNCHER_TEST_LIVE_TREK_DB_PATH || '/home/timesyncher-agent/trek/runtime/data/travel.db';
const TEST_TREK_DB_PATH = process.env.TIMESYNCHER_TREK_DB_PATH || `/tmp/timesyncher-customer-blackbox-${process.pid}-${Date.now()}.db`;
if (!process.env.TIMESYNCHER_TREK_DB_PATH && fs.existsSync(LIVE_TREK_DB_PATH)) {
  fs.copyFileSync(LIVE_TREK_DB_PATH, TEST_TREK_DB_PATH);
}
process.on('exit', () => {
  if (!process.env.TIMESYNCHER_TREK_DB_PATH && TEST_TREK_DB_PATH.startsWith('/tmp/timesyncher-customer-blackbox-')) {
    try { fs.rmSync(TEST_TREK_DB_PATH, { force: true }); } catch {}
  }
});

function mergedPayload(fixture) {
  return {
    ...defaultPayload,
    ...(fixture.payload || {}),
  };
}

function dispatchFixture(fixture) {
  const input = {
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: fixture.prompt,
    trip_transcript: fixture.tripTranscript || fixture.trip_transcript || [],
    payload: mergedPayload(fixture),
  };
  const result = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: {
      ...process.env,
      TIMESYNCHER_TREK_DB_PATH: TEST_TREK_DB_PATH,
      TIMESYNCHER_TREK_SYNC_SKIP_API_SMOKE: '1',
      TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
      TIMESYNCHER_ACCESS_CHECKOUT_BASE_URL: 'https://vacation-staging.timesyncher.com',
      TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
      TIMESYNCHER_WORKER_TOKEN: '',
    },
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${fixture.id} dispatch failed\nSTDERR:\n${result.stderr}\nSTDOUT:\n${result.stdout}`);
  return JSON.parse(result.stdout);
}

function literalRegex(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function assertFixture(fixture, output) {
  const expected = fixture.expect || {};
  const response = String(output.customerResponse || '');
  const decision = output.result?.turnDecision || output.result?.supportRouterDecision || {};
  if (expected.intent) assert.equal(decision.intent, expected.intent, `${fixture.id} intent`);
  if (expected.write_mode) assert.equal(decision.write_mode || decision.writeMode, expected.write_mode, `${fixture.id} write_mode`);
  if (expected.shouldQueueWorker !== undefined) assert.equal(Boolean(decision.shouldQueueWorker), Boolean(expected.shouldQueueWorker), `${fixture.id} shouldQueueWorker`);
  if (expected.editApplied !== undefined) assert.equal(Boolean(output.result?.editApplied), Boolean(expected.editApplied), `${fixture.id} editApplied`);
  if (expected.createNewTrip !== undefined) assert.equal(Boolean(output.result?.createNewTrip), Boolean(expected.createNewTrip), `${fixture.id} createNewTrip`);
  for (const needle of expected.responseIncludes || []) {
    assert.match(response, literalRegex(needle), `${fixture.id} response should include ${needle}\n${response}`);
  }
  for (const needle of expected.responseExcludes || []) {
    assert.doesNotMatch(response, literalRegex(needle), `${fixture.id} response should not include ${needle}\n${response}`);
  }
}

const failures = [];
for (const fixture of fixtures) {
  try {
    const output = dispatchFixture(fixture);
    assertFixture(fixture, output);
  } catch (error) {
    failures.push({ id: fixture.id, message: error?.message || String(error) });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, checked: fixtures.length, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checked: fixtures.length, fixturePath }));
