import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVacationAppReplyRules } from './vacation-app-reply-rules.mjs';
import { acceptQualityRewrite, applyAgreedAppSwim, applyCustomerNotes, correctFalsePriceMiss, customerAsksAccessChoice, customerAsksPrice, customerPullsAccess, destinationFromTexts, dockQuality, ensurePostIntakeBeats, FIXED_OPENER_REASON, formatQualityLine, hardQualityFlags, intakeFacts, inventedGardenHit, inventedVenueNames, isFullUpsell, isLongIntake, item34BanHit, jevReplacementChoices, jevStamp, LIVE_OPENER_PRODUCER, ONBOARDING_OPENER_CHAT_ONLY, postIntakeUpsellTurn, replyLeavesDestination, rewriteReplacesDraft, sessionHasFullUpsell, stripItem34Ban, stripUpsell, thingsFromIntake, upsellAudit, upsellModeForTurn } from '../src/vacation/live-app-turn.mjs';
import { qualityCommentCriteria, qualityFromDecisions } from './vacation-app-reply-rules.mjs';
import {
  assertLiveTranscript,
  assessPackShape,
  extractPdfText,
  formatLiveTimingLine,
  renderLiveTranscriptPdf,
} from './live-transcript-dialog-pdf.mjs';

const script = fileURLToPath(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url));
const source = fs.readFileSync(script, 'utf8');
assert.doesNotMatch(source, /dialog_vacation_test_turn\s*\(/);
assert.doesNotMatch(source, /callTieredModel|jevPrecall|chat\/completions|openrouter\.ai/);
assert.match(source, /OpenRouter self-call or dialog_vacation_test_turn pack/);
assert.match(source, /APP to \$\{name\}:/);
assert.match(source, /tiers used:/);
assert.match(source, /models used:/);
assert.doesNotMatch(source, /T\$\{turn\.turnIndex\} APP to/);
assert.doesNotMatch(source, /jev first:/);
assert.match(source, /QUALITY COMPARISON vs v6 gpt-5-mini|liveV7Pack/);
assert.match(source, /missing_app_open/);

assert.equal(destinationFromTexts(['We are going to the Big Island.']), 'Big Island, Hawaii');
assert.equal(replyLeavesDestination('Friday dinner in Tulum', 'Big Island, Hawaii'), true);
assert.equal(replyLeavesDestination('Friday dinner on the Big Island', 'Big Island, Hawaii'), false);
assert.equal(replyLeavesDestination('Cartagena breakfast', 'Big Island, Hawaii'), true);
assert.equal(customerPullsAccess('Walk me through Thursday with Kimberly.'), false);
assert.equal(customerPullsAccess('How much if they join as collaborators?'), true);
assert.equal(upsellModeForTurn('Friday dinner on the Big Island.', []), 'forbidden');
assert.equal(upsellModeForTurn('How much if Kimberly joins as a collaborator?', []), 'allow-once');
const dayWithCloser = 'Thursday is a town walk in Kailua-Kona. Welcome the whole family as collaborators with unlimited vacations for the whole year.';
assert.equal(stripUpsell(dayWithCloser), 'Thursday is a town walk in Kailua-Kona.');
assert.equal(isFullUpsell(dayWithCloser), true);
assert.equal(sessionHasFullUpsell([{ role: 'app', text: ONBOARDING_OPENER_CHAT_ONLY }]), false);
const splitWelcome = 'With all three of you joining as collaborators, the household plan is unlimited vacations for the whole year. Since you are splitting payments, Kimberly is covered by you and Tyler and Lauren have their own seats. Fallon still gets a quiet afternoon.';
assert.equal(item34BanHit(splitWelcome), true);
assert.equal(item34BanHit('Kimberly\'s seat is already covered. Tyler has his own seat.'), false);
assert.equal(item34BanHit('Collaborators: Kimberly Davidson (payer=owner)'), false);
const strippedSplit = stripItem34Ban(splitWelcome);
assert.equal(item34BanHit(strippedSplit), false);
assert.match(strippedSplit, /unlimited vacations for the whole year/);
assert.match(strippedSplit, /Fallon still gets a quiet afternoon/);
assert.equal(item34BanHit('We are not split-payer on this trip.'), true);
assert.equal(item34BanHit('That would be a split payment.'), true);
assert.equal(item34BanHit('Stop splitting payment talk.'), true);
assert.equal(item34BanHit('There is no extra cost for how you\u2019re splitting it up.'), true);
assert.equal(item34BanHit('without requiring you to split up'), true);
assert.equal(item34BanHit('You are not splitting anything.'), true);
assert.equal(customerAsksAccessChoice('Can Marcus Chen and Aunt Jean each choose view access or edit access?'), true);
const accessAsk = 'Can each collaborator choose view access or edit access?';
assert.equal(hardQualityFlags('Thursday is a garden or a town walk.', accessAsk, 'gardens').missingAccess, true);
assert.equal(hardQualityFlags('You can choose view access or edit access.', accessAsk, 'gardens').missingAccess, false);
assert.equal(dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('Thursday is a garden.', accessAsk, 'gardens'), accessAsk).wantsRewrite, true);
assert.equal(item34BanHit('without stacking costs or splitting anything up'), true);
assert.equal(item34BanHit('Do not split the payment across seats.'), true);
assert.equal(upsellModeForTurn('What is the price for collaborators?', [{ role: 'app', text: 'Welcome them as collaborators. The plan is unlimited vacations for the whole year.' }]), 'forbidden');
const longIntake = `${'okay voice note dumping. Big Island Hawaii, gardens, swim, groceries, dinner, family, April. '.repeat(8)}Kimberly wants gardens.`;
assert.equal(isLongIntake(longIntake), true);
assert.equal(isLongIntake('Walk me through Thursday with Kimberly.'), false);
assert.equal(postIntakeUpsellTurn(longIntake, []), true);
assert.equal(postIntakeUpsellTurn(longIntake, [{ role: 'customer', text: longIntake }]), true);
assert.equal(postIntakeUpsellTurn(longIntake, [
  { role: 'customer', text: longIntake },
  { role: 'app', text: 'I am building the itinerary from that dump.' },
  { role: 'customer', text: longIntake },
]), false);
assert.equal(upsellModeForTurn(longIntake, []), 'allow-once');
assert.equal(upsellModeForTurn('How much if they join as collaborators?', [
  { role: 'customer', text: longIntake },
  { role: 'app', text: 'I am building the itinerary from that dump. Welcome them as collaborators. The household plan is unlimited vacations for the whole year.' },
]), 'forbidden');
const intakeReply = ensurePostIntakeBeats('Sunday is a garden morning.');
assert.match(intakeReply, /building the itinerary/);
assert.match(intakeReply, /collaborat/);
assert.match(intakeReply, /unlimited vacations for the whole year/);
assert.equal(inventedGardenHit('Visit the Kahaluu garden if it rains.', 'Kimberly wants gardens.'), true);
assert.equal(inventedGardenHit('Sunday is a garden morning in Kailua-Kona.', 'Kimberly wants gardens.'), false);
const intakeThings = thingsFromIntake('Big Island Hawaii. Kimberly wants gardens. Groceries the same day. Friday is the dinner. Tyler wants a swim. A house in Kailua-Kona.');
assert.deepEqual(intakeThings.map((thing) => thing.title), ['Big Island', 'Gardens', 'Groceries', 'Dinner', 'Swim', 'Kailua-Kona house']);
assert.equal(intakeThings.some((thing) => /kahalu|arboretum/i.test(thing.title)), false);
const goldIntake = 'okay voice note dumping — sorry it is a ramble. Big Island Hawaiʻi, not Oahu. We leave Friday April third and come home Sunday April twelfth, twenty twenty-six. Base is a house in Kailua-Kona. SpeediShuttle from the airport, then groceries the same day. Kimberly wants gardens. Tyler wants a swim, including one later in the week if the beach is windy. Lauren does not want two big activities stacked on the same day.';
const goldFacts = intakeFacts(goldIntake);
assert.equal(goldFacts.span.badge, 'Big Island Apr 3–12 2026');
assert.equal(goldFacts.span.start, '2026-04-03');
assert.equal(goldFacts.span.end, '2026-04-12');
assert.match(goldFacts.rule, /two big activities/);
const goldThings = goldFacts.things;
assert.equal(goldThings.find((thing) => thing.title === 'Groceries').whenLabel, 'Fri Apr 3');
assert.equal(goldThings.find((thing) => thing.title === 'Gardens').who, 'Kimberly');
assert.equal(goldThings.find((thing) => thing.title === 'Swim').whenLabel, 'later in the week');
assert.equal(goldThings.find((thing) => thing.title === 'Swim').who, 'Tyler');
assert.match(goldThings.find((thing) => thing.title === 'Groceries').notes[0], /SpeediShuttle/);
assert.equal(goldThings.some((thing) => /kahalu|arboretum|botanical/i.test(JSON.stringify(thing))), false);
const noted = applyCustomerNotes(goldThings, 'This is Kimberly. Sunday April fifth garden morning in Kailua-Kona still works.', { collaborator: true, speakerName: 'Kimberly Davidson' });
assert.match(noted.find((thing) => thing.title === 'Gardens').collaboratorNotes[0], /Sunday April fifth/);
assert.equal(noted.find((thing) => thing.title === 'Gardens').customerWhen, 'Sun Apr 5');
assert.equal(noted.find((thing) => thing.title === 'Kailua-Kona house').collaboratorNotes.length, 0);
const locked = applyCustomerNotes(goldThings, 'Say that back in a human way, and keep us on the Big Island.', { collaborator: false });
assert.equal(locked.find((thing) => thing.title === 'Big Island').who, '');
assert.equal(locked.find((thing) => thing.title === 'Big Island').customerWhen, '');
assert.equal(acceptQualityRewrite('Draft stays.', 'Draft stays.').rewritten, false);
assert.equal(acceptQualityRewrite('Draft stays.', 'The rewrite the customer sees.').rewritten, true);
assert.equal(acceptQualityRewrite('Draft stays.', 'The rewrite the customer sees.').text, 'The rewrite the customer sees.');
assert.equal(rewriteReplacesDraft('The draft stays here.', 'The draft stays here. Extra paragraph about a cruise.'), false);
assert.equal(rewriteReplacesDraft('The draft stays here.', 'Monday is the beach or the house pool. The household plan is unlimited vacations for the whole year.'), true);
assert.equal(formatQualityLine({ judged: true, score: 4, comment: 'Clear day shape.', rewritten: true }), 'quality: 4 — Clear day shape. (rewritten by Jev)');
assert.equal(formatQualityLine({ judged: true, score: 1, comment: 'Misses the price.', rewritten: true, rewriteModel: 'typesafe/jev-1.13', model: 'typesafe/jev-1.13' }), 'quality: 1 — Misses the price. (rewritten by Jev)');
const priceDraft = 'This trip already holds space for all eight of you. You are covered for Kimberly. Tyler has his own. Lauren has hers.';
const priceChoices = jevReplacementChoices({ customerTurn: 'How much is it if Kimberly, Tyler, and Lauren join as collaborators? I pay for Kimberly. Tyler pays for himself. Lauren pays for herself.', draft: priceDraft, corpus: 'How much is it if Kimberly, Tyler, and Lauren join as collaborators? I pay for Kimberly. Tyler pays for himself. Lauren pays for herself.' });
assert.ok(priceChoices.length >= 1);
assert.match(priceChoices[0], /unlimited vacations for the whole year/);
assert.equal(priceChoices.every((choice) => rewriteReplacesDraft(priceDraft, choice)), true);
assert.equal(priceChoices.some((choice) => /\b(?:split|splitting)\b/i.test(choice)), false);
const swimDraft = 'If Monday April sixth rains, the swim still happens later. The beach plan stays, and the house pool is the backup.';
const swimAsk = 'If Monday April sixth rains, what is the backup for Tyler so the swim still happens later and the beach plan does not just vanish?';
const swimChoices = jevReplacementChoices({ customerTurn: swimAsk, draft: swimDraft, corpus: swimAsk });
assert.ok(swimChoices.length >= 1);
assert.match(swimChoices[0], /house pool/);
assert.equal(swimChoices.every((choice) => rewriteReplacesDraft(swimDraft, choice)), true);
assert.deepEqual(inventedVenueNames('A morning snorkel cruise and Hawaiʻi Volcanoes, then Puʻuhonua o Hōnaunau and Captain Cook.', 'Kimberly wants gardens. Tyler wants a swim.'), ['snorkel', 'cruise', 'Volcanoes', 'Puuhonua o Honaunau', 'Captain Cook']);
assert.deepEqual(inventedVenueNames('Monday swim is the beach or the house pool.', 'Tyler wants a swim on the beach or the house pool.'), []);
const priceAsk = 'How much is it if Kimberly, Tyler, and Lauren join as collaborators?';
assert.equal(customerAsksPrice(priceAsk), true);
assert.equal(correctFalsePriceMiss({ judged: true, score: 1, comment: 'Does not give the price for "How much is it?".', wantsRewrite: true }, 'The household plan is unlimited vacations for the whole year.', priceAsk).score, 4);
assert.equal(hardQualityFlags('Everyone is included without splitting anything up.', priceAsk, 'gardens and a swim').missingPrice, true);
assert.equal(dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('A snorkel cruise on Tuesday.', 'Offer two options.', 'gardens, swim, town walk'), 'Offer two options.').score <= 2, true);
assert.equal(dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('A snorkel cruise on Tuesday.', 'Offer two options.', 'gardens, swim, town walk'), 'Offer two options.').wantsRewrite, true);
const windyBeach = applyCustomerNotes(goldThings, 'Tyler wants a swim, including one later in the week if the beach is windy.');
assert.equal(windyBeach.find((thing) => thing.title === 'Swim').customerWhen, '');
const rainSwim = applyCustomerNotes(goldThings, 'If Monday April sixth rains, what is the backup for Tyler so the swim still happens later and the beach plan does not just vanish?');
assert.equal(rainSwim.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach');
const mondaySwim = applyCustomerNotes(rainSwim, 'This is Tyler. Monday April sixth swim is the beach unless it is windy, then the house pool. Save that on Monday.');
assert.equal(mondaySwim.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
const span = { start: '2026-04-03', end: '2026-04-12', year: 2026 };
const inventedTuesday = applyAgreedAppSwim(mondaySwim, 'I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day.', 'Tuesday, April 7th opens gently for that second swim.', span);
assert.equal(inventedTuesday.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
const appOnlyThursday = applyAgreedAppSwim(mondaySwim, 'I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day.', 'Your second swim is Thursday afternoon in Kailua-Kona.', span);
assert.equal(appOnlyThursday.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
const thursdaySwim = applyAgreedAppSwim(mondaySwim, 'I still want one later swim on Thursday at Kailua-Kona.', 'Your second swim is Thursday afternoon in Kailua-Kona.', span);
assert.equal(thursdaySwim.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool · Thu Apr 9');
const comments = qualityCommentCriteria('How much is it?', 'No price here.');
const otherComments = qualityCommentCriteria('Read Monday April sixth back.', 'Monday is the beach.');
assert.notEqual(comments.answers_this_ask, otherComments.answers_this_ask);
assert.match(comments.missing_price, /How much is it/);
assert.equal(formatQualityLine({ judged: false, score: 4, comment: 'no' }), '');
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 3 },
    comment: { choice: 'clear_day' },
    disposition: { choice: 'keep' },
  },
}).score, 4);
assert.equal(qualityFromDecisions({ answers: { comment: { choice: 'clear_day' } } }).judged, false);
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 2 },
    comment: { choice: 'garden_words' },
    disposition: { choice: 'rewrite' },
  },
}).wantsRewrite, true);
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 1 },
    comment: { choice: 'off_brief' },
    disposition: { choice: 'keep' },
  },
}).wantsRewrite, true);
assert.deepEqual(upsellAudit([
  { turnIndex: 1, role: 'customer', text: longIntake },
  { turnIndex: 2, role: 'app', text: intakeReply },
]).unsolicitedFull, []);
assert.deepEqual(upsellAudit([
  { turnIndex: 1, role: 'app', text: ONBOARDING_OPENER_CHAT_ONLY, replyProducer: LIVE_OPENER_PRODUCER },
  { turnIndex: 2, role: 'customer', text: 'How much if they join as collaborators?' },
  { turnIndex: 3, role: 'app', text: 'Welcome them onto this vacation as collaborators. The household plan is unlimited vacations for the whole year.' },
  { turnIndex: 4, role: 'customer', text: 'Read the week back on the Big Island.' },
  { turnIndex: 5, role: 'app', text: 'Monday starts in Kailua-Kona.' },
]).unsolicitedFull, []);

