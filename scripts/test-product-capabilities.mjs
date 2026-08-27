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


const telegramBotSource = fs.readFileSync('./telegram-vacation-intake-bot.mjs', 'utf8');
const timestopperWorkerSource = fs.readFileSync('./timestopper-worker.mjs', 'utf8');
const hostedApiSource = fs.readFileSync('../api/vacation-telegram-turn.mjs', 'utf8');
const dispatchSource = fs.readFileSync('./product-gbrain-dispatch.mjs', 'utf8');
assert.equal(telegramBotSource.includes('I do not have enough account detail in this chat message'), false, 'Telegram bridge must not answer account questions before API session/account lookup');
assert.ok(hostedApiSource.includes('vacationSupportIntentWithModel'), 'Hosted API must own normal text support/account intent classification');
assert.ok(hostedApiSource.includes('recentConversationContext'), 'Hosted API must build canonical conversation context before classifying support/account turns');
assert.ok(hostedApiSource.includes('supportIntent?.intent'), 'Hosted API must use typed support intents for normal text turns');
assert.ok(dispatchSource.includes('currentTurnRouterDecisionModelFirst'), 'Dispatcher must retain model-first support/account routing for worker turns');
assert.equal(telegramBotSource.includes('not an instruction to create or update a vacation'), false, 'Telegram bridge customer copy must not explain internal no-write routing');
assert.equal(telegramBotSource.includes('not changing anything'), false, 'Telegram bridge customer copy must not use robotic no-write disclaimers');
assert.equal(telegramBotSource.includes('plus two other Telegram editors'), false, 'Telegram pricing copy must not mention retired three-seat collaborator plans');
assert.equal(telegramBotSource.includes('I need to check the vacation list before I change anything.'), false, 'Telegram bridge must not claim it will check linked vacations unless it actually loaded them');
assert.equal(telegramBotSource.includes('linked vacation list'), false, 'Telegram bridge customer copy must not expose linked-vacation/account implementation language');
assert.equal(timestopperWorkerSource.includes('I do not see a linked'), false, 'Dispatcher customer copy must not expose linked-vacation/account implementation language');
assert.ok(telegramBotSource.includes('findAccessibleVacationMatchesForQuestion'), 'Telegram bridge must consult accessible vacation sites for existence/state lookup questions');
assert.match(telegramBotSource, /function\s+vacationAccessAnswerFromMatches\s*\(/, 'Telegram bridge must define its no-write access answer helper');
assert.ok(
  telegramBotSource.includes('Can my wife Kim change') || telegramBotSource.includes('accessCapabilitiesRequested'),
  'Telegram bridge must cover combined website-change plus media-upload access questions without throwing',
);
assert.ok(dispatchSource.includes('I need a direct instruction before I work on a vacation.'), 'Hosted/dispatcher path must answer staging/new-vacation advice questions without bridge preflight');
assert.ok(dispatchSource.includes('tell me which vacation by name and the change you want made'), 'Hosted/dispatcher path must ask for vacation name/change, not customer-supplied links');
assert.equal(telegramBotSource.includes('send the vacation website link and the change'), false, 'Telegram bridge must not ask customers to send vacation website links for vague support turns');
assert.ok(telegramBotSource.includes('vacationDirectionClarificationCopy'), 'Telegram bridge must centralize start-new/update-existing clarification copy');
assert.equal(telegramBotSource.includes('bridge_preflight_annotation'), false, 'Telegram bridge must not annotate normal text turns with pre-hosted support decisions');
assert.equal(telegramBotSource.includes('support-router-queue-bypassed'), false, 'Telegram bridge must not bypass hosted queued work from preflight no-write decisions');
assert.equal(telegramBotSource.includes('bridge_preflight_no_write_overrides_hosted_queue'), false, 'Telegram bridge must not override hosted queueing with bridge preflight no-write decisions');
assert.ok(
  telegramBotSource.includes('let reply = hostedReply || ['),
  'Telegram bridge final reply selection must use hosted API answers before generic delivery fallback copy',
);
assert.equal(
  telegramBotSource.includes('preferBridgeNoWriteReply'),
  false,
  'Telegram bridge must not keep a final hosted-answer override selector',
);
assert.equal(
  telegramBotSource.includes('support-router-hosted-reply-overridden'),
  false,
  'Telegram bridge must not override non-empty hosted support/account replies',
);
assert.equal(
  telegramBotSource.includes("!isWebsiteLinkRequest(text) && ['account_state', 'pricing'].includes(payload.supportRouterDecision?.answerMode)"),
  false,
  'Account-state bridge replies must not override hosted replies merely because a lookup was attempted',
);
assert.ok(telegramBotSource.includes('!supportNoWrite && turn.queued'), 'No-write support decisions must not run queued acknowledgement/edit reply branches');
assert.ok(
  telegramBotSource.includes('!isPersonAccessQuestion(text) && isWebsiteLinkRequest(text)'),
  'Telegram bridge must not suppress add-wife/Kim collaborator link requests as ordinary website-link queued acks',
);
assert.ok(telegramBotSource.includes('websiteLinkQueuedAcknowledgement'), 'Telegram bridge must send a visible fallback for queued website-link requests');
assert.equal(telegramBotSource.includes("noteCacheStage(cacheDir, 'suppressed-link-request-ack'"), false, 'Telegram bridge must not silently return from website-link suppression');
assert.ok(
  telegramBotSource.includes('edit|modify|change|interact|add|invite|link|add'),
  'Telegram bridge person-access detection must include add/invite/link wording for add-wife collaborator requests',
);
assert.ok(
  telegramBotSource.includes('site|telegram|collaborator'),
  'Telegram bridge person-access detection must treat Telegram collaborator status questions as vacation access context',
);
assert.ok(telegramBotSource.includes('function grokBridgeCustomerRender'), 'Telegram bridge must use bounded Grok rendering for direct no-write account-state replies');
assert.ok(telegramBotSource.includes('bridgeCustomerCopyLooksSafe'), 'Telegram bridge must validate Grok-rendered direct replies before sending them');
assert.equal(telegramBotSource.includes('payload.supportRouterDecision'), false, 'Telegram bridge must not inject structured support decisions into the hosted turn API payload');
assert.ok(telegramBotSource.includes('write_mode'), 'Telegram bridge may read hosted typed decisions but must not create bridge preflight write_mode decisions');
assert.ok(telegramBotSource.includes('value === undefined || value === null'), 'Telegram send payload must omit null/undefined optional fields such as reply_markup');
assert.equal(telegramBotSource.includes('could not queue it yet: ${cleanText(error.message'), false, 'Telegram fallback copy must not echo raw delivery/queue errors to customers');
assert.ok(telegramBotSource.includes('hit a delivery issue while responding'), 'Telegram fallback copy must use customer-safe delivery failure copy');
const supportScreenshotReplySource = telegramBotSource.match(/function supportScreenshotReply\(\) \{[\s\S]+?\n\}/)?.[0] || '';
assert.ok(supportScreenshotReplySource, 'Telegram bridge must define support screenshot reply copy');
assert.ok(supportScreenshotReplySource.includes('vacationDirectionClarificationCopy()'), 'Support screenshot reply must use the canonical clarification copy');
assert.equal(supportScreenshotReplySource.includes('website link'), false, 'Support screenshot reply must not ask customers to send vacation website links');
assert.equal(timestopperWorkerSource.includes('send the vacation website link and the change'), false, 'Dispatcher must not ask customers to send vacation website links for vague support turns');
assert.ok(timestopperWorkerSource.includes('I hit a technical issue while updating the vacation.'), 'Worker fallback must use clean customer-safe failure copy');
assert.equal(timestopperWorkerSource.includes('vacation worker failed before it could finish: ${raw'), false, 'Worker fallback must not leak raw internal errors to customers');
const genericFailureCopy = timestopperWorkerSource.match(/return \[\n\s+'I hit a technical issue while updating the vacation\.'[\s\S]+?\]\.join\('\\n'\);/)?.[0] || '';
assert.ok(genericFailureCopy, 'Worker must have a fixed generic failure copy block');
for (const forbidden of ['sqlite', 'Traceback', '/home/', 'GBrain', 'worker failed before it could finish']) {
  assert.equal(genericFailureCopy.includes(forbidden), false, `generic customer failure copy must not include forbidden leak phrase: ${forbidden}`);
}
assert.ok(telegramBotSource.includes('(?:attach|add|save|put)'), 'Telegram media attachment parser must accept add/save/put wording, not only attach wording');
assert.ok(telegramBotSource.includes('(?:on\\s+)?\\bday'), 'Telegram media attachment parser must stop target parsing before on day 4 wording');
assert.ok(telegramBotSource.includes('mediaCaptionLooksLikeAttachmentCommand'), 'Telegram media attachment intake must recognize command-like captions before generic vacation saves');
assert.ok(telegramBotSource.includes('parseMediaAttachmentTargetWithModel'), 'Telegram media attachment intake must use a model-backed intent normalizer for non-literal customer phrasing');
assert.ok(telegramBotSource.includes('attach_media_to_itinerary_item'), 'Model-backed media intent must normalize captions to the known attach_media_to_itinerary_item command');
assert.ok(telegramBotSource.includes('mediaCaptionLooksLikeSupportScreenshot'), 'Telegram media intake must detect support/debug screenshot captions before generic vacation media saves');
assert.ok(telegramBotSource.includes('classifyPhotoSupportScreenshot'), 'Telegram media intake must classify image-only support/debug screenshots before generic vacation media saves');
assert.ok(telegramBotSource.includes('support_debug_screenshot'), 'Telegram image classifier must distinguish support/debug screenshots from vacation media');
assert.ok(telegramBotSource.includes('not a vacation photo'), 'Support/debug screenshots must not receive the generic saved-photo acknowledgement');
assert.equal(telegramBotSource.includes("|| 'the-davidson-family-trip'"), false, 'Telegram media attachment must not default to a hard-coded shared trip token');
assert.ok(telegramBotSource.includes('I could not identify which vacation should receive that media attachment yet.'), 'Telegram media attachment must fail closed without an explicit trip target');
assert.ok(timestopperWorkerSource.includes('TIMESYNCHER_WORKER_DRAIN_MAX_JOBS'), 'Worker drain must be bounded so one Telegram turn cannot flush stale pending jobs into chat');
assert.ok(telegramBotSource.includes('telegram_turn_scoped_worker_drain'), 'Telegram bridge must write a target job id before request-path drain');
assert.ok(timestopperWorkerSource.includes("query.set('jobId', targetJobId)"), 'Worker request-path drain must claim only the target job id when present');
assert.ok(timestopperWorkerSource.includes('spawn(process.execPath, [PRODUCT_GBRAIN_DISPATCH]'), 'Worker must invoke dispatcher through node so deploy chmod cannot cause EACCES');
assert.ok(timestopperWorkerSource.includes('findSupportNoWriteDecision'), 'Worker must silently no-op queued jobs that carry support no-write decisions');
assert.ok(timestopperWorkerSource.includes('support_router_no_write'), 'Worker no-write guard must preserve support router reason');
assert.ok(timestopperWorkerSource.includes('timestopper-worker-support-no-write-gate'), 'Worker no-write guard must expose deterministic tooling receipt');
assert.ok(dispatchSource.includes('function grokRouterDecision'), 'Product dispatcher must call the Grok intent router before deterministic fallback classification');
assert.ok(dispatchSource.includes('function currentTurnRouterDecisionModelFirst'), 'Product dispatcher must expose the model-first router entrypoint');
assert.ok(dispatchSource.includes('function grokCustomerRender'), 'Product dispatcher must let Grok render bounded customer answers from resolved fact packets');
assert.ok(dispatchSource.includes('customerCopyLooksSafe'), 'Product dispatcher must validate Grok-rendered customer copy before sending it');
assert.ok(dispatchSource.includes('deterministic_fallback_router'), 'Product dispatcher must label regex/word routing as fallback only');
assert.equal(telegramBotSource.includes('function vacationSupportRouterPreflightDecision'), false, 'Telegram bridge must not run a local intent router before hosted normal text turns');
assert.equal(telegramBotSource.includes('model_primary_bridge_preflight'), false, 'Telegram bridge must not record model-primary preflight decisions for normal text turns');
assert.ok(dispatchSource.includes('function makeTurnDecision'), 'Product dispatcher must use a typed turn decision object');
assert.ok(dispatchSource.includes('write_mode'), 'Typed decision object must include write_mode');
assert.ok(dispatchSource.includes('tripSelector'), 'Typed decision object must include tripSelector');
assert.ok(dispatchSource.includes('answerMode'), 'Typed decision object must include answerMode');
assert.ok(dispatchSource.includes('default_fail_closed_no_write'), 'Unknown turns must default to no-write clarification');
assert.ok(
  dispatchSource.includes('site|telegram|collaborator'),
  'Product dispatcher person-access detection must treat Telegram collaborator status questions as vacation access context',
);
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

const productVacationCheckout = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({
    id: randomUUID(),
    request_id: randomUUID(),
    request_text: 'i want to buy a vacation',
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
assert.equal(productVacationCheckout.status, 0, productVacationCheckout.stderr || productVacationCheckout.stdout);
const productVacationCheckoutResult = JSON.parse(productVacationCheckout.stdout);
assert.match(productVacationCheckoutResult.customerResponse, /buy TimeSyncher Vacation/i);
assert.match(productVacationCheckoutResult.customerResponse, /https:\/\/vacation-staging\.timesyncher\.com\//i);
assert.doesNotMatch(productVacationCheckoutResult.customerResponse, /order-test\.html/i);
assert.doesNotMatch(productVacationCheckoutResult.customerResponse, /advisory-only|actual action yourself|organize and compare itinerary options|bookings themselves/i);
assert.equal(productVacationCheckoutResult.result.createNewTrip, false);
assert.equal(productVacationCheckoutResult.result.editApplied, false);
assert.equal(productVacationCheckoutResult.result.webItineraryUrl, null);
assert.equal(productVacationCheckoutResult.result.researchSummary.status, 'support_router_no_write');
assert.equal(productVacationCheckoutResult.result.turnDecision.intent, 'support_question');
assert.equal(productVacationCheckoutResult.result.turnDecision.write_mode, 'none');
assert.equal(productVacationCheckoutResult.result.turnDecision.answerMode, 'checkout');
assert.equal(productVacationCheckoutResult.result.turnInspector.leakScan.ok, true);

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
assert.match(e2e.customerResponse, /Here is the website: https:\/\/travel\.timesyncher\.com\/shared\//);
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
assert.match(editResult.customerResponse, /Here is the website: https:\/\/travel\.timesyncher\.com\/shared\//);
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
assert.equal(vegasExistenceQuestionResult.result.normalizedTrip.destination, 'Las Vegas');
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
assert.match(linkedVegasAccessQuestionResult.customerResponse, /not listed as a named member\/editor/i);
assert.match(linkedVegasAccessQuestionResult.customerResponse, /https:\/\/travel\.timesyncher\.com\/shared\/las-vegas-strip-vacation\//);
assert.match(linkedVegasAccessQuestionResult.customerResponse, /Telegram editing is separate/i);
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
assert.match(thisVacationAccessQuestionResult.customerResponse, /Kim is not listed as a named member\/editor/i);
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
assert.match(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /^No, Kim is not a Telegram collaborator on Las Vegas Strip Vacation yet/i);
assert.match(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /website editor invite/i);
assert.match(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /Telegram collaboration is separate/i);
assert.doesNotMatch(wifeTelegramCollaboratorStatusQuestionResult.customerResponse, /could not verify|matching vacation|named member\/editor/i);
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
