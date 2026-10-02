import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVacationAppReplyRules } from './vacation-app-reply-rules.mjs';
import { acceptQualityRewrite, applyAgreedAppSwim, applyCustomerNotes, beatsMatchingReply, completeRosterParty, correctFalsePriceMiss, customerAsksAccessChoice, customerAsksPrice, customerPullsAccess, dockQuality, draftFactErrors, draftingFacts, FIXED_OPENER_REASON, formatQualityLine, heldRewriteLine, hardQualityFlags, holdingShipErrors, intakeSpan, interimCanShip, judgeInterimReply, inventedVenueNames, placeSourceRows, savedThingPlaceResults, unsourcedPlaces, isFullUpsell, item34BanHit, isTemplateInterim, interimProblems, liveTranscriptFromRows, liveTurnRecord, mustRewriteQuality, nearIdenticalRewrite, onboardingOpenerFacts, qualityFailureReason, rewriteCreditLabel, shipChoice, transcriptToJsonl, verifiedRewriteChange, jevStamp, LIVE_OPENER_PRODUCER, firstMarkedIntake, rewriteReplacesDraft, sessionHasFullUpsell, stripChatMarkdown, tripIsReturning, upsellAudit, upsellModeForTurn } from '../src/vacation/live-app-turn.mjs';
import { payerPriceLine, priceAnswered } from '../src/vacation/seat-price.mjs';
if (!String(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '').trim()) {
  process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS = '2700';
}
import { qualityFromDecisions, sourcedPlaceRule } from './vacation-app-reply-rules.mjs';
import {
  assertJevRewriteLabels,
  assertLiveTranscript,
  assessPackShape,
  dialogPackTitle,
  shippedRewriteLabel,
  extractPdfText,
  formatLiveTimingLine,
  jevRewriteLabelCounts,
  renderLiveTranscriptPdf,
  trueMedian,
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

const priceIntent = { asksPrice: true, asksAccess: true, pullsAccess: true };
assert.equal(customerPullsAccess('Walk me through Thursday with Kimberly.'), false);
assert.equal(customerPullsAccess('How much if they join as collaborators?'), false);
assert.equal(customerPullsAccess('How much if they join as collaborators?', priceIntent), true);
assert.equal(upsellModeForTurn('Friday dinner on the Big Island.', []), 'forbidden');
assert.equal(upsellModeForTurn('How much if Kimberly joins as a collaborator?', []), 'forbidden');
assert.equal(upsellModeForTurn('How much if Kimberly joins as a collaborator?', [], priceIntent), 'allow-once');
const dayWithCloser = 'Thursday is a town walk in Kailua-Kona. Welcome the whole family as collaborators with unlimited vacations for the whole year.';
assert.equal(isFullUpsell(dayWithCloser), true);
assert.equal(sessionHasFullUpsell([{ role: 'app', text: 'Where are you headed?' }]), false);
const splitWelcome = 'With all three of you joining as collaborators, the household plan is unlimited vacations for the whole year. Since you are splitting payments, Kimberly is covered by you and Tyler and Lauren have their own seats. Fallon still gets a quiet afternoon.';
assert.equal(item34BanHit(splitWelcome), true);
assert.equal(item34BanHit('Kimberly\'s seat is already covered. Tyler has his own seat.'), false);
assert.equal(item34BanHit('Collaborators: Kimberly Davidson (payer=owner)'), false);
assert.equal(item34BanHit(splitWelcome), true);
assert.equal(item34BanHit('We are not split-payer on this trip.'), true);
assert.equal(item34BanHit('That would be a split payment.'), true);
assert.equal(item34BanHit('Stop splitting payment talk.'), true);
assert.equal(item34BanHit('There is no extra cost for how you\u2019re splitting it up.'), true);
assert.equal(item34BanHit('without requiring you to split up'), true);
assert.equal(item34BanHit('You are not splitting anything.'), true);
assert.equal(customerAsksAccessChoice('Can Marcus Chen and Aunt Jean each choose view access or edit access?'), false);
assert.equal(customerAsksAccessChoice('Can Marcus Chen and Aunt Jean each choose view access or edit access?', priceIntent), true);
const accessAsk = 'Can each collaborator choose view access or edit access?';
assert.equal(hardQualityFlags('Thursday is a garden or a town walk.', accessAsk, 'gardens').missingAccess, false);
assert.equal(hardQualityFlags('Thursday is a garden or a town walk.', accessAsk, 'gardens', priceIntent).missingAccess, true);
assert.equal(hardQualityFlags('You can choose view access or edit access.', accessAsk, 'gardens', priceIntent).missingAccess, false);
assert.equal(dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('Thursday is a garden.', accessAsk, 'gardens', priceIntent), accessAsk).wantsRewrite, true);
assert.equal(item34BanHit('without stacking costs or splitting anything up'), true);
assert.equal(item34BanHit('Do not split the payment across seats.'), true);
assert.equal(upsellModeForTurn('What is the price for collaborators?', [{ role: 'app', text: 'Welcome them as collaborators. The plan is unlimited vacations for the whole year.' }]), 'forbidden');
const longIntake = `${'okay voice note dumping. Big Island Hawaii, gardens, swim, groceries, dinner, family, April. '.repeat(8)}Kimberly wants gardens.`;
const intakeTurn = { text: longIntake, intake: true };
assert.equal(firstMarkedIntake(longIntake, []), false);
assert.equal(firstMarkedIntake(intakeTurn, []), true);
assert.equal(firstMarkedIntake(intakeTurn, [{ role: 'customer', text: longIntake, intake: true }]), true);
assert.equal(firstMarkedIntake(intakeTurn, [
  { role: 'customer', text: longIntake, intake: true },
  { role: 'app', text: 'I am building the itinerary from that dump.' },
  { role: 'customer', text: longIntake, intake: true },
]), false);
assert.equal(upsellModeForTurn(intakeTurn, []), 'allow-once');
assert.equal(upsellModeForTurn('How much if they join as collaborators?', [
  { role: 'customer', text: longIntake },
  { role: 'app', text: 'I am building the itinerary from that dump. Welcome them as collaborators. The household plan is unlimited vacations for the whole year.' },
]), 'forbidden');
const intakeReply = 'I am building the itinerary from that dump. View access lets family and friends see the days. Edit access lets them add notes after you approve an email invite. They join from that email. Welcome them onto this vacation as collaborators. The household plan is unlimited vacations for the whole year.';
assert.match(intakeReply, /building the itinerary/);
assert.match(intakeReply, /view access/i);
assert.match(intakeReply, /edit access/i);
assert.match(intakeReply, /email invite/i);
assert.match(intakeReply, /unlimited vacations for the whole year/);
assert.match(intakeReply, /view access/i);
assert.doesNotMatch(intakeReply, /you've got unlimited/);
const sourcedMarket = [{ id: 'osm:way/11', name: 'Harbor Market' }];
assert.deepEqual(unsourcedPlaces('Harbor Market (id:osm:way/11) fits Tuesday.', sourcedMarket), []);
assert.deepEqual(unsourcedPlaces('Glass Lagoon (id:missing) fits Tuesday.', sourcedMarket), ['Glass Lagoon']);
assert.deepEqual(inventedVenueNames('Harbor Market fits Tuesday.', sourcedMarket), []);
assert.deepEqual(placeSourceRows([{ poiId: 'fsq:1', title: 'North Cafe' }]), [{ id: 'fsq:1', name: 'North Cafe' }]);
const sourcedThing = [{ title: 'Harbor Market', sourceRef: { source: 'osm', id: 'way/11' } }];
assert.deepEqual(placeSourceRows(sourcedThing), [{ id: 'way/11', name: 'Harbor Market' }]);
assert.deepEqual(unsourcedPlaces('Harbor Market (id:way/11) fits Tuesday.', sourcedThing), []);
assert.deepEqual(savedThingPlaceResults({ things: sourcedThing }), [{ name: 'Harbor Market', sourceRef: { source: 'osm', id: 'way/11' } }]);
assert.deepEqual(savedThingPlaceResults({ things: [{ title: 'Uncited Cafe' }] }), []);
assert.ok(/Results/.test(sourcedPlaceRule()) && !/THAT_ID/.test(sourcedPlaceRule()));
const goldIntake = 'okay voice note dumping — sorry it is a ramble. Big Island Hawaiʻi, not Oahu. We leave Friday April third and come home Sunday April twelfth, twenty twenty-six. Base is a house in Kailua-Kona. SpeediShuttle from the airport, then groceries the same day. Kimberly wants gardens. Tyler wants a swim, including one later in the week if the beach is windy. Lauren does not want two big activities stacked on the same day.';
const goldSpan = intakeSpan(goldIntake);
assert.equal(goldSpan.badge, 'Apr 3–12 2026');
assert.equal(goldSpan.destination, '');
assert.equal(goldSpan.start, '2026-04-03');
assert.equal(goldSpan.end, '2026-04-12');
const goldThings = [
  { title: 'Big Island', category: 'activity', description: 'Big Island Hawaiʻi, not Oahu.', who: '', whenLabel: 'Fri Apr 3–Sun Apr 12 2026', customerWhen: '', notes: ['Big Island Hawaiʻi, not Oahu.'], collaboratorNotes: [] },
  { title: 'Gardens', category: 'activity', description: 'Kimberly wants gardens.', who: 'Kimberly', whenLabel: '', customerWhen: '', notes: ['Kimberly wants gardens.'], collaboratorNotes: [] },
  { title: 'Groceries', category: 'activity', description: 'SpeediShuttle from the airport, then groceries the same day.', who: '', whenLabel: 'Fri Apr 3', customerWhen: '', notes: ['SpeediShuttle from the airport, then groceries the same day.'], collaboratorNotes: [] },
  { title: 'Swim', category: 'activity', description: 'Tyler wants a swim, including one later in the week if the beach is windy.', who: 'Tyler', whenLabel: 'later in the week', customerWhen: '', notes: ['Tyler wants a swim, including one later in the week if the beach is windy.'], collaboratorNotes: [] },
  { title: 'Kailua-Kona house', category: 'hotel', description: 'Base is a house in Kailua-Kona.', who: '', whenLabel: 'Fri Apr 3–Sun Apr 12 2026', customerWhen: '', notes: ['Base is a house in Kailua-Kona.'], collaboratorNotes: [] },
];
const stemOnly = applyCustomerNotes(goldThings, 'This is Kimberly. Sunday April fifth garden morning in Kailua-Kona still works.', { collaborator: true, speakerName: 'Kimberly Davidson' });
assert.equal(stemOnly.find((thing) => thing.title === 'Gardens').collaboratorNotes.length, 0);
const noted = applyCustomerNotes(goldThings, 'This is Kimberly. Sunday April fifth Gardens morning in Kailua-Kona still works.', { collaborator: true, speakerName: 'Kimberly Davidson' });
assert.match(noted.find((thing) => thing.title === 'Gardens').collaboratorNotes[0], /Sunday April fifth/);
assert.equal(noted.find((thing) => thing.title === 'Gardens').who, 'Kimberly');
assert.equal(noted.find((thing) => thing.title === 'Gardens').customerWhen, '');
assert.equal(noted.find((thing) => thing.title === 'Kailua-Kona house').collaboratorNotes.length, 0);
const locked = applyCustomerNotes(goldThings, 'Say that back in a human way, and keep us on the Big Island.', { collaborator: false });
assert.equal(locked.find((thing) => thing.title === 'Big Island').who, '');
assert.equal(locked.find((thing) => thing.title === 'Big Island').customerWhen, '');
assert.equal(acceptQualityRewrite('Draft stays.', 'Draft stays.').rewritten, false);
assert.equal(acceptQualityRewrite('Draft stays.', 'The rewrite the customer sees.').rewritten, true);
assert.equal(acceptQualityRewrite('Draft stays.', 'The rewrite the customer sees.').text, 'The rewrite the customer sees.');
assert.equal(rewriteReplacesDraft('The draft stays here.', 'The draft stays here. Extra paragraph about a cruise.'), false);
assert.equal(rewriteReplacesDraft('The draft stays here.', 'Monday is the beach or the house pool. The household plan is unlimited vacations for the whole year.'), true);
assert.equal(nearIdenticalRewrite('Thursday is a town walk.', 'The plan stays on the days and places you named. Thursday is a town walk.'), true);
assert.equal(nearIdenticalRewrite('Thursday is a town walk in Kailua-Kona.', 'The town walk stays on Thursday in Kailua-Kona, and the afternoon is not a second big activity.'), false);
const scoredOnly = qualityFromDecisions({
  answers: {
    overall_quality: { score: 3, text: 'Clear day shape that stays with the customer words.' },
    disposition: { choice: 'keep', note: 'Keep the reply. It answers "Thursday is a town walk."' },
    fix_focus: { choice: 'keep', rationale: 'The reply covers this turn: Thursday is a town walk.' },
  },
});
assert.equal(scoredOnly.jevNote, null);
assert.equal(scoredOnly.comment, null);
assert.equal(scoredOnly.score, 4);
assert.equal(mustRewriteQuality({ score: 3, jevFocus: 'keep', comment: 'Thursday town walk stays light.' }), false);
assert.equal(mustRewriteQuality({ score: 2, hardFlag: true }), true);
assert.equal(mustRewriteQuality({ score: 4, jevFocus: 'missing_price', comment: 'Name the price while answering "How much is it?".' }), false);
assert.equal(mustRewriteQuality({ score: 5, jevFocus: 'keep', comment: 'Thursday town walk stays light.' }), false);
assert.deepEqual(inventedVenueNames('The swim is the backup.', [{ id: 'osm:way/11', name: 'Harbor Market' }]), []);
const saturdayGroceries = applyCustomerNotes(goldThings, 'Saturday April fourth is groceries only.');
assert.equal(saturdayGroceries.find((thing) => thing.title === 'Groceries').customerWhen, '');
assert.equal(saturdayGroceries.find((thing) => thing.title === 'Groceries').whenLabel, 'Fri Apr 3');
const thursdayGarden = applyCustomerNotes(goldThings, 'Thursday April ninth is the second garden morning.');
assert.equal(thursdayGarden.find((thing) => thing.title === 'Gardens').customerWhen, '');
assert.equal(thursdayGarden.find((thing) => thing.title === 'Gardens').who, 'Kimberly');
const gardenAndWalk = applyCustomerNotes(thursdayGarden, 'Thursday April ninth is also the town walk.');
assert.equal(gardenAndWalk.find((thing) => thing.title === 'Gardens').customerWhen, '');
const judgedShip = { judged: true, template: false, canShip: true };
const judgedBlock = { judged: true, template: true, canShip: false };
assert.equal(isTemplateInterim('Got it. I saved that.', 'Thursday town walk'), true);
assert.equal(isTemplateInterim('The town walk on Thursday can stay light.', 'Thursday is a town walk.'), true);
assert.equal(isTemplateInterim('The town walk on Thursday can stay light.', 'Thursday is a town walk.', judgedShip), false);
assert.equal(isTemplateInterim('I am building the itinerary.', 'Build the itinerary and send an email invite.', judgedBlock), true);
assert.equal(isTemplateInterim('I am building the itinerary from that now. View access lets them see the days. Edit access lets them add notes after you approve an email invite.', 'Please build the itinerary and send an email invite.', judgedShip), false);
assert.deepEqual(interimProblems([
  { turnIndex: 2, role: 'app', quality: { rewritten: true }, interimReply: { text: 'The town walk on Thursday can stay light.', model: 'google/gemini-2.5-flash-lite', ms: 400, judge: judgedShip } },
  { turnIndex: 4, role: 'app', quality: { rewritten: true }, interimReply: { text: 'The town walk on Thursday can stay light.', model: 'google/gemini-2.5-flash-lite', ms: 500, judge: judgedShip } },
]), ['interim reply repeats across turns 2 and 4']);
assert.deepEqual(interimProblems([
  { turnIndex: 2, role: 'app', quality: { rewritten: false }, interimReply: { text: null, model: null, ms: null } },
]), []);
assert.match(interimProblems([
  { turnIndex: 2, role: 'app', quality: { rewritten: true }, interimReply: { text: null, model: null, ms: null } },
])[0], /missing an interim/);
assert.match(interimProblems([
  { turnIndex: 2, role: 'app', quality: { rewritten: false }, interimReply: { text: 'Thursday stays a town walk.', model: 'google/gemini-2.5-flash-lite', ms: 200 } },
])[0], /non-rewrite turn has an interim/);
assert.equal(dialogPackTitle('Big Island Family'), 'Dialog Pack \u2014 Big Island Family v7 Tier 1\u20134');
assert.equal(dialogPackTitle('Dialog Pack \u2014 Big Island Family v7 Tier 1\u20134'), 'Dialog Pack \u2014 Big Island Family v7 Tier 1\u20134');
assert.equal(draftFactErrors("Sunday's garden stays with Kimberly.", { owners: { gardens: 'Kimberly' }, gardenDays: ['apr 5'], span: { start: '2026-04-03', end: '2026-04-12' } }).some((error) => /Sunday/.test(error)), false);
assert.equal(draftFactErrors('The crew includes your four friends.', { ownerName: 'Craig Davidson' }).some((error) => /invented people/.test(error)), false);
assert.ok(draftFactErrors('The party of 9 is already set.', { travelers: ['Ada', 'Bea', 'Cam'] }).some((error) => /saved party size is 3/.test(error)));
assert.equal(draftFactErrors('The crew includes your unnamed friends.', { ownerName: 'Ada' }).some((error) => /invented people/.test(error)), false);
assert.doesNotMatch(source, /WHAT_I_CHANGED/);
const partyFacts = draftingFacts([], 'The party of eight needs a quiet day. Four friends are still unnamed.');
assert.doesNotMatch(partyFacts.roster, /party of (six|seven|eight|nine|ten)/i);
assert.match(partyFacts.roster, /List only people the customer named/);
assert.match(partyFacts.roster, /Ask the customer for anything they haven't said/);
assert.doesNotMatch(partyFacts.roster, /four friends/i);
assert.doesNotMatch(partyFacts.roster, /count in the party/i);
const fullParty = { travelers: ['Craig Davidson', 'Kimberly Davidson', 'Tyler Davidson', 'Lauren Davidson', 'Torren', 'Peyton', 'Keegan', 'Fallon'] };
assert.ok(draftFactErrors('Craig, Kimberly, Lauren, Torren, Peyton, Keegan, and Fallon are all set.', fullParty).some((error) => /Tyler is traveling/.test(error)));
assert.equal(draftFactErrors('Torren, Peyton, Keegan, and Fallon are with you.', fullParty).some((error) => /Tyler is traveling/.test(error)), false);
assert.equal(draftFactErrors('The already-saved backup swim is on Friday, April 10.', { swimDays: [], span: { start: '2026-04-03', end: '2026-04-12' } }).some((error) => /swim/.test(error)), false);
assert.equal(verifiedRewriteChange('I moved the later swim to Friday, April 10.', 'The later swim is on Friday, April 10.', 'The later swim is on Friday, April 10.'), 'I moved the later swim to Friday, April 10.');
assert.equal(shipChoice({
  draft: 'Welcome aboard Tyler for the Big Island week with the garden on Sunday.',
  draftScore: 3,
  rewrite: 'Welcome aboard Tyler. The Big Island week keeps the garden on Sunday and the swim on Monday.',
  rewriteScore: 4,
}).rewritten, true);
assert.equal(shipChoice({ draft: 'Draft one.', draftScore: 4, rewrite: 'A different Thursday town walk stays.', rewriteScore: 3 }).rewritten, false);
assert.equal(shipChoice({ draft: 'Draft one.', draftScore: 4, rewrite: 'A different Thursday town walk stays.', rewriteScore: 3 }).failReason, 'rewrite_scored_lower');
assert.equal(shipChoice({
  draft: 'The intake names a swim as saved for Friday.',
  draftScore: 1.9,
  rewrite: 'I am building the itinerary from that now and the travelers can join as collaborators.',
  rewriteScore: 1.77,
}).rewritten, true);
assert.equal(shipChoice({
  draft: 'The Friday swim was saved.',
  draftScore: 1.57,
  rewrite: 'The later swim is still open and is not saved.',
  rewriteScore: 1.2,
  draftFactErrors: ['a swim on apr 10 was claimed as saved'],
  holding: 'Craig, I have that later swim saved.',
  holdingFactErrors: ['addresses Craig while Tyler is speaking'],
}).rewritten, true);
const tied = shipChoice({
  draft: 'Tuesday is a swim.',
  rewrite: 'Tuesday stays a swim.',
  draftScore: 2,
  rewriteScore: 3,
  draftFactErrors: ['a swim on apr 7 was not set by the customer'],
  rewriteFactErrors: ['a swim on apr 7 was not set by the customer'],
});
assert.equal(tied.rewritten, false);
assert.equal(tied.holding, false);
assert.equal(tied.text, 'Tuesday is a swim.');
assert.equal(tied.failReason, 'rewrite_fact_check_held');
const heldClean = shipChoice({
  draft: 'Tuesday is a swim.',
  rewrite: 'Tuesday stays a swim.',
  draftScore: 2,
  rewriteScore: 3,
  draftFactErrors: ['a swim on apr 7 was not set by the customer'],
  rewriteFactErrors: ['a swim on apr 7 was not set by the customer'],
  holding: 'Tuesday can be a town walk.',
});
assert.equal(heldClean.text, 'Tuesday is a swim.');
assert.equal(heldClean.holding, false);
assert.equal(heldClean.held, true);
assert.equal(heldClean.rewritten, false);
assert.equal(heldRewriteLine({
  held: true,
  rewriteText: 'Tuesday stays a swim.',
  rewriteFailReason: 'rewrite_fact_check_held: a swim on apr 7 was not set by the customer',
  quality: { rewritten: false, judged: true, score: 4 },
}), 'rewrite drafted, held: rewrite_fact_check_held: a swim on apr 7 was not set by the customer');
assert.equal(heldRewriteLine({ held: false, rewriteText: 'Tuesday stays a swim.', quality: { rewritten: true } }), '');
assert.equal(formatQualityLine({ judged: true, score: 4, comment: 'Clear day shape.', rewritten: true }), 'quality: 4');
assert.equal(formatQualityLine({ judged: true, score: 2.76, comment: 'Thin day.', rewritten: false }), 'quality: 2.76');
assert.equal(formatQualityLine({ judged: true, score: 1, comment: 'Misses the price.', rewritten: true, rewriteModel: 'typesafe/jev-1.13', model: 'typesafe/jev-1.13' }), 'quality: 1');
const priceAskLine = 'How much is it if Kimberly, Tyler, and Lauren join as collaborators? I pay for Kimberly. Tyler pays for himself. Lauren pays for herself.';
const priceSeats = [
  { name: 'Kimberly', payer: 'you' },
  { name: 'Tyler', payer: 'Tyler' },
  { name: 'Lauren', payer: 'Lauren' },
];
const priceEnv = { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700' };
assert.equal(payerPriceLine(priceAskLine), '');
const priceLine = payerPriceLine(priceAskLine, priceEnv, priceSeats);
assert.match(priceLine, /Kimberly \$27, paid by you/);
assert.match(priceLine, /Tyler \$27, paid by Tyler/);
assert.match(priceLine, /Lauren \$27, paid by Lauren/);
assert.equal(priceAnswered("You'll cover Kimberly's $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren.", priceSeats, priceEnv), true);
assert.equal(priceAnswered("You'll cover Kimberly's $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren.", priceSeats), true);
assert.equal(/\b(?:split|splitting)\b/i.test(priceLine), false);
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 2, text: 'Who pays is missing for Kimberly' },
    disposition: { choice: 'rewrite' },
  },
}).jevNote, null);
assert.deepEqual(unsourcedPlaces('Harbor Market (id:osm:way/11) on Tuesday.', sourcedMarket), []);
assert.deepEqual(unsourcedPlaces('Glass Lagoon (id:missing) on Tuesday.', sourcedMarket), ['Glass Lagoon']);
assert.deepEqual(inventedVenueNames('Monday swim is the beach or the house pool.', []), []);
const priceAsk = 'How much is it if Kimberly, Tyler, and Lauren join as collaborators?';
assert.equal(customerAsksPrice(priceAsk), false);
assert.equal(customerAsksPrice(priceAsk, priceIntent), true);
assert.equal(correctFalsePriceMiss({ judged: true, score: 5, comment: 'The reply covers this turn: How much is it?', wantsRewrite: false }, 'Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren', 'How much is it if Kimberly, Tyler, and Lauren join? I pay for Kimberly. Tyler pays for himself. Lauren pays for herself.').score, 5);
assert.equal(correctFalsePriceMiss({ judged: true, score: 4, comment: 'Says no extra fees.', wantsRewrite: false }, 'There are no extra fees.', priceAsk, priceIntent).score <= 3, true);
assert.equal(correctFalsePriceMiss({ judged: true, score: 1, comment: 'The reply skips the dollar amount.', wantsRewrite: true }, 'The price is $27 for unlimited vacations for the whole year.', priceAsk).score <= 3, true);
assert.equal(hardQualityFlags('Everyone is included without splitting anything up.', priceAsk, 'gardens and a swim').missingPrice, false);
assert.equal(hardQualityFlags('Everyone is included without splitting anything up.', priceAsk, 'gardens and a swim', priceIntent).missingPrice, true);
const rulesSource = fs.readFileSync(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.match(rulesSource, /planFactsForReply/);
assert.match(rulesSource, /payer_line/);
assert.doesNotMatch(rulesSource, /State this payer line exactly/);
assert.match(rulesSource, /trip_context/);
assert.match(rulesSource, /Criterion 1 is weak/);
assert.match(rulesSource, /criterion 3 or lower/);
assert.doesNotMatch(rulesSource, /Choose rewrite when the score is adequate/);
assert.doesNotMatch(rulesSource, /including when it is only adequate/);
assert.doesNotMatch(rulesSource, /Swims stay on Monday April 6/);
assert.doesNotMatch(rulesSource, /Gardens stay on Sunday April 5/);
assert.doesNotMatch(rulesSource, /Four unnamed friends count/);
assert.doesNotMatch(rulesSource, /use only places, activities, and venues the customer already named|Do not invent a cruise/);
assert.doesNotMatch(sourcedPlaceRule(), /\b(Big Island|Kailua-Kona|Kimberly|Tyler|Lauren|Craig|Vegas|April|Waikiki)\b/);
const turnSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(turnSource, /count in the party/);
assert.doesNotMatch(turnSource, /function neutralizeFalseClaim|function dropAccuracySentences|function stripItem34Ban|function stripUpsell|function stripInventedVenues|function keepPriceStripWelcome/);
assert.doesNotMatch(turnSource, /People the customer has named/);
assert.match(turnSource, /rejudgeMs/);
assert.doesNotMatch(turnSource, /INVENTED_GARDEN|UNNAMED_VENUE|inventedGardenHit|kahalu|keauhou|pu['ʻ‘’]?uhonua|honaunau|thurston|captain cook|pua mau|botanical garden|lava tube|arboretum/i);
const placeCheck = turnSource.slice(turnSource.indexOf('export function placeSourceRows'), turnSource.indexOf('\nconst MONTHS'));
assert.doesNotMatch(placeCheck, /\b(Big Island|Kailua-Kona|Kimberly|Tyler|Lauren|Craig|Vegas|April|Waikiki)\b/);
const intakeSource = fs.readFileSync(new URL('../src/vacation/intake-shared-trip.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(intakeSource, /nonstop into KOA/);
assert.doesNotMatch(intakeSource, /layover: 'none'/);
assert.doesNotMatch(intakeSource, /takeoffTime: 'Fri Apr 3'/);
const draftFacts = draftingFacts([
  { role: 'customer', text: 'We are on the Big Island. Gardens on Sunday April 5 and Thursday April 9. Groceries the arrival day. A town walk Thursday April 9. Dinner Friday April 10.' },
], 'What about Thursday?', {
  things: [
    { title: 'Gardens', whenLabel: 'Sun Apr 5 · Thu Apr 9' },
    { title: 'Dinner', whenLabel: 'Fri Apr 10' },
  ],
  span: { spanLabel: 'Sun Apr 5' },
  party: {},
});
assert.doesNotMatch(draftFacts.roster, /Aunt Jean/);
assert.doesNotMatch(draftFacts.dates, /night 8/);
assert.equal(draftFacts.itinerary.some((line) => /garden/i.test(line) && /Thu Apr 9/.test(line)), true);
assert.equal(draftFacts.itinerary.some((line) => /Fri Apr 10/.test(line) && /swim/i.test(line)), false);
const earlyDraft = draftingFacts([], 'Big Island. Kimberly wants gardens. Tyler wants a swim later in the week. We leave Friday April 3 and come home Sunday April 12.');
assert.equal(earlyDraft.itinerary.some((line) => /Thu Apr 9|Fri Apr 10/.test(line)), false);
assert.match(qualityFailureReason({ score: 2, jevFocus: 'missing_price' }, { missingPrice: true, invented: [], split: false, missingAccess: false }), /missing dollar line/);
const loadedAttempts = liveTranscriptFromRows({
  session: { token: 'tok', display_name: 'Craig' },
  rows: [{
    body: 'Hello',
    payload: {
      liveTranscript: {
        turnIndex: 1,
        role: 'app',
        text: 'Hello',
        rewriteAttempts: [{ text: 'Hello there', model: 'qwen/qwen3-max', score: 4, ms: 10, error: null }],
        jevNote: null,
        jevNoteReason: 'jev_no_free_text',
      },
    },
  }],
});
assert.equal(loadedAttempts.turns[0].jevNote, null);
assert.equal(loadedAttempts.turns[0].jevNoteReason, 'jev_no_free_text');
assert.equal(loadedAttempts.turns[0].rewriteAttempts[0].model, 'qwen/qwen3-max');
const unsourcedDock = dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('Glass Lagoon (id:missing) on Tuesday.', 'Offer two options.', 'gardens, swim, town walk', sourcedMarket));
assert.equal(unsourcedDock.score <= 3, true);
assert.equal(unsourcedDock.wantsRewrite, true);
assert.equal(dockQuality({ judged: true, score: 5, comment: 'kept', wantsRewrite: false }, hardQualityFlags('Harbor Market (id:osm:way/11) on Tuesday.', 'Offer two options.', 'gardens, swim, town walk', sourcedMarket), 'Offer two options.').wantsRewrite, false);
const windyBeach = applyCustomerNotes(goldThings, 'Tyler wants a swim, including one later in the week if the beach is windy.');
assert.equal(windyBeach.find((thing) => thing.title === 'Swim').customerWhen, '');
assert.equal(windyBeach.find((thing) => thing.title === 'Swim').who, 'Tyler');
const rainSwim = applyCustomerNotes(goldThings, 'If Monday April sixth rains, what is the backup for Tyler so the swim still happens later and the beach plan does not just vanish?');
assert.equal(rainSwim.find((thing) => thing.title === 'Swim').customerWhen, '');
const mondaySwim = goldThings.map((thing) => (thing.title === 'Swim' ? { ...thing, customerWhen: 'Mon Apr 6 beach or house pool' } : thing));
assert.equal(mondaySwim.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
const span = { start: '2026-04-03', end: '2026-04-12', year: 2026 };
const inventedTuesday = applyAgreedAppSwim(mondaySwim, 'I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day.', 'Tuesday, April 7th opens gently for that second swim.', span);
assert.equal(inventedTuesday.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
assert.notEqual(inventedTuesday.find((thing) => thing.title === 'Swim').askWhichDay, true);
const appOnlyThursday = applyAgreedAppSwim(mondaySwim, 'I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day.', 'Your second swim is Thursday afternoon in Kailua-Kona.', span);
assert.equal(appOnlyThursday.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
assert.notEqual(appOnlyThursday.find((thing) => thing.title === 'Swim').askWhichDay, true);
const thursdaySwim = applyAgreedAppSwim(mondaySwim, 'I still want one later swim on Thursday at Kailua-Kona.', 'Your second swim is Thursday afternoon in Kailua-Kona.', span);
assert.equal(thursdaySwim.find((thing) => thing.title === 'Swim').customerWhen, 'Mon Apr 6 beach or house pool');
assert.notEqual(thursdaySwim.find((thing) => thing.title === 'Swim').askWhichDay, false);
assert.equal(qualityFromDecisions({
  answers: { overall_quality: { score: 2, text: 'The draft holds the named days and then Thursday stays open.' } },
}).comment, null);
assert.equal(tripIsReturning({ publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-abc/', shareToken: 'intake-abc', intakeShare: true }), false);
assert.equal(tripIsReturning({ publicUrl: 'https://travel.timesyncher.com/shared/vegas-anniversary/', shareToken: 'vegas-anniversary' }), true);
assert.deepEqual(onboardingOpenerFacts({ returning: false }), {
  first_message: true,
  customer_said: null,
  returning_trip: false,
  site_ready: false,
  trip_title: null,
});
assert.equal(onboardingOpenerFacts({ returning: true, tripTitle: 'Anniversary' }).returning_trip, true);
assert.equal(onboardingOpenerFacts({ returning: true, tripTitle: 'Anniversary' }).site_ready, true);
assert.equal(onboardingOpenerFacts({ returning: true, tripTitle: 'Anniversary' }).trip_title, 'Anniversary');
assert.equal(formatQualityLine({ judged: false, score: 4, comment: 'no' }), '');
const kept = qualityFromDecisions({
  answers: {
    overall_quality: { score: 3 },
    disposition: { choice: 'keep' },
  },
}, null, 'How much is it?', 'Kimberly $27, paid by you');
assert.equal(kept.score, 4);
assert.equal(kept.scoreRaw, 3);
assert.equal(kept.disposition, 'keep');
assert.equal(kept.judged, true);
assert.equal(kept.jevNote, null);
assert.equal(kept.jevNoteReason, 'jev_no_free_text');
assert.equal(qualityFromDecisions({ answers: { disposition: { choice: 'keep' } } }).judged, false);
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 1 },
    disposition: { choice: 'rewrite' },
  },
}).wantsRewrite, true);
assert.equal(qualityFromDecisions({
  answers: {
    overall_quality: { score: 3 },
    disposition: { choice: 'keep' },
  },
}).wantsRewrite, false);
assert.equal(mustRewriteQuality(qualityFromDecisions({
  answers: {
    overall_quality: { score: 3 },
    disposition: { choice: 'rewrite' },
  },
})), false);
const setFacts = {
  span: { destination: '', placeTitle: '', start: '2026-04-03', end: '2026-04-12', startLabel: 'Fri Apr 3', endLabel: 'Sun Apr 12 2026', spanLabel: 'Fri Apr 3–Sun Apr 12 2026', badge: 'Apr 3–12 2026', year: 2026 },
  swimDays: ['apr 6', 'apr 10'],
  gardenDays: ['apr 5', 'apr 9'],
  townWalkDays: ['apr 9'],
  owners: { gardens: 'Kimberly', swim: 'Tyler' },
  planOwned: false,
  activities: ['gardens', 'swim', 'town walk'],
  notTraveling: [],
  travelers: ['Kimberly', 'Tyler'],
  ownerName: '',
  rule: '',
  addressedTo: '',
  corpus: '',
};
assert.deepEqual(draftFactErrors('Monday April 6 is the beach swim. Sunday April 5 is Kimberly\'s garden. Thursday April 9 is the town walk.', setFacts), []);
assert.deepEqual(draftFactErrors('The swim stays Monday April 6. Kimberly\'s gardens are Thursday April 9.', setFacts), []);
const earlyFacts = {
  span: { destination: '', placeTitle: '', start: '2026-04-03', end: '2026-04-12', startLabel: 'Fri Apr 3', endLabel: 'Sun Apr 12 2026', spanLabel: 'Fri Apr 3–Sun Apr 12 2026', badge: 'Apr 3–12 2026', year: 2026 },
  swimDays: ['apr 6'],
  gardenDays: ['apr 5'],
  townWalkDays: [],
  owners: { gardens: 'Kimberly', swim: 'Tyler' },
  planOwned: false,
  activities: ['gardens', 'swim'],
  notTraveling: [],
  travelers: ['Kimberly', 'Tyler'],
  ownerName: '',
  rule: '',
  addressedTo: '',
  corpus: '',
};
assert.equal(draftFactErrors('I have the house from April 3rd to the 12th. Tyler\'s swim is on the list.', earlyFacts).some((error) => /swim on apr 3/.test(error)), false);
assert.equal(draftFactErrors('The trip runs from April 3 to 12, whether that is groceries or joining the town walk.', { ...setFacts, townWalkDays: [] }).some((error) => /town walk on apr 3/.test(error)), false);
assert.equal(draftFactErrors('Notes can land on Sun Apr 5 gardens, Mon Apr 6 beach swim, Fri Apr 10 dinner, or the town walk.', { ...setFacts, townWalkDays: [] }).some((error) => /town walk on apr 5/.test(error)), false);
assert.equal(priceAnswered('Your seat covers Kimberly at $27, paid by you. Tyler takes his own seat at $27, paid by him, and Lauren takes hers at $27, paid by her.', priceSeats, priceEnv), true);
assert.equal(priceAnswered('You will cover Kimberly’s $27, Tyler will pay his own $27, and Lauren will pay her own $27.', priceSeats, priceEnv), true);
assert.equal(priceAnswered('Your seat covers Kimberly at $27, paid by you. Tyler takes his own seat at $27, paid by him, and Lauren takes hers at $27, paid by her.', priceSeats), true);
assert.equal(priceAnswered('You will cover Kimberly’s $27, Tyler will pay his own $27, and Lauren will pay her own $27.', priceSeats), true);
assert.equal(draftFactErrors('For the swim later in the week, I will save that for Friday, April 10th.', earlyFacts).some((error) => /claimed as saved/.test(error)), false);
assert.equal(draftFactErrors('That later swim is saved on the second Friday of the trip.', earlyFacts).some((error) => /claimed as saved/.test(error)), false);
assert.equal(draftFactErrors('Since Tyler wanted a swim later in the week anyway, we have already saved that backup for the second Friday.', earlyFacts).some((error) => /claimed as saved/.test(error)), false);
assert.equal(draftFactErrors('The later swim is saved on the second Friday.', { ...earlyFacts, customerTurn: 'I still want one later swim in the week at Kailua-Kona.' }).some((error) => /claimed as saved/.test(error)), false);
assert.equal(draftFactErrors('The crew for this adventure includes Torren, Peyton, Keegan, and Fallon, along with your four unnamed friends.', { ownerName: 'Craig Davidson' }).some((error) => /is traveling/.test(error)), false);
assert.equal(draftFactErrors('Tuesday the 7th can hold a morning swim.', earlyFacts).some((line) => /swim on apr 7/.test(line)), false);
assert.equal(draftFactErrors('The swim isn\'t set for a specific day yet, so we won\'t lock it to Monday, April 6.', earlyFacts).some((line) => /swim on apr 6/.test(line)), false);
assert.equal(draftFactErrors('The garden on April 12 is not already set.', earlyFacts).some((line) => /garden on apr 12/.test(line)), false);
assert.ok(draftFactErrors('You\'re all set with the unlimited plan.', earlyFacts).some((line) => /unlimited plan is not owned/.test(line)));
assert.ok(draftFactErrors('Tuesday after checkout we use the house pool one last time.', earlyFacts).some((line) => /not the trip end/.test(line)));
assert.equal(draftFactErrors('Kimberly\'s second garden morning is already set for Thursday April 9.', earlyFacts).some((line) => /not already set/.test(line)), false);
assert.ok(draftFactErrors('You are all set for the unlimited vacations plan from April 3-10. Aunt Jean can edit, no extra charge. The swim can shift to Tuesday the 7th.', earlyFacts).length >= 3);
assert.equal(draftFactErrors('Let us slide that second swim later. How about Thursday, April 9th?', earlyFacts).some((line) => /swim on apr 9/.test(line)), false);
assert.equal(draftFactErrors('Thursday, April 9th can hold that second swim.', earlyFacts).some((line) => /swim on apr 9/.test(line)), false);
assert.equal(draftFactErrors('Friday, April 10th dinner is a solid midweek milestone.', earlyFacts).some((line) => /not midweek/.test(line)), false);
assert.equal(draftFactErrors('Friday, April 3rd is arrival. Maybe dip into the house pool.', earlyFacts).some((line) => /swim on apr 3/.test(line)), false);
assert.equal(draftFactErrors('Friday, April 3rd is arrival only. A pool dip can wait until later.', earlyFacts).some((line) => /swim on apr 3/.test(line)), false);
assert.equal(draftFactErrors('Just head out when everyone is ready.', earlyFacts).some((line) => /trip end/.test(line)), false);
assert.equal(draftFactErrors('Sunday April 5 is a garden morning. It is not a packed schedule.', earlyFacts).some((line) => /trip end/.test(line)), false);
assert.equal(draftFactErrors('A swim later in the week and dinner on Friday the 10th.', setFacts).some((line) => /swim on apr 10/.test(line)), false);
assert.equal(draftFactErrors('The garden visit stays in place, and the town walk can shift to Tuesday the 7th.', { ...setFacts, townWalkDays: ['apr 9'] }).some((line) => /garden on apr 7/.test(line)), false);
assert.equal(draftFactErrors('That leaves a town walk and a dinner for Friday the 10th.', { ...setFacts, townWalkDays: ['apr 9'] }).some((line) => /town walk on apr 10/.test(line)), false);
assert.equal(draftFactErrors('The later swim can sit between Monday and the Friday dinner on the 10th.', { ...setFacts, customerTurn: 'I still want one later swim in the week.', laterFriday: 'Friday April 10' }).some((line) => /later swim is saved/.test(line)), false);
assert.equal(draftFactErrors('So, Craig, you are set with the crew—Torren, Peyton, Keegan, and little Fallon.', { ...earlyFacts, ownerName: 'Craig' }).some((line) => /Craig is traveling/.test(line)), false);
assert.equal(verifiedRewriteChange('Removed the whole crew and included Craig.', 'the whole crew of eight', 'Craig and the whole crew of eight'), 'Removed the whole crew and included Craig.');
assert.equal(verifiedRewriteChange('Removed the implication that both options were already saved.', 'Tuesday is a town walk or a house-pool swim.', 'Tuesday is a town walk or a house-pool swim.'), 'Removed the implication that both options were already saved.');
const savedRemoval = 'Removed the claim that a swim was already saved on April 10th, as it was not yet on the saved itinerary.';
assert.equal(verifiedRewriteChange(savedRemoval, 'For Tyler\'s swim later in the week, I have that saved for the second Friday of the trip, April 10th.', 'Groceries are saved for your arrival on Friday, April 3rd. For Tyler\'s swim later in the week, I can slot that in.'), savedRemoval);
assert.equal(verifiedRewriteChange('Removed false claim that a swim was saved on April 10 and corrected it to April 6 as per the itinerary.', 'Since the swim is set for Monday, April 6th at the beach.', 'The swim is saved for Monday, April 6th at the beach, not April 10th, so we have corrected that.'), 'Removed false claim that a swim was saved on April 10 and corrected it to April 6 as per the itinerary.');
assert.equal(shippedRewriteLabel({ held: false, quality: { rewritten: true, rewriterChange: null }, rewriteText: 'Hello\nWHAT_I_CHANGED: Removed a swim on April 10.', rewriterChange: null, rewriteModel: 'deepseek/deepseek-v3.2' }), '');
const beatHolding = shipChoice({
  draft: 'Tuesday is a swim.',
  draftScore: 2.94,
  rewrite: 'Tuesday can be a town walk or a dinner.',
  rewriteScore: 2.72,
  draftFactErrors: ['a swim on apr 7 was not set by the customer'],
  holding: 'Tuesday is open.',
  holdingScore: 2.53,
});
assert.equal(beatHolding.rewritten, true);
assert.equal(draftFactErrors('If Monday, April 6th rains, the beach swim can shift to April 10th as a backup.', earlyFacts).some((line) => /apr 10/.test(line)), false);
assert.equal(draftFactErrors('Kimberly is interested in a second garden or a town walk on Thursday, April 9.', earlyFacts).some((line) => /apr 9/.test(line)), false);
assert.equal(draftFactErrors('The swim is saved for Monday, April 6th, not April 10th.', setFacts).some((line) => /apr 10/.test(line)), false);
assert.ok(draftFactErrors('The plan matches, so we\'ve corrected that.', earlyFacts).some((line) => /invented a correction/.test(line)));
assert.equal(draftFactErrors('Your two garden mornings and your later swim are set.', { ...setFacts, addressedTo: 'Lauren', owners: { gardens: 'Kimberly', swim: 'Tyler' } }).length, 0);
assert.equal(draftFactErrors('We added a second swim on Fri Apr 10 at Kailua-Kona, right after the town walk and before dinner.', { ...setFacts, customerTurn: 'I still want one later swim in the week.', laterFriday: 'Friday April 10', townWalkDays: ['apr 9'] }).some((line) => /town walk on apr 10/.test(line)), false);
assert.equal(draftFactErrors('Lauren\'s rule about no two big activities stacked is locked in.', { ...setFacts, rule: 'Lauren does not want two big activities stacked on the same day.' }).some((line) => /stacked on the same day/.test(line)), false);
assert.deepEqual(beatsMatchingReply(['Set arrival and swim days.'], 'Groceries are saved for your arrival. For Tyler\'s swim later in the week, I can slot that in.'), ['Set arrival and swim days.']);
assert.equal(interimCanShip('It sounds like a wonderful trip is coming together. I can help you plan that out.', 'This is Lauren. Tuesday April seventh should be one big thing. I will pick after you offer two options.', setFacts), false);
assert.equal(interimCanShip('Tuesday can stay a town walk.', 'Tuesday is a town walk.', setFacts, judgedBlock), false);
const longDump = `${'Big Island Hawaii garden swim groceries april family coming '.repeat(12)} Tyler wants a swim later in the week.`;
assert.equal(interimCanShip('I am building the itinerary from that now. Family and friends can join as collaborators. View access lets them see the days. Edit access lets them add notes after you approve an email invite. It sounds like a wonderful trip.', { text: longDump, intake: true }, {}, judgedShip), true);
assert.equal(interimCanShip('I am building the itinerary from that now. Family and friends can join as collaborators. View access lets them see the days. Edit access lets them add notes after you approve an email invite. It sounds like a wonderful trip.', { text: longDump, intake: true }, {}), false);
assert.equal(JSON.parse(transcriptToJsonl({ sessionToken: 'secret-token', live: true, turns: [] }).split('\n')[0]).sessionToken, null);
assert.doesNotMatch(transcriptToJsonl({ sessionToken: 'secret-token', live: true, turns: [] }), /secret-token/);
assert.equal(verifiedRewriteChange('Added Tyler and Lauren to the list of traveling companions.', 'Welcome aboard.', 'Welcome aboard. The town walk is also on the list.'), 'Added Tyler and Lauren to the list of traveling companions.');
const absentParty = { notTraveling: [{ name: 'Marcus Chen', role: 'viewer' }, { name: 'Aunt Jean', role: 'editor' }] };
assert.equal(draftFactErrors('For Marcus Chen and Aunt Jean, since they are not traveling with your crew, they can each have view access.', absentParty).some((line) => /not on the trip/.test(line)), false);
assert.equal(draftFactErrors("Tyler's late swim, now set for the second Friday of the trip.", earlyFacts).some((line) => /claimed as saved/.test(line)), false);
assert.equal(draftFactErrors('The town walk is also on the list.', { ...earlyFacts, townWalkDays: [] }).some((line) => /town walk was noted/.test(line)), false);
assert.equal(draftFactErrors('If Monday, April 6th rains, Tyler’s swim can shift later. We’ll keep Kimberly’s garden morning on Sunday, April 5th, and not stack the rescheduled swim.', earlyFacts).some((line) => /swim on apr 5/.test(line)), false);
assert.equal(holdingShipErrors('Craig, I have that later swim saved on the second Friday.', { ...earlyFacts, addressedTo: 'Tyler', strictSaved: true }).some((line) => /while Tyler is speaking|claimed as saved/.test(line)), true);
assert.equal(draftFactErrors('Tuesday, April 7 is the anchor day. One option is a classic swim day at the house pool.', earlyFacts).some((line) => /swim on apr 7/.test(line)), false);
assert.equal(draftFactErrors('Tuesday, April 7, is wide open. Here are two options: a town walk, or a swim at the beach.', earlyFacts).some((line) => /swim on apr 7/.test(line)), false);
const dateSpan = { start: new Date('2026-04-03T00:00:00.000Z'), end: new Date('2026-04-12T00:00:00.000Z') };
const datedLater = applyAgreedAppSwim(mondaySwim, 'I still want one later swim in the week at Kailua-Kona. Do not stack it on Lauren’s big day.', 'A swim later in the week stays at Kailua-Kona.', dateSpan);
assert.notEqual(datedLater.find((thing) => thing.title === 'Swim').askWhichDay, true);
assert.doesNotMatch(datedLater.find((thing) => thing.title === 'Swim').customerWhen, /Fri Apr 10/);
const keptGarden = applyCustomerNotes(goldThings, 'If we add a second garden, keep it on Thursday April ninth and leave Wednesday afternoon empty.');
assert.equal(keptGarden.find((thing) => thing.title === 'Gardens').customerWhen, '');
assert.equal(draftFactErrors('Welcome aboard, Tyler. Your two garden days are locked in.', {
  span: null, swimDays: [], gardenDays: [], townWalkDays: [], owners: { gardens: 'Kimberly' }, planOwned: false, activities: ['gardens'], notTraveling: [], travelers: ['Kimberly'], ownerName: '', rule: '', addressedTo: 'Tyler', corpus: '',
}).some((line) => /Kimberly/.test(line)), false);
assert.equal(draftFactErrors('A beachside picnic on Tuesday.', earlyFacts).some((line) => /picnic/.test(line)), false);
assert.ok(draftFactErrors('Wednesday April 8th is open, or simply pack with no rush.', earlyFacts).some((line) => /not the trip end/.test(line)));
assert.ok(draftFactErrors('We will keep the dinner for your last evening as a group.', earlyFacts).some((line) => /not the trip end/.test(line)));
assert.ok(draftFactErrors('Welcome aboard. The house runs from April 3rd to the 9th.', earlyFacts).some((line) => /not day 9/.test(line)));
assert.ok(draftFactErrors('You are all set from Fri Apr 3 to Fri Apr 10.', earlyFacts).some((line) => /not day 10/.test(line)));
assert.ok(draftFactErrors('The stay is April 3rd to the 6th.', earlyFacts).some((line) => /not day 6/.test(line)));
const unnamedKids = completeRosterParty({
  customerName: 'Craig',
  roster: [{ name: 'Kimberly', role: 'collaborator' }],
  turns: [{ role: 'customer', text: 'Kimberly wants gardens. Kids are Torren, Peyton, Keegan, and Fallon. Marcus Chen can look. Aunt Jean can edit notes.' }],
});
assert.equal(unnamedKids.preference_subjects.length, 0);
assert.deepEqual(unnamedKids.viewers, []);
assert.deepEqual(unnamedKids.editors, []);
assert.deepEqual(unnamedKids.collaborators, []);
assert.equal(unnamedKids.sources.some((item) => String(item.field || '').startsWith('collaborators.')), false);
const wantsNotRoster = completeRosterParty({
  customerName: 'Craig',
  turns: [{ role: 'customer', text: 'Kimberly wants gardens.' }],
});
assert.deepEqual(wantsNotRoster.collaborators, []);
const rosterFailed = completeRosterParty({
  customerName: 'Craig',
  roster: [],
  rosterError: 'trip intake extraction failed',
  turns: [{ role: 'customer', text: 'Kimberly wants gardens.' }],
});
assert.deepEqual(rosterFailed.collaborators, []);
assert.equal(rosterFailed.askRoster, true);
assert.match(rosterFailed.rosterError, /failed/);
const parsedParty = completeRosterParty({
  customerName: 'Craig Davidson',
  roster: [
    { name: 'Kimberly', role: 'collaborator', payer: 'owner' },
    { name: 'Tyler', role: 'collaborator', payer: 'tyler' },
  ],
  turns: [{ role: 'customer', text: 'Kids are Torren who is eight, Peyton who is six, Keegan who is four, and Fallon who is two. Marcus Chen can look, and Aunt Jean can edit notes.' }],
});
assert.deepEqual(parsedParty.preference_subjects, []);
assert.deepEqual(parsedParty.collaborators, []);
assert.deepEqual(parsedParty.viewers, []);
assert.deepEqual(parsedParty.editors, []);
assert.equal(parsedParty.sources.some((item) => String(item.source).startsWith('customer:')), false);
assert.equal(liveTranscriptFromRows({
  session: { token: 'tok', display_name: 'Craig' },
  rows: [{ body: 'Hello', payload: { liveTranscript: { turnIndex: 1, role: 'app', text: 'Hello', rewriteJevScoreRaw: 0 } } }],
}).turns[0].rewriteJevScoreRaw, null);
assert.equal(stripChatMarkdown('Marcus will have **view access** and *edit access*.'), 'Marcus will have view access and edit access.');
const modelReply = 'Thursday stays a town walk.\nquality: 4';
const audited = liveTurnRecord({
  turnIndex: 2,
  role: 'app',
  modality: 'text',
  text: modelReply,
  at: '2026-09-25T21:00:03.000Z',
  latencyMs: 10,
  sessionE2eMs: 10,
  jev: { jevRan: true, modelTier: 2 },
  model: {
    responseModel: 'qwen/qwen3-235b-a22b-2507',
    quality: { judged: true, score: 4, rewritten: false },
    log: {
      held: true,
      rewriteText: 'Tuesday stays a swim.',
      rewriteFailReason: 'rewrite_near_draft',
      rewriteModel: 'qwen/qwen3-235b-a22b-2507',
      rewriterChange: 'Kept the walk.',
    },
  },
});
assert.equal(audited.text, modelReply);
assert.equal(audited.qualityLine, 'quality: 4');
assert.equal(audited.heldRewriteLine, 'rewrite drafted, held: rewrite_near_draft');
assert.equal(audited.rewriteCredit, 'Rewriter (qwen/qwen3-235b-a22b-2507): Kept the walk.');
assert.equal(formatQualityLine({ judged: true, score: 4, rewritten: false }), 'quality: 4');
assert.equal(rewriteCreditLabel('qwen/qwen3-235b-a22b-2507', 'Kept the walk.'), 'Rewriter (qwen/qwen3-235b-a22b-2507): Kept the walk.');
assert.doesNotMatch(fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8'), /INTERIM_STOCK|INTAKE_OPENER_ONLY/);
const mockedJudge = await judgeInterimReply({
  text: 'Thursday stays a town walk.',
  customerTurn: 'Thursday is a town walk.',
  judge: async () => ({ judged: true, template: false, canShip: true }),
});
assert.equal(mockedJudge.canShip, true);
assert.equal(isTemplateInterim('Thursday stays a town walk.', 'Thursday is a town walk.', mockedJudge), false);
await assert.rejects(
  () => judgeInterimReply({ text: 'Thursday stays a town walk.', customerTurn: 'Thursday is a town walk.', env: {} }),
  /INTERIM_JUDGE_CREDENTIALS_MISSING/,
);
const fetchedJudge = await judgeInterimReply({
  text: 'Thursday stays a town walk.',
  customerTurn: 'Thursday is a town walk.',
  env: { OPENROUTER_API_KEY: 'test-key' },
  fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"template":false,"canShip":true}' } }] }) }),
});
assert.equal(fetchedJudge.template, false);
assert.equal(fetchedJudge.canShip, true);
await assert.rejects(
  () => judgeInterimReply({
    text: 'Thursday stays a town walk.',
    customerTurn: 'Thursday is a town walk.',
    env: { OPENROUTER_API_KEY: 'test-key' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'sure' } }] }) }),
  }),
  /INTERIM_JUDGE_UNUSABLE/,
);
assert.doesNotMatch(rulesSource, /criterion 4 or 5/);
assert.doesNotMatch(rulesSource, /adequate or strong draft is keep/);
assert.equal(trueMedian([10, 30]), 20);
assert.equal(trueMedian([10, 20, 40]), 20);
assert.deepEqual(upsellAudit([
  { turnIndex: 1, role: 'customer', text: longIntake, intake: true },
  { turnIndex: 2, role: 'app', text: intakeReply },
]).unsolicitedFull, []);
assert.deepEqual(upsellAudit([
  { turnIndex: 1, role: 'app', text: 'Where are you headed?', replyProducer: LIVE_OPENER_PRODUCER },
  { turnIndex: 2, role: 'customer', text: 'How much if they join as collaborators?', intent: priceIntent },
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
    deployBanner: 'live 0123456789abcdef0123456789abcdef01234567 https://vacation-staging.timesyncher.com',
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
        quality: { judged: true, score: 4, comment: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.', rewritten: false, model: 'typesafe/jev-1.13', judgeMs: 400 },
        shippedModel: 'qwen/qwen3-235b-a22b-2507',
        draftModel: 'qwen/qwen3-235b-a22b-2507',
        jevScoreDraft: 4,
        jevNote: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.',
        flagged: false,
        modelLatency: { draft: 2400, rewrite: null, total: 2400 },
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
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    jevNote: 'Keep the reply. It answers "Harbor morning plan for Craig".',
    quality: { ...turn.quality, comment: 'Keep the reply. It answers "Harbor morning plan for Craig".' },
  } : turn)),
}), /template/);
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
    text: 'The harbor walk still opens the morning, and the afternoon stays open for Craig.',
    quality: { judged: true, score: 4, comment: 'Harbor morning is answered cleanly, a 4 carried by afternoon open.', rewritten: true, model: 'typesafe/jev-1.13', judgeMs: 400, rewriteModel: 'qwen/qwen3-235b-a22b-2507', draft: 'Start with the harbor walk, then keep the afternoon open.' },
    shippedModel: 'qwen/qwen3-235b-a22b-2507',
    draftModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteText: 'The harbor walk still opens the morning, and the afternoon stays open for Craig.',
    rewriteAttempts: [{ text: 'The harbor walk still opens the morning, and the afternoon stays open for Craig.', model: 'qwen/qwen3-235b-a22b-2507', score: 5, ms: 1200, error: null }],
    jevScoreRewrite: 5,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    rewriterChange: 'Kept the harbor morning and named only the walk.',
    interimReply: { text: 'The harbor morning can stay loose while I shape the walk.', model: 'google/gemini-2.5-flash-lite', ms: 900, judge: { judged: true, template: false, canShip: true } },
    flagged: false,
  } : turn)),
});
assertLiveTranscript(jevRewrite);
const jevRewritePdf = extractPdfText(renderLiveTranscriptPdf(jevRewrite));
assert.equal(jevRewriteLabelCounts(jevRewrite, jevRewritePdf).rewrittenTurns, 1);
assert.equal(jevRewriteLabelCounts(jevRewrite, jevRewritePdf).rewriteLabels, 1);
assert.match(jevRewritePdf, /Rewriter \(qwen\/qwen3-235b-a22b-2507\): Kept the harbor morning and named only the walk/);
const storedAudit = liveDoc({
  turns: jevRewrite.turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    qualityLine: 'quality: 3.5',
    heldRewriteLine: '',
    rewriteCredit: 'Rewriter (qwen/qwen3-235b-a22b-2507): Stored audit credit.',
  } : turn)),
});
const storedAuditPdf = extractPdfText(renderLiveTranscriptPdf(storedAudit));
assert.match(storedAuditPdf, /quality: 3\.5/);
assert.match(storedAuditPdf, /Rewriter \(qwen\/qwen3-235b-a22b-2507\): Stored audit credit/);
assert.doesNotMatch(storedAuditPdf, /Kept the harbor morning and named only the walk/);
assert.match(storedAuditPdf, /The harbor walk still opens the morning, and the afternoon stays open for Craig/);
const heldDraft = liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    text: 'The harbor walk still opens the morning, and the afternoon stays open for Craig.',
    held: true,
    quality: { judged: true, score: 4.03, rewritten: false, model: 'typesafe/jev-1.13', judgeMs: 400, draft: 'Start with the harbor walk, then keep the afternoon open.' },
    shippedModel: 'google/gemini-2.5-flash-lite',
    draftModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteModel: 'qwen/qwen3-235b-a22b-2507',
    rewriteText: 'Tuesday stays a swim on the beach.',
    rewriteFailReason: 'rewrite_near_draft',
    rewriterChange: 'Removed the beach swim.',
    jevScoreDraft: 4.03,
    jevScoreRewrite: 3,
    jevNote: null,
    jevNoteReason: 'jev_no_free_text',
    interimReply: { text: 'The harbor morning can stay loose while I shape the walk.', model: 'google/gemini-2.5-flash-lite', ms: 900, judge: { judged: true, template: false, canShip: true } },
    rewriteAttempts: [{ text: 'Tuesday stays a swim on the beach.', model: 'qwen/qwen3-235b-a22b-2507', score: 3, ms: 1200, error: 'rewrite_near_draft' }],
  } : turn)),
});
const heldPdf = extractPdfText(renderLiveTranscriptPdf(heldDraft));
assert.match(heldPdf, /quality: 4\.03 · rewrite drafted, held: rewrite_near_draft/);
assert.doesNotMatch(heldPdf, /Rewriter \(qwen\/qwen3-235b-a22b-2507\): Removed the beach swim/);
assert.equal(jevRewriteLabelCounts(heldDraft, heldPdf).rewrittenTurns, 0);
assert.doesNotMatch(jevRewritePdf, /\(Jev note\)/);
assert.doesNotMatch(jevRewritePdf, /rewritten by Jev \(typesafe\/jev-1\.13\)/);
assert.doesNotMatch(jevRewritePdf, /scored and commented on every generated reply/);
assert.throws(() => assertJevRewriteLabels(jevRewrite, jevRewritePdf.replaceAll('Rewriter (qwen/qwen3-235b-a22b-2507): Kept the harbor morning and named only the walk.', '')), /bar 15 rewritten turns 1 but PDF labels 0/);
rejects(liveDoc({
  turns: liveDoc().turns.map((turn) => (turn.role === 'app' ? {
    ...turn,
    quality: { judged: true, score: 4, comment: 'Answer "Harbor morning plan for Craig" and keep the days they already named.', rewritten: true, rewriteModel: 'typesafe/jev-1.13', draft: 'Start with the harbor walk, then keep the afternoon open.' },
    shippedModel: 'typesafe/jev-1.13',
    rewriteModel: 'typesafe/jev-1.13',
  } : turn)),
}), /tier model|bake-off/);

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
assert.match(text, /timing: jev=400ms gen=2400ms model=qwen\/qwen3-235b-a22b-2507 tier=2 max_tokens=900/);
assert.match(text, /quality: 4/);
assert.doesNotMatch(text, /quality: 4 —/);
assert.match(text, /jevRan: true · model typesafe\/jev-1\.13 · score 4 · judge 400ms/);
assert.equal(text.split('jevRan:').length - 1, 1);
assert.doesNotMatch(text, /× the v6 gen-only p50/);
assert.match(text, /Session wall time is 3000ms/);
assert.match(text, /draftModel: qwen\/qwen3-235b-a22b-2507/);
assert.match(text, /flagged: false/);
assert.match(jevRewritePdf, /interimReply\.text: The\s+harbor\s+morning/);
assert.match(jevRewritePdf, /interimReply\.model: google\/gemini-2\.5-flash-lite/);
assert.match(jevRewritePdf, /interimReply\.ms:\s*900/);
assert.doesNotMatch(text, /not judged/);
assert.match(text, /v7 Tier 1–4|v7 Tier 1.4/);
assert.match(text, /v7 overall/);
assert.match(text, /Owner: Craig \(Owner\)/);
assert.match(text, /different scale/);
assert.match(text, /labeled scale/);
const layoutFile = path.join(os.tmpdir(), `r13-layout-${process.pid}.pdf`);
fs.writeFileSync(layoutFile, pdf);
const layout = spawnSync('pdftotext', ['-layout', layoutFile, '-'], { encoding: 'utf8' });
assert.equal(layout.status, 0);
const jevLines = layout.stdout.split('\n').filter((line) => line.includes('jevRan:'));
assert.ok(jevLines.length >= 1);
assert.ok(jevLines.every((line) => line.startsWith('jevRan:')));
fs.rmSync(layoutFile, { force: true });
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
    { ...liveDoc().turns[1], turnIndex: 4, jevNote: 'Sunday gardens for Kimberly stay in her own words, a 4.', quality: { ...liveDoc().turns[1].quality, comment: 'Sunday gardens for Kimberly stay in her own words, a 4.' } },
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
    { ...liveDoc().turns[1], text: longBody, jevNote: 'The Big Island line stays short.', quality: { ...liveDoc().turns[1].quality, comment: 'The Big Island line stays short.' } },
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
      text: 'Where are you headed?',
      at: '2026-09-25T21:00:00.000Z',
      latencyMs: null,
      sessionE2eMs: null,
      jevScoreDraft: null,
      jevScoreRaw: null,
      draftJevScoreRaw: null,
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
assert.match(fixedText, /Where are you headed/);
assert.doesNotMatch(fixedText, /timing: gen=0ms/);
assert.match(fixedText, /jevScoreDraft: null/);
assert.match(fixedText, /jevScoreRaw: null/);
assert.match(fixedText, /draftJevScoreRaw: null/);
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
const built = spawnSync(process.execPath, [script, '--fixture', '--transcript', transcriptPath, '--out', outPath], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
assert.match(extractPdfText(fs.readFileSync(outPath)), /T2 APP/);

const timingLine = formatLiveTimingLine({
  gen: 750,
  model: 'google/gemini-2.5-flash-lite',
  tier: 1,
  jevMs: 222,
  maxTokens: 900,
});
assert.equal(timingLine, 'timing: jev=222ms gen=750ms model=google/gemini-2.5-flash-lite tier=1 max_tokens=900');
assert.equal(timingLine.includes('zev'), false);
const poison = {
  deploy_banner: 'live 0123456789abcdef0123456789abcdef01234567 https://vacation-staging.timesyncher.com',
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

const driveSha = 'e830a5d177fcb5091cf127129ca9ea9481c4b5e2';
const stamped = liveDoc({
  buildSha: driveSha,
  deployBanner: `live ${driveSha} https://vacation-staging.timesyncher.com`,
  buildVsTip: `build used vs tip: ${driveSha} equals the tip`,
});
stamped.turns = stamped.turns.map((turn) => ({ ...turn, buildSha: driveSha }));
const stampedText = extractPdfText(renderLiveTranscriptPdf(stamped, { trip: 'Big Island Family' }));
assert.match(stampedText, new RegExp(driveSha));
assert.match(stampedText, /build used vs tip:/);
assert.match(stampedText, /equals the tip/);
assert.match(stampedText, /Dialog Pack — Big Island Family v7 Tier 1–4/);
assert.doesNotMatch(stampedText, /session-token/);
assert.match(stampedText, /T1 google\/gemini-2.5-flash-lite/);
const publisherSource = fs.readFileSync(script, 'utf8');
assert.equal(publisherSource.includes('transcript.buildSha ='), false);

console.log('live transcript dialog pdf passed');