const rules = await loadVacationAppReplyRules({});
assert.equal(rules.ok, true);
assert.equal(rules.via, 'bundled-get_page');
assert.equal(rules.smoke_bar_phrase, 'shared-reply-smoke-phrase-beta');
assert.equal(rules.pipeline, 'jev_precall_then_tiered_model');

const skipped = jevStamp({ jevRan: false, error: 'classify_pending' });
assert.equal(skipped.jevRan, false);
assert.equal(skipped.reason, 'classify_pending');
assert.equal(skipped.modelTier, null);

function liveDoc(overrides = {}) {
  return {
    live: true,
    capture: 'live-vacation-app',
    sessionToken: 'session-token',
    targetPerson: 'Craig',
    turns: [
      {
        turnIndex: 1,
        role: 'customer',
        modality: 'text',
        text: 'Harbor morning plan for Craig',
        at: '2026-09-25T21:00:00.000Z',
        latencyMs: 12,
        sessionE2eMs: 12,
        jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions' },
      },
      {
        turnIndex: 2,
        role: 'app',
        modality: 'text',
        text: 'Start with the harbor walk, then keep the afternoon open.',
        at: '2026-09-25T21:00:03.000Z',
        latencyMs: 2800,
        sessionE2eMs: 3000,
        jev: { jevRan: true, modelTier: 2, routeType: 'general', extraContext: { routeType: 'general' }, via: 'openrouter-decisions', responseModel: 'qwen/qwen3-235b-a22b-2507', jevLatencyMs: 400, jevBeforeModel: true },
        replyProducer: 'vacation-app-reply-rules',
        invented: false,
        modelId: 'qwen/qwen3-235b-a22b-2507',
        beats: ['harbor morning plan'],
        jevLatencyMs: 400,
        genLatencyMs: 2400,
        jevBeforeModel: true,
        quality: { judged: true, score: 4, comment: 'Clear day shape.', rewritten: false },
        shippedModel: 'qwen/qwen3-235b-a22b-2507',
      },
    ],
    ...overrides,
  };
}

