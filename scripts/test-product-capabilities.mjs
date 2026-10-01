#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  buildCapabilityObject,
  assertCapabilityObject,
  assertCustomerRequestAllowed,
  assertToolingAllowed,
} from './product-capabilities.mjs';

const LIVE_TREK_DB_PATH = process.env.TIMESYNCHER_TEST_LIVE_TREK_DB_PATH || '/home/timesyncher-agent/trek/runtime/data/travel.db';
const TEST_TREK_DB_PATH = process.env.TIMESYNCHER_TREK_DB_PATH || `/tmp/timesyncher-product-capabilities-${process.pid}-${Date.now()}.db`;
if (!process.env.TIMESYNCHER_TREK_DB_PATH && fs.existsSync(LIVE_TREK_DB_PATH)) {
  fs.copyFileSync(LIVE_TREK_DB_PATH, TEST_TREK_DB_PATH);
}
const TEST_ENV = {
  ...process.env,
  TIMESYNCHER_TREK_DB_PATH: TEST_TREK_DB_PATH,
  ...(TEST_TREK_DB_PATH !== LIVE_TREK_DB_PATH ? { TIMESYNCHER_TREK_SYNC_SKIP_API_SMOKE: '1' } : {}),
};
const USE_ISOLATED_TREK_DB = TEST_TREK_DB_PATH !== LIVE_TREK_DB_PATH;
process.on('exit', () => {
  if (!process.env.TIMESYNCHER_TREK_DB_PATH && TEST_TREK_DB_PATH.startsWith('/tmp/timesyncher-product-capabilities-')) {
    try {
      fs.rmSync(TEST_TREK_DB_PATH, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
});

async function assertGeneratedSharedUrlIsReadable(webItineraryUrl) {
  if (USE_ISOLATED_TREK_DB) return;
  const parsed = new URL(webItineraryUrl);
  const token = parsed.pathname.split('/').filter(Boolean).at(-1);
  assert.ok(token, `generated shared URL is missing a token: ${webItineraryUrl}`);
  const apiUrl = new URL(`/api/shared/${encodeURIComponent(token)}`, parsed.origin);
  const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
  assert.equal(response.status, 200, `generated staging shared API must be readable: ${apiUrl} returned ${response.status}`);
  const payload = await response.json();
  assert.ok(payload.trip || payload.tripId || payload.things || payload.days, 'generated shared API payload must include trip data');
}


const timestopperWorkerSource = fs.readFileSync('./timestopper-worker.mjs', 'utf8');
assert.equal(timestopperWorkerSource.includes('api.telegram.org'), false, 'Worker must not call Telegram');
assert.equal(timestopperWorkerSource.includes('I do not see a linked'), false, 'Dispatcher customer copy must not expose linked-vacation/account implementation language');
assert.equal(timestopperWorkerSource.includes('send the vacation website link and the change'), false, 'Dispatcher must not ask customers to send vacation website links for vague support turns');
assert.ok(timestopperWorkerSource.includes('TIMESYNCHER_WORKER_DRAIN_MAX_JOBS'), 'Worker drain must be bounded');
assert.ok(timestopperWorkerSource.includes("query.set('jobId', targetJobId)"), 'Worker request-path drain must claim only the target job id when present');
assert.ok(timestopperWorkerSource.includes('spawn(process.execPath, [PRODUCT_GBRAIN_DISPATCH]'), 'Worker must invoke dispatcher through node so deploy chmod cannot cause EACCES');
assert.ok(timestopperWorkerSource.includes('findSupportNoWriteDecision'), 'Worker must silently no-op queued jobs that carry support no-write decisions');
assert.ok(timestopperWorkerSource.includes('support_router_no_write'), 'Worker no-write guard must preserve support router reason');
assert.ok(timestopperWorkerSource.includes('timestopper-worker-support-no-write-gate'), 'Worker no-write guard must expose deterministic tooling receipt');
const dispatchSource = fs.readFileSync('./product-gbrain-dispatch.mjs', 'utf8');
assert.ok(dispatchSource.includes('function grokRouterDecision'), 'Product dispatcher must call the Grok intent router before deterministic fallback classification');
assert.ok(dispatchSource.includes('function currentTurnRouterDecisionModelFirst'), 'Product dispatcher must expose the model-first router entrypoint');
assert.ok(dispatchSource.includes('function grokCustomerRender'), 'Product dispatcher must let Grok render bounded customer answers from resolved fact packets');
assert.ok(dispatchSource.includes('customerCopyLooksSafe'), 'Product dispatcher must validate Grok-rendered customer copy before sending it');
assert.ok(dispatchSource.includes('deterministic_fallback_router'), 'Product dispatcher must label regex/word routing as fallback only');
assert.ok(dispatchSource.includes('function makeTurnDecision'), 'Product dispatcher must use a typed turn decision object');
assert.ok(dispatchSource.includes('write_mode'), 'Typed decision object must include write_mode');
assert.ok(dispatchSource.includes('tripSelector'), 'Typed decision object must include tripSelector');
assert.ok(dispatchSource.includes('answerMode'), 'Typed decision object must include answerMode');
assert.ok(dispatchSource.includes('default_fail_closed_no_write'), 'Unknown turns must default to no-write clarification');
assert.equal(dispatchSource.includes('api.telegram.org'), false, 'Dispatcher must not call Telegram');
assert.ok(dispatchSource.includes('assertCommitWorthyTurnDecision'), 'Workers/dispatcher must refuse queued jobs without commit-worthy write_mode');
assert.ok(dispatchSource.includes('buildTurnInspector'), 'Dispatcher must produce a turn inspector payload');
assert.ok(dispatchSource.includes('person_access_question'), 'Dispatcher must classify person-specific vacation access questions as no-write account lookups');
assert.ok(dispatchSource.includes('linkedTripsConsidered'), 'Turn inspector must expose linked trips considered');
assert.ok(dispatchSource.includes('leakScan'), 'Turn inspector must expose customer-copy leak scan results');

const manifest = JSON.parse(fs.readFileSync('./product-gbrain-manifest.json', 'utf8'));
const capabilities = buildCapabilityObject(manifest);
assertCapabilityObject(capabilities);

assert.doesNotThrow(() => assertCustomerRequestAllowed({ request_text: 'Plan a 7 day Tokyo vacation with hotels, flights, ramen, shopping, and museums.' }, capabilities));
assert.throws(() => assertCustomerRequestAllowed({ request_text: 'Read my Gmail and check my Google Calendar before planning Hawaii.' }, capabilities), /gmail|google-calendar/);
assert.throws(() => assertCustomerRequestAllowed({ request_text: 'Post this itinerary to Twitter and run a shell command.' }, capabilities), /social-posting|shell-access/);
assert.throws(() => assertCustomerRequestAllowed({ request_text: 'Book the hotel and pay for the tour.' }, capabilities), /booking-payment/);

assert.doesNotThrow(() => assertToolingAllowed(['product-gbrain-dispatch', 'timesyncher-travel-assistant', 'public-web-search', 'travel.assistant.recommend-itinerary'], capabilities));
assert.doesNotThrow(() => assertToolingAllowed(['product-gbrain-dispatch', 'timesyncher-travel-assistant', 'trek-agent-edit-runner', 'travel.assistant.grok-trek-agent-edit'], capabilities));
assert.doesNotThrow(() => assertToolingAllowed(['timesyncher-vacation-telegram-collaborators', 'stripe-checkout-addon', 'telegram-collaborator-invite'], capabilities));
assert.throws(() => assertToolingAllowed(['timesyncher-email-review'], capabilities), /outside allowlist/);


const smokeToken = `capability-smoke-${Date.now()}`;
const smokeJobId = randomUUID();
const dispatch = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: smokeJobId,
    request_id: smokeJobId,
    onboarding_token: smokeToken,
    request_text: 'Plan a public web researched vacation to Honolulu with hotels restaurants shopping activities and ground transport.',
    payload: {
      vacationName: `Capability Smoke ${Date.now()}`,
      unforgettableGoal: 'Prove the Vacation boundary allows public travel research without hard-coded recommendations.',
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
const e2e = JSON.parse(dispatch.stdout);
assert.match(e2e.result.webItineraryUrl, /^https:\/\/travel\.timesyncher\.com\/shared\//);
await assertGeneratedSharedUrlIsReadable(e2e.result.webItineraryUrl);
assert.ok(['provider_not_configured', 'source_backed_research_complete'].includes(e2e.result.researchSummary.status));
if (e2e.result.researchSummary.status === 'source_backed_research_complete') {
  assert.ok(e2e.result.researchSummary.sourceBackedCandidateCount >= 40);
} else {
  assert.equal(e2e.result.researchSummary.sourceBackedCandidateCount, 0);
}
const serialized = JSON.stringify(e2e);
for (const forbidden of ['Moana Surfrider', 'Banzai Pipeline', 'Marugame Udon', 'Merriman', 'Hilton Waikoloa', 'Manta Ray Dives']) {
  assert.equal(serialized.includes(forbidden), false, `hard-coded Hawaii recommendation leaked: ${forbidden}`);
}
assert.match(e2e.customerResponse, /first TimeSyncher Vacation pass is ready/i);
assert.equal(e2e.replyFacts?.url, e2e.result.webItineraryUrl);
assert.doesNotMatch(e2e.customerResponse, /Here is the website:/);
assert.doesNotMatch(e2e.customerResponse, /\bTREK\b/);
assert.doesNotMatch(e2e.customerResponse, /research workspace/i);

const editJobId = randomUUID();
const editTitle = `Capability Smoke Family Event ${Date.now()}`;
const edit = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: editJobId,
    request_id: editJobId,
    request_text: `Please update the trip at ${e2e.result.webItineraryUrl}. Add "${editTitle}" as a Family Event on day 2 at 2pm.`,
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(edit.status, 0, edit.stderr || edit.stdout);
const editResult = JSON.parse(edit.stdout);
assert.match(editResult.customerResponse, /updated the vacation website/i);
assert.match(editResult.customerResponse, new RegExp(editTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(editResult.customerResponse, /with \d+ itinerary changes/i);
assert.equal(editResult.replyFacts?.url, editResult.result.webItineraryUrl);
assert.doesNotMatch(editResult.customerResponse, /Here is the website:/);
assert.equal(editResult.result.editApplied, true);
assert.equal(editResult.result.trekSync.updatedItems[0].title, editTitle);
assert.equal(editResult.result.trekSync.updatedItems[0].category, 'family_event');
if (!USE_ISOLATED_TREK_DB) {
  const editedApi = await fetch(new URL(`/api/shared/${encodeURIComponent(editResult.result.trekSync.token)}`, editResult.result.webItineraryUrl));
  assert.equal(editedApi.status, 200);
  const editedPayload = await editedApi.json();
  assert.ok(JSON.stringify(editedPayload).includes(editTitle), 'edited shared trip must contain newly added family event');
}

const terseEditTitle = `Capability Smoke Terse Family Event ${Date.now()}`;
const terseEdit = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    share_token: e2e.result.trekSync.token,
    request_text: `Add family event “${terseEditTitle}” to day 2 at 2pm`,
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(terseEdit.status, 0, terseEdit.stderr || terseEdit.stdout);
const terseEditResult = JSON.parse(terseEdit.stdout);
assert.match(terseEditResult.customerResponse, /updated the vacation website/i);
assert.match(terseEditResult.customerResponse, new RegExp(terseEditTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(terseEditResult.customerResponse, /with \d+ itinerary changes/i);
assert.equal(terseEditResult.result.editApplied, true);
assert.equal(terseEditResult.result.trekSync.operationCount, 1);
assert.equal(terseEditResult.result.trekSync.updatedItems[0].title, terseEditTitle);
assert.equal(terseEditResult.result.trekSync.updatedItems[0].day, 2);
assert.equal(terseEditResult.result.trekSync.updatedItems[0].category, 'family_event');

const linkedAmbiguous = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    share_token: e2e.result.trekSync.token,
    request_text: 'Make this vacation better with more restaurants and activities.',
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(linkedAmbiguous.status, 0, linkedAmbiguous.stderr || linkedAmbiguous.stdout);
const linkedAmbiguousResult = JSON.parse(linkedAmbiguous.stdout);
assert.match(linkedAmbiguousResult.customerResponse, /update the current vacation website, or start a brand-new vacation/i);
assert.equal(linkedAmbiguousResult.result.editApplied, false);
assert.equal(linkedAmbiguousResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(linkedAmbiguousResult.result.turnDecision.write_mode, 'none');
assert.doesNotMatch(linkedAmbiguousResult.customerResponse, /first TimeSyncher Vacation pass is ready/i);

const linkedNewVacation = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    share_token: 'the-davidson-family-trip',
    request_text: 'Sweet! I want to create a 4 night staycation on the Las Vegas strip that just ended Mon morning.',
    received_at: '2026-08-04T20:49:41.000Z',
    payload: {
      trip: {
        title: 'the Davidson family trip',
        shareToken: 'the-davidson-family-trip',
      },
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(linkedNewVacation.status, 0, linkedNewVacation.stderr || linkedNewVacation.stdout);
const linkedNewVacationResult = JSON.parse(linkedNewVacation.stdout);
assert.match(linkedNewVacationResult.customerResponse, /vacation website|first TimeSyncher Vacation pass/i);
assert.doesNotMatch(linkedNewVacationResult.result.webItineraryUrl, /the-davidson-family-trip/);
assert.match(linkedNewVacationResult.result.webItineraryUrl, /las-vegas-strip-vacation/);
assert.notEqual(linkedNewVacationResult.result.trekSync.token, 'the-davidson-family-trip');
assert.equal(linkedNewVacationResult.result.trekSync.token.includes('davidson'), false);
assert.equal(linkedNewVacationResult.result.createNewTrip, true);
assert.equal(linkedNewVacationResult.result.normalizedTrip.vacationName.includes('Davidson'), false);
assert.equal(linkedNewVacationResult.result.normalizedTrip.dates.startDate, '2026-07-30');
assert.equal(linkedNewVacationResult.result.normalizedTrip.dates.endDate, '2026-08-03');
assert.match(linkedNewVacationResult.result.normalizedTrip.dates.dateText, /4 nights \/ 5 days/);
assert.ok(['provider_not_configured', 'source_backed_research_complete'].includes(linkedNewVacationResult.result.researchSummary.status));

const metaNewVacationQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    share_token: linkedNewVacationResult.result.trekSync.token,
    request_text: 'So what should I do with the staging bot? Should I start a new Vegas vacation? Is the current one deleted?',
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(metaNewVacationQuestion.status, 0, metaNewVacationQuestion.stderr || metaNewVacationQuestion.stdout);
const metaNewVacationQuestionResult = JSON.parse(metaNewVacationQuestion.stdout);
assert.match(metaNewVacationQuestionResult.customerResponse, /I need a direct instruction before I work on a vacation/i);
assert.doesNotMatch(metaNewVacationQuestionResult.customerResponse, /send .*link|website link and the change/i);
assert.equal(metaNewVacationQuestionResult.result.editApplied, false);
assert.equal(metaNewVacationQuestionResult.result.createNewTrip, false);
assert.equal(metaNewVacationQuestionResult.result.researchSummary.status, 'support_router_no_write');
assert.doesNotMatch(metaNewVacationQuestionResult.customerResponse, /first TimeSyncher Vacation pass is ready/i);

const metaQuestionWithPriorCreateContext = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'So what should I do with the staging bot? Should I start a new Vegas vacation? Is the current one deleted?',
    trip_transcript: [
      { speaker: 'customer', body: 'Create a new 4-night staycation on the Las Vegas Strip ending Monday morning' },
      { speaker: 'customer', body: 'I don’t see the dates on the trip. It was 4 nights which means 5 days. And the hotel was the jockey club.' },
    ],
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(metaQuestionWithPriorCreateContext.status, 0, metaQuestionWithPriorCreateContext.stderr || metaQuestionWithPriorCreateContext.stdout);
const metaQuestionWithPriorCreateContextResult = JSON.parse(metaQuestionWithPriorCreateContext.stdout);
assert.match(metaQuestionWithPriorCreateContextResult.customerResponse, /I need a direct instruction before I work on a vacation/i);
assert.doesNotMatch(metaQuestionWithPriorCreateContextResult.customerResponse, /send .*link|website link and the change/i);
assert.equal(metaQuestionWithPriorCreateContextResult.result.createNewTrip, false);
assert.equal(metaQuestionWithPriorCreateContextResult.result.editApplied, false);
assert.equal(metaQuestionWithPriorCreateContextResult.result.webItineraryUrl, null);
assert.equal(metaQuestionWithPriorCreateContextResult.result.researchSummary.status, 'support_router_no_write');
assert.doesNotMatch(metaQuestionWithPriorCreateContextResult.customerResponse, /first TimeSyncher Vacation pass is ready/i);
assert.equal(metaQuestionWithPriorCreateContextResult.result.trekSync, null);

const vagueNextStepWithPriorCreateContext = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'What should I do now?',
    trip_transcript: [
      { speaker: 'customer', body: 'Create a new 4-night staycation on the Las Vegas Strip ending Monday morning' },
      { speaker: 'customer', body: 'I don’t see the dates on the trip. It was 4 nights which means 5 days. And the hotel was the jockey club.' },
    ],
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(vagueNextStepWithPriorCreateContext.status, 0, vagueNextStepWithPriorCreateContext.stderr || vagueNextStepWithPriorCreateContext.stdout);
const vagueNextStepWithPriorCreateContextResult = JSON.parse(vagueNextStepWithPriorCreateContext.stdout);
assert.match(vagueNextStepWithPriorCreateContextResult.customerResponse, /I need a little more direction before I work on a vacation/i);
assert.doesNotMatch(vagueNextStepWithPriorCreateContextResult.customerResponse, /send .*link|website link and the change/i);
assert.equal(vagueNextStepWithPriorCreateContextResult.result.createNewTrip, false);
assert.equal(vagueNextStepWithPriorCreateContextResult.result.editApplied, false);
assert.equal(vagueNextStepWithPriorCreateContextResult.result.webItineraryUrl, null);
assert.equal(vagueNextStepWithPriorCreateContextResult.result.normalizedTrip.destination, null);
assert.equal(vagueNextStepWithPriorCreateContextResult.result.normalizedTrip.dates.startDate, '');
assert.equal(vagueNextStepWithPriorCreateContextResult.result.normalizedTrip.dates.endDate, '');
assert.equal(vagueNextStepWithPriorCreateContextResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(vagueNextStepWithPriorCreateContextResult.result.trekSync, null);
assert.doesNotMatch(vagueNextStepWithPriorCreateContextResult.customerResponse, /first TimeSyncher Vacation pass is ready/i);

const vegasExistenceQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'Is there a Vegas vacation?',
    trip_transcript: [
      { speaker: 'customer', body: 'Create a new 4-night staycation on the Las Vegas Strip ending Monday morning' },
      { speaker: 'customer', body: 'I don’t see the dates on the trip. It was 4 nights which means 5 days. And the hotel was the jockey club.' },
    ],
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(vegasExistenceQuestion.status, 0, vegasExistenceQuestion.stderr || vegasExistenceQuestion.stdout);
const vegasExistenceQuestionResult = JSON.parse(vegasExistenceQuestion.stdout);
assert.match(vegasExistenceQuestionResult.customerResponse, /could not find a matching vacation site yet/i);
assert.equal(vegasExistenceQuestionResult.result.createNewTrip, false);
assert.equal(vegasExistenceQuestionResult.result.editApplied, false);
assert.equal(vegasExistenceQuestionResult.result.webItineraryUrl, null);
assert.equal(vegasExistenceQuestionResult.result.normalizedTrip.destination, 'Vegas');
assert.equal(vegasExistenceQuestionResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(vegasExistenceQuestionResult.result.trekSync, null);
assert.equal(vegasExistenceQuestionResult.result.turnDecision.write_mode, 'none');
assert.equal(vegasExistenceQuestionResult.result.turnDecision.answerMode, 'clarify');
assert.equal(vegasExistenceQuestionResult.result.turnInspector.routerDecision.write_mode, 'none');
assert.equal(vegasExistenceQuestionResult.result.turnInspector.leakScan.ok, true);
assert.doesNotMatch(vegasExistenceQuestionResult.customerResponse, /first TimeSyncher Vacation pass is ready|turning the information you sent/i);
assert.doesNotMatch(vegasExistenceQuestionResult.customerResponse, /linked|Telegram account/i);
assert.doesNotMatch(vegasExistenceQuestionResult.customerResponse, /lookup, not an instruction|not changing anything|not going to create or change/i);

const linkedVegasExistenceQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'Is there a Vegas vacation?',
    payload: {
      linkedVacations: [
        {
          title: 'Vegas Strip Staycation',
          destination: 'Las Vegas Strip',
          shareToken: 'vegas-strip-staycation',
        },
      ],
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(linkedVegasExistenceQuestion.status, 0, linkedVegasExistenceQuestion.stderr || linkedVegasExistenceQuestion.stdout);
const linkedVegasExistenceQuestionResult = JSON.parse(linkedVegasExistenceQuestion.stdout);
assert.match(linkedVegasExistenceQuestionResult.customerResponse, /Yes, I found Vegas Strip Staycation/i);
assert.match(linkedVegasExistenceQuestionResult.customerResponse, /https:\/\/travel\.timesyncher\.com\/shared\/vegas-strip-staycation\//);
assert.equal(linkedVegasExistenceQuestionResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(linkedVegasExistenceQuestionResult.result.turnDecision.answerMode, 'account_state');
assert.equal(linkedVegasExistenceQuestionResult.result.turnInspector.linkedTripsConsidered.length, 1);
assert.equal(linkedVegasExistenceQuestionResult.result.turnInspector.leakScan.ok, true);
assert.doesNotMatch(linkedVegasExistenceQuestionResult.customerResponse, /linked|Telegram account/i);


const linkedVegasAccessQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'But does she specifically have access to the Vegas vacation?',
    trip_transcript: [
      { speaker: 'customer', body: 'Does my wife Kim have access to this vacation?' },
    ],
    payload: {
      linkedVacations: [
        {
          title: 'Las Vegas Strip Vacation',
          destination: 'Las Vegas Strip',
          shareToken: 'las-vegas-strip-vacation',
          shareCollab: false,
          members: [{ username: 'admin', email: 'admin@timesyncher.local' }],
        },
      ],
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(linkedVegasAccessQuestion.status, 0, linkedVegasAccessQuestion.stderr || linkedVegasAccessQuestion.stdout);
const linkedVegasAccessQuestionResult = JSON.parse(linkedVegasAccessQuestion.stdout);
assert.equal(linkedVegasAccessQuestionResult.result.turnDecision.facts?.named_member_or_editor, false);
assert.match(linkedVegasAccessQuestionResult.result.turnDecision.facts?.vacation_url || '', /las-vegas-strip-vacation/);
assert.doesNotMatch(linkedVegasAccessQuestionResult.customerResponse, /named member\/editor|view-only unless|available to anyone with the shared link/i);
assert.doesNotMatch(linkedVegasAccessQuestionResult.customerResponse, /Telegram/i);
assert.equal(linkedVegasAccessQuestionResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(linkedVegasAccessQuestionResult.result.turnDecision.intent, 'account_question');
assert.equal(linkedVegasAccessQuestionResult.result.turnDecision.write_mode, 'none');
assert.equal(linkedVegasAccessQuestionResult.result.turnDecision.answerMode, 'account_state');
assert.equal(linkedVegasAccessQuestionResult.result.editApplied, false);
assert.equal(linkedVegasAccessQuestionResult.result.createNewTrip, false);
assert.doesNotMatch(linkedVegasAccessQuestionResult.customerResponse, /updating the TimeSyncher Vacation website|itinerary change/i);

const thisVacationAccessQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'Does my wife Kim have access to this vacation?',
    payload: {
      linkedVacations: [
        {
          title: 'Las Vegas Strip Vacation',
          destination: 'Las Vegas Strip',
          shareToken: 'las-vegas-strip-vacation',
          shareCollab: false,
          members: [{ username: 'admin', email: 'admin@timesyncher.local' }],
        },
      ],
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(thisVacationAccessQuestion.status, 0, thisVacationAccessQuestion.stderr || thisVacationAccessQuestion.stdout);
const thisVacationAccessQuestionResult = JSON.parse(thisVacationAccessQuestion.stdout);
assert.equal(thisVacationAccessQuestionResult.result.turnDecision.facts?.named_member_or_editor, false);
assert.doesNotMatch(thisVacationAccessQuestionResult.customerResponse, /named member\/editor|view-only unless|available to anyone with the shared link/i);
assert.equal(thisVacationAccessQuestionResult.result.turnDecision.intent, 'account_question');
assert.equal(thisVacationAccessQuestionResult.result.turnDecision.write_mode, 'none');
assert.equal(thisVacationAccessQuestionResult.result.editApplied, false);
assert.equal(thisVacationAccessQuestionResult.result.createNewTrip, false);

const wifeTelegramCollaboratorStatusQuestion = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'Is my wife already a telegram collaborator?',
    payload: {
      linkedVacations: [
        {
          title: 'Las Vegas Strip Vacation',
          destination: 'Las Vegas Strip',
          shareToken: 'las-vegas-strip-vacation',
          shareCollab: false,
          members: [{ username: 'admin', email: 'admin@timesyncher.local' }],
          webEditorInvites: [{ name: 'Kim', role: 'web_editor', status: 'sent' }],
        },
      ],
    },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_CUSTOMER_WIFE_DISPLAY_NAME: 'Kim',
    TIMESYNCHER_GROK_RESPONSE_RENDERER_FAKE: '1',
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(wifeTelegramCollaboratorStatusQuestion.status, 0, wifeTelegramCollaboratorStatusQuestion.stderr || wifeTelegramCollaboratorStatusQuestion.stdout);
const wifeTelegramCollaboratorStatusQuestionResult = JSON.parse(wifeTelegramCollaboratorStatusQuestion.stdout);
assert.doesNotMatch(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /Telegram collaborator|named member\/editor|view-only unless|available to anyone with the shared link/i);
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.turnDecision.facts?.website_editor_invite, 'sent');
assert.doesNotMatch(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /Yes\.|up to 3 people|Choose a Telegram add-on option below/i);
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.turnDecision.intent, 'account_question');
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.turnDecision.write_mode, 'none');
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.turnDecision.answerMode, 'account_state');
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.editApplied, false);
assert.equal(wifeTelegramCollaboratorStatusQuestionResult.result.createNewTrip, false);
assert.doesNotMatch(thisVacationAccessQuestionResult.customerResponse, /updating the TimeSyncher Vacation website|itinerary change/i);

const unknownTurn = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'Make this better',
    trip_transcript: [
      { speaker: 'customer', body: 'Create a new 4-night staycation on the Las Vegas Strip ending Monday morning' },
    ],
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(unknownTurn.status, 0, unknownTurn.stderr || unknownTurn.stdout);
const unknownTurnResult = JSON.parse(unknownTurn.stdout);
assert.match(unknownTurnResult.customerResponse, /direct vacation instruction/i);
assert.equal(unknownTurnResult.result.createNewTrip, false);
assert.equal(unknownTurnResult.result.editApplied, false);
assert.equal(unknownTurnResult.result.webItineraryUrl, null);
assert.equal(unknownTurnResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(unknownTurnResult.result.turnDecision.intent, 'ambiguous');
assert.equal(unknownTurnResult.result.turnDecision.write_mode, 'none');
assert.equal(unknownTurnResult.result.turnInspector.leakScan.ok, true);

const staleDavidsonCorrection = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    share_token: 'the-davidson-family-trip',
    request_text: 'I don’t see the dates on the trip. It was 4 nights which means 5 days. And the hotel was the Jockey Club.',
    payload: { trip: { title: 'the Davidson family trip', shareToken: 'the-davidson-family-trip' } },
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_WORKER_TOKEN: '',
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.notEqual(staleDavidsonCorrection.status, 0, 'stale Davidson context must fail closed for unrelated Vegas/Jockey Club edits');
assert.doesNotMatch(staleDavidsonCorrection.stderr, /first TimeSyncher Vacation pass is ready/i);

const broadEditTitle = `Capability Smoke Broad Edit ${Date.now()}`;
const compositeBroadEdit = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: `Please update the trip at ${e2e.result.webItineraryUrl}. Rename the trip to Capability Smoke Broad Edit Test, make the shared website include family access, and add something called ${broadEditTitle} to the itinerary.`,
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
    TIMESYNCHER_TREK_AGENT_EDIT_FAKE_RESULT: JSON.stringify({
      ok: true,
      summary: 'Test broad edit runner result.',
      operations: [{ action: 'add', target: broadEditTitle }],
      updatedItems: [{ title: broadEditTitle, action: 'added', category: 'event' }],
      accessChanges: [],
      verification: { changed: true },
    }),
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.notEqual(compositeBroadEdit.status, 0, 'composite broad edit must route past the narrow parser and fail if the fake broad runner makes no TREK data change');

const broadEdit = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: `Please update the trip at ${e2e.result.webItineraryUrl}. Add something called ${broadEditTitle} somewhere useful on the itinerary and change anything else needed so the website reflects it.`,
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE: '1',
    TIMESYNCHER_WORKER_TOKEN: '',
    TIMESYNCHER_FORCE_TREK_AGENT_EDIT: '1',
    TIMESYNCHER_TREK_AGENT_EDIT_FAKE_RESULT: JSON.stringify({
      ok: true,
      summary: 'Test broad edit runner result.',
      operations: [{ action: 'add', target: broadEditTitle }],
      updatedItems: [{ title: broadEditTitle, action: 'added', category: 'event' }],
      accessChanges: [],
      verification: { changed: true },
    }),
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.notEqual(broadEdit.status, 0, 'fake broad edit must still fail if no TREK data changed');

const badTripSubtitleEdit = spawnSync(process.execPath, ['./trek-agent-edit.mjs'], {
  input: JSON.stringify({
    share_token: e2e.result.trekSync.token,
    request_text: 'Update the trip.',
  }),
  encoding: 'utf8',
  env: {
    ...TEST_ENV,
    TIMESYNCHER_TREK_PUBLIC_BASE_URL: 'https://travel.timesyncher.com',
    TIMESYNCHER_TREK_AGENT_EDIT_FAKE_RESULT: JSON.stringify({
      ok: true,
      summary: 'Bad generated subtitle should be rejected.',
      operations: [{
        op: 'set_trip_fields',
        description: 'Trip updated from Craig Telegram staging requests by the worker.',
      }],
    }),
  },
  timeout: 120000,
  maxBuffer: 2 * 1024 * 1024,
});
assert.notEqual(badTripSubtitleEdit.status, 0, 'generated public trip subtitle/description must reject internal staging/provenance copy');
assert.match(badTripSubtitleEdit.stderr, /customer-facing copy validation|customer-approved TREK edit operations/i);

console.log(JSON.stringify({ ok: true, checked: 'product-capabilities' }));
