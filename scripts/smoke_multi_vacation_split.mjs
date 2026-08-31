#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const id = randomUUID();
const run = spawnSync(process.execPath, ['./scripts/product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id,
    request_id: id,
    onboarding_token: `multi-vacation-split-smoke-${Date.now()}`,
    request_type: 'onboarding_setup',
    job_type: 'onboarding_setup',
    request_text: 'Can you separate the itineraries into three or do I have to do new ones? Oahu Waikiki, Big Island girlfriend visit Sunday through Wednesday, and Big Island Home through end of September.',
    payload: {
      priorTelegramVoiceNotes: {
        planningText: '[previous voice note message 1]\nHealthy food, happy hours, Monkeypod, Moku, Blue Note. Kona music, local restaurants, church Sundays.',
      },
    },
  }),
  encoding: 'utf8',
  env: {
    ...process.env,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
    TIMESYNCHER_ALLOW_EMPTY_RESEARCH_PASS: '1',
    TIMESYNCHER_ALLOW_INCOMPLETE_RESEARCH_PASS: '1',
  },
  timeout: 180000,
  maxBuffer: 8 * 1024 * 1024,
});

assert.equal(run.status, 0, run.stderr || run.stdout);
const body = JSON.parse(run.stdout);
const split = body.result.multiVacationSplit;
assert.equal(body.result.turnDecision.intent, 'multi_vacation_split');
assert.equal(body.result.turnDecision.write_mode, 'create');
assert.equal(body.result.createNewTrip, true);
assert.equal(split.status, 'completed');
assert.equal(split.transcriptContextAttached, true);
assert.deepEqual(split.vacations.map((item) => item.title), [
  'Oahu, Waikiki',
  'Big Island Girlfriend Visit',
  'Big Island Home',
]);
for (const vacation of split.vacations) {
  assert.match(vacation.url, /^https:\/\/travel\.timesyncher\.com\/shared\//);
  assert.ok(vacation.candidateCount >= 1, `${vacation.title} should have public option candidates`);
}
assert.match(body.customerResponse, /Oahu, Waikiki/);
assert.match(body.customerResponse, /Big Island Girlfriend Visit/);
assert.match(body.customerResponse, /Big Island Home/);
assert.doesNotMatch(body.customerResponse, /no target|GBrain|TREK|worker|sqlite/i);
assert.equal(body.result.researchSummary.status, 'multi_vacation_split_complete');
assert.equal(body.result.turnInspector.leakScan.ok, true);