function rejects(doc, pattern) {
  assert.throws(() => assertLiveTranscript(doc), pattern);
}

rejects(null, /live transcript/);
rejects({ live: true, capture: 'sim', turns: [{ role: 'customer' }] }, /live-vacation-app/);
rejects(liveDoc({ turns: [liveDoc().turns[0]] }), /no app reply/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, text: '' } : turn)),
}), /text is empty/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, invented: true } : turn)),
}), /invented/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, text: 'Got it. I saved that for Vegas and queued the update.' } : turn)),
}), /canned|invented|dialog pack/);
rejects(liveDoc({ generator: 'dialog_vacation_test_turn' }), /dialog_vacation_test_turn/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, modelId: 'openai/gpt-4.1-mini', jev: { ...turn.jev, responseModel: 'openai/gpt-4.1-mini' } } : turn)),
}), /bake-off map/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, modelId: 'google/gemini-2.5-flash', jev: { ...turn.jev, responseModel: 'google/gemini-2.5-flash' } } : turn)),
}), /bake-off map/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, text: 'Since you are splitting payments, Kimberly is covered.' } : turn)),
}), /split-payment jargon/);
const jevRewrite = liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    quality: { judged: true, score: 4, comment: 'Clear day shape.', rewritten: true, model: 'typesafe/jev-1.13', rewriteModel: 'typesafe/jev-1.13', draft: 'Draft the customer did not see.' },
    shippedModel: 'typesafe/jev-1.13',
    draftModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteModel: 'typesafe/jev-1.13',
  } : turn)),
});
assertLiveTranscript(jevRewrite);
assert.match(extractPdfText(renderLiveTranscriptPdf(jevRewrite)), /rewritten by Jev/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    quality: { judged: true, score: 4, comment: 'Clear day shape.', rewritten: true, rewriteModel: 'qwen/qwen3-235b-a22b-2507' },
    shippedModel: 'qwen/qwen3-235b-a22b-2507',
    draftModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteModel: 'qwen/qwen3-235b-a22b-2507',
  } : turn)),
}), /typesafe\/jev-1\.13/);

