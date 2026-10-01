#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BANNED_DISPATCH = /I need to know which|I need to check one thing|view-only for people who have the URL|The shared website link for .* is view-only/i;

const TEST_ENV = {
  ...process.env,
  TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
  TIMESYNCHER_WORKER_TOKEN: '',
  TIMESYNCHER_TREK_SYNC_SKIP_API_SMOKE: '1',
  TIMESYNCHER_DISABLE_GROK_RESPONSE_RENDERER: '1',
};

function dispatchJob(requestText, payload = {}) {
  const result = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
    input: JSON.stringify({
      id: randomUUID(),
      request_id: randomUUID(),
      request_text: requestText,
      payload,
    }),
    encoding: 'utf8',
    env: {
      ...TEST_ENV,
      TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    },
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
    cwd: SCRIPT_DIR,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const linkCapability = dispatchJob(
  'If someone has the shared link, can they edit our Hawaii vacation or only view it?',
  {
    linkedVacations: [
      { title: 'Hawaii Trip', destination: 'Hawaii', shareToken: 'hawaii-demo-trip', shareCollab: false },
      { title: 'Vegas Trip', destination: 'Las Vegas', shareToken: 'vegas-demo-trip', shareCollab: true },
    ],
  },
);
const linkDecision = linkCapability.result.turnDecision;
assert.equal(linkDecision.answer, '');
assert.equal(linkDecision.facts?.need, 'which_trip');
assert.ok(Array.isArray(linkDecision.facts?.candidates));
assert.ok(linkDecision.facts.candidates.length >= 2);
const linkBlob = JSON.stringify({ out: linkCapability, facts: linkDecision.facts, replyFacts: linkCapability.replyFacts });
assert.doesNotMatch(linkBlob, BANNED_DISPATCH);

const roster = dispatchJob('Who has access to edit this vacation website?', {
  linkedVacations: [
    { title: 'Trip A', shareToken: 'trip-a', members: [] },
    { title: 'Trip B', shareToken: 'trip-b', members: [] },
  ],
});
assert.equal(roster.result.turnDecision.facts?.need, 'which_trip');
assert.doesNotMatch(JSON.stringify(roster), BANNED_DISPATCH);

const clarify = dispatchJob('Can you help with my account?');
assert.ok(clarify.result.turnDecision.facts?.need);
assert.doesNotMatch(JSON.stringify(clarify), BANNED_DISPATCH);

const dispatchSource = fs.readFileSync(new URL('./product-gbrain-dispatch.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(dispatchSource, /I need to know which vacation link you mean/);
assert.doesNotMatch(dispatchSource, /I need to check one thing before I change anything/);

const trekScripts = ['./trek-itinerary-edit.mjs', './trek-agent-edit.mjs'];
const familyTripToken = ['the', 'davidson', 'family', 'trip'].join('-');
for (const script of trekScripts) {
  const source = fs.readFileSync(path.join(SCRIPT_DIR, script), 'utf8');
  const rg = spawnSync('rg', ['-n', '-i', 'caldwell|davidson|CALDWELL_FAMILY|mentionsOtherKnownTrip', path.join(SCRIPT_DIR, script)], {
    encoding: 'utf8',
  });
  if (rg.error && rg.error.code === 'ENOENT') {
    assert.doesNotMatch(source, /caldwell|davidson|CALDWELL_FAMILY|mentionsOtherKnownTrip/i);
    assert.equal(source.includes(familyTripToken), false);
  } else {
    assert.equal(rg.status, 1, `rg should find no matches in ${script}:\n${rg.stdout}`);
    assert.equal(source.includes(familyTripToken), false);
  }
  const missing = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ request_text: 'Add a timeline item.' }),
    encoding: 'utf8',
    env: TEST_ENV,
    timeout: 15000,
    cwd: SCRIPT_DIR,
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing TREK share token/i);
}

console.log(JSON.stringify({ ok: true, checked: 'f13-n1-hardcode-delete' }));