const customerFirst = liveDoc();
const partial = assessPackShape(customerFirst);
assert.equal(partial.status, 'PARTIAL');
assert.equal(partial.missing_app_open, true);
assert.match(partial.missing_app_open_next, /Do not invent/);

const pdf = renderLiveTranscriptPdf(customerFirst);
const text = extractPdfText(pdf);
assert.match(text, /Dialog Pack — untitled v7 Tier 1–4|Dialog Pack . untitled v7 Tier/);
assert.match(text, /QUALITY COMPARISON vs v6 gpt-5-mini/);
assert.match(text, /Per-tier mean overall/);
assert.match(text, /TIMINGS vs v6 gpt-5-mini/);
assert.match(text, /Hard recipe/);
assert.match(text, /Roster/);
assert.match(text, /no_gpt5mini/);
assert.match(text, /qwen\/qwen3-235b-a22b-2507/);
assert.match(text, /deepseek\/deepseek-v3.2/);
assert.match(text, /qwen\/qwen3-max/);
assert.match(text, /google\/gemini-2.5-flash-lite/);
assert.doesNotMatch(text, /gpt-4\.1-mini/);
assert.match(text, /Full interleaved transcript/);
assert.match(text, /T2 APP/);
assert.match(text, /beat=harbor morning plan/);
assert.match(text, /T1 CRAIG/);
assert.match(text, /Harbor morning plan for Craig/);
assert.match(text, /T2 APP/);
assert.match(text, /Start with the harbor walk/);
assert.match(text, /timing: gen=2400ms model=qwen\/qwen3-235b-a22b-2507 tier=2 jev=400ms max_tokens=900/);
assert.match(text, /quality: 4 - Clear day shape/);
assert.doesNotMatch(text, /not judged/);
assert.match(text, /v7 Tier 1–4|v7 Tier 1.4/);
assert.match(text, /v7 overall/);
assert.match(text, /Owner: Craig \(Owner\)/);
const seated = liveDoc({
  customerName: 'Craig Davidson',
  party: {
    primary: { name: 'Craig Davidson', role: 'Owner' },
    collaborators: [
      { name: 'Kimberly Davidson', payer: 'owner' },
      { name: 'Tyler Davidson', payer: 'tyler' },
      { name: 'Lauren Davidson', payer: 'lauren' },
    ],
    preference_subjects: [
      { name: 'Torren', age: 8 },
      { name: 'Peyton', age: 6 },
      { name: 'Keegan', age: 4 },
      { name: 'Fallon', age: 2 },
    ],
    viewers: [{ name: 'Marcus Chen' }],
    editors: [{ name: 'Aunt Jean' }],
  },
  turns: [
    { ...liveDoc().turns[0], speakerName: 'Craig Davidson' },
    liveDoc().turns[1],
    { ...liveDoc().turns[0], turnIndex: 3, text: 'The garden morning in Kailua-Kona still works.', speakerName: 'Kimberly Davidson' },
    { ...liveDoc().turns[1], turnIndex: 4 },
  ],
});
const seatedText = extractPdfText(renderLiveTranscriptPdf(seated));
assert.match(seatedText, /Owner: Craig Davidson \(Owner\)/);
assert.match(seatedText, /Collaborators: Kimberly Davidson \(payer=owner\), Tyler Davidson \(payer=tyler\), Lauren Davidson \(payer=lauren\)/);
assert.match(seatedText, /Kids \(silent\): Torren 8, Peyton 6, Keegan 4, Fallon 2/);
assert.match(seatedText, /Viewer: Marcus Chen · Editor: Aunt Jean/);
assert.match(seatedText, /T3 KIMBERLY/);
const longBody = `Garden note start. ${'Kailua-Kona garden morning. '.repeat(80)}Garden note end.\f`;
const longDoc = liveDoc({
  turns: [
    { ...liveDoc().turns[0], text: 'Short customer line about the Big Island.' },
    { ...liveDoc().turns[1], text: longBody },
  ],
});
const longText = extractPdfText(renderLiveTranscriptPdf(longDoc));
assert.match(longText, /Garden note start/);
assert.match(longText, /Garden note end/);
assert.doesNotMatch(longText, /\f/);
assert.doesNotMatch(text, /tier 2 \| general \| 2800 ms/);
assert.doesNotMatch(text, /jev first:/);
assert.match(text, /Correction notes/);
assert.doesNotMatch(text, /role: customer/);
assert.doesNotMatch(text, /\bTURN \d/);
assert.doesNotMatch(text, /context: \{/);
assert.doesNotMatch(text, /TS-DIALOG-FINGERPRINT/);

const opener = liveDoc().turns[1];
const withOpen = liveDoc({
  turns: [
    { ...opener, turnIndex: 1, text: 'Welcome. Tell me where you are going.' },
    { ...liveDoc().turns[0], turnIndex: 2 },
    { ...opener, turnIndex: 3 },
  ],
});
const ready = assessPackShape(withOpen);
assert.equal(ready.status, 'DONE');
assert.equal(ready.missing_app_open, false);

const fixedOpen = liveDoc({
  turns: [
    {
      turnIndex: 1,
      role: 'app',
      modality: 'text',
      text: ONBOARDING_OPENER_CHAT_ONLY,
      at: '2026-09-25T21:00:00.000Z',
      latencyMs: 0,
      sessionE2eMs: 0,
      jev: { jevRan: false, reason: FIXED_OPENER_REASON, modelTier: null, routeType: null },
      replyProducer: LIVE_OPENER_PRODUCER,
      fixedOpener: true,
      invented: false,
    },
    { ...liveDoc().turns[0], turnIndex: 2 },
    { ...liveDoc().turns[1], turnIndex: 3 },
  ],
});
assert.equal(assessPackShape(fixedOpen).missing_app_open, false);
assert.equal(assessPackShape(fixedOpen).status, 'DONE');
const fixedText = extractPdfText(renderLiveTranscriptPdf(fixedOpen));
assert.match(fixedText, /T1 APP/);
assert.match(fixedText, /Tell me the trip basics/);
assert.match(fixedText, /collaborators/);
assert.doesNotMatch(fixedText, /timing: gen=0ms/);
rejects(liveDoc({
  turns: [
    liveDoc().turns[0],
    {
      ...fixedOpen.turns[0],
      turnIndex: 2,
    },
    liveDoc().turns[1],
  ],
}), /did not come from vacation-app-reply-rules|without a real Jev/);
const openText = extractPdfText(renderLiveTranscriptPdf(withOpen));
assert.match(openText, /T1 APP/);
assert.match(openText, /Welcome\. Tell me where you are going\./);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-pdf-'));
const transcriptPath = path.join(dir, 'transcript.json');
const outPath = path.join(dir, 'dialog.pdf');
fs.writeFileSync(transcriptPath, JSON.stringify(liveDoc()));
const missing = spawnSync(process.execPath, [script, '--out', outPath], { encoding: 'utf8' });
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /will not invent a transcript/);
const built = spawnSync(process.execPath, [script, '--transcript', transcriptPath, '--out', outPath], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
assert.match(extractPdfText(fs.readFileSync(outPath)), /T2 APP/);

const timingLine = formatLiveTimingLine({
  gen: 750,
  model: 'google/gemini-2.5-flash-lite',
  tier: 1,
  jevMs: 222,
  maxTokens: 900,
});
assert.equal(timingLine, 'timing: gen=750ms model=google/gemini-2.5-flash-lite tier=1 jev=222ms max_tokens=900');
assert.equal(timingLine.includes('zev'), false);
const poison = {
  title: 't',
  pack_id: 't',
  turns_line: 't',
  headline: 't',
  quality_rows: [['pack', 'v6', 'v7']],
  tier_rows: [['Tier', 'Model', 'Mean']],
  timing_rows: [['slice', 'model', 'n', 'p50', 'p95', 'mean', 'max']],
  speedup: 's',
  judge: 'j',
  footer_id: 't',
  turns: [{
    label: 'T37 APP',
    meta: 'n=37',
    app: true,
    text: 'Monday swim stays on the Big Island.',
    quality: 'quality: 4 — Clear day shape.',
    timing: 'timing: gen=750ms model=google/gemini-2.5-flash-lite tier=1 zev=222ms max_tokens=900',
  }],
};
const poisoned = spawnSync('python3', [fileURLToPath(new URL('./live_v7_dialog_pdf.py', import.meta.url))], {
  input: JSON.stringify(poison),
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(poisoned.status, 0, poisoned.stderr?.toString());
const poisonedPdf = Buffer.from(poisoned.stdout);
assert.equal(poisonedPdf.includes(Buffer.from('zev=')), false);
assert.equal(poisonedPdf.includes(Buffer.from('jev=222ms')), true);
const poisonedText = extractPdfText(poisonedPdf);
assert.match(poisonedText, /jev=222ms/);
assert.equal(poisonedText.includes('zev'), false);
const item34 = {
  ...poison,
  turns: [{
    ...poison.turns[0],
    text: 'Since you are splitting payments, Kimberly is covered by you.',
    timing: 'timing: gen=5154ms model=qwen/qwen3-max tier=4 jev=147ms max_tokens=900',
  }],
};
const bannedPack = spawnSync('python3', [fileURLToPath(new URL('./live_v7_dialog_pdf.py', import.meta.url))], {
  input: JSON.stringify(item34),
  maxBuffer: 8 * 1024 * 1024,
});
assert.notEqual(bannedPack.status, 0);
assert.match(bannedPack.stderr?.toString() || '', /split-payment jargon/);
const unjudged = {
  ...poison,
  turns: [{ ...poison.turns[0], quality: 'quality: not judged', timing: 'timing: gen=750ms model=google/gemini-2.5-flash-lite tier=1 jev=222ms max_tokens=900' }],
};
const unjudgedPack = spawnSync('python3', [fileURLToPath(new URL('./live_v7_dialog_pdf.py', import.meta.url))], {
  input: JSON.stringify(unjudged),
  maxBuffer: 8 * 1024 * 1024,
});
assert.notEqual(unjudgedPack.status, 0);
assert.match(unjudgedPack.stderr?.toString() || '', /not judged/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? { ...turn, quality: null } : turn)),
}), /not judged/);

console.log('live transcript dialog pdf passed');
