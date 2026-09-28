import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';

import {
  ensureJevResponseCoverage,
  hasTripPlanningDetails,
  jevResponseCoverage,
  jevVacationDecision,
  parseVacationIdentity,
  vacationSupportIntent,
  vacationSupportIntentWithJevShadow,
  vacationSupportIntentWithModel,
  vacationSupportReply,
  vacationIdentityAck,
} from '../routes/vacation-telegram-turn.mjs';

if (!String(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '').trim()) {
  process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS = '2700';
}
const BAKEOFF_MODEL = 'google/gemini-2.5-flash-lite';
const modelEnv = {
  TIMESYNCHER_XAI_API_KEY: 'test-key',
  TIMESYNCHER_XAI_ROUTER_MODEL: BAKEOFF_MODEL,
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '1500',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
};

function supportModel(replyText) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: replyText } }] };
        },
      };
    },
  };
}

function factsFrom(call) {
  const user = call.messages.find((message) => message.role === 'user');
  return JSON.parse(user.content);
}

const screenshotTranscript = [
  'I will call it this our Hawaiian getaway and what would make it unforgettable',
  "we're gonna stay seven nights in Hawaii is just having a fabulous time.",
  "We'll start out in Oahu.",
].join(' ');

const parsed = parseVacationIdentity(screenshotTranscript);
assert.equal(parsed.vacationName, 'our Hawaiian getaway');
assert.match(parsed.unforgettableGoal, /seven nights in Hawaii/i);
const hawaiiBrief = { ok: true, destination: 'Oahu', hasDates: true, title: '' };
assert.equal(hasTripPlanningDetails(screenshotTranscript, hawaiiBrief), true);
assert.equal(hasTripPlanningDetails(screenshotTranscript), false);
assert.equal(hasTripPlanningDetails(screenshotTranscript, { ok: false, error: 'classifier down', destination: 'Oahu', hasDates: true }), false);

const ack = vacationIdentityAck({
  vacationName: parsed.vacationName,
  text: screenshotTranscript,
  queued: { id: 'request_123' },
  extraction: hawaiiBrief,
});
assert.equal(ack.ask, 'identity_ack');
assert.equal(ack.vacationName, parsed.vacationName);
assert.match(ack.customerText, /seven nights/i);
assert.equal(ack.destination, 'Oahu');
assert.equal(ack.hasDates, true);
assert.equal(ack.building, true);
assert.match(ack.buildCue, /10–15 minutes/);

const detailsOnly = parseVacationIdentity('We are staying seven nights in Hawaii and starting in Oahu.');
assert.equal(detailsOnly.vacationName, '');
assert.equal(hasTripPlanningDetails('We are staying seven nights in Hawaii and starting in Oahu.'), false);
assert.equal(hasTripPlanningDetails('We are staying seven nights in Hawaii and starting in Oahu.', { ok: true, destination: '', hasDates: true }), true);

const unlimitedQuestion = vacationSupportIntent('Do I have unlimited vacations?');
assert.equal(unlimitedQuestion.intent, 'account_question');
assert.equal(unlimitedQuestion.shouldQueueWorker, false);

const unlimitedModel = supportModel('model-unlimited');
assert.equal(
  await vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: true, hasUnlimited: true, activePlan: 'unlimited', activeCount: 1 },
    env: modelEnv,
    fetchImpl: unlimitedModel.fetchImpl,
  }),
  'model-unlimited',
);
assert.equal(factsFrom(unlimitedModel.calls[0]).plan.hasUnlimited, true);
assert.equal(factsFrom(unlimitedModel.calls[0]).plan.activePlan, 'unlimited');
assert.equal(unlimitedModel.calls[0].messages[0].role, 'system');
assert.doesNotMatch(unlimitedModel.calls[0].messages[0].content, /Vegas|Big Island|Kailua-Kona|Waikiki/i);

const singlePlanModel = supportModel('model-single');
assert.equal(
  await vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: true, hasUnlimited: false, activePlan: 'single', activeCount: 1, trip: { title: 'Harbor Week' } },
    env: modelEnv,
    fetchImpl: singlePlanModel.fetchImpl,
  }),
  'model-single',
);
assert.equal(factsFrom(singlePlanModel.calls[0]).plan.hasUnlimited, false);
assert.equal(factsFrom(singlePlanModel.calls[0]).plan.activeCount, 1);
assert.equal(factsFrom(singlePlanModel.calls[0]).trip.title, 'Harbor Week');

const bookingQuestion = vacationSupportIntent('Can you book flights for me?');
assert.equal(bookingQuestion.intent, 'support_question');
assert.equal(bookingQuestion.shouldQueueWorker, false);
const bookingModel = supportModel('model-booking');
assert.equal(
  await vacationSupportReply({
    text: 'Can you book flights for me?',
    intent: bookingQuestion,
    access: { linked: true, trip: { title: 'Harbor Week' } },
    env: modelEnv,
    fetchImpl: bookingModel.fetchImpl,
  }),
  'model-booking',
);
assert.equal(factsFrom(bookingModel.calls[0]).ask, 'booking');
assert.equal(factsFrom(bookingModel.calls[0]).booksForCustomer, false);
assert.equal(factsFrom(bookingModel.calls[0]).trip.title, 'Harbor Week');

const websiteLinkQuestion = vacationSupportIntent('Can you send me the link to the Vegas vacation?');
assert.equal(websiteLinkQuestion.intent, 'website_link_question');
assert.equal(websiteLinkQuestion.shouldQueueWorker, false);
const websiteModel = supportModel('model-website');
const launchUrl = 'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=telegram_launch&token=owner-token&redirect=https%3A%2F%2Fvacation-staging.timesyncher.com%2Fshared%2Flas-vegas-strip-vacation%2F';
const websiteLinkReply = await vacationSupportReply({
  text: 'Can you send me the link to the Vegas vacation?',
  intent: websiteLinkQuestion,
  access: {
    linked: true,
    trip: {
      title: 'Las Vegas Strip Vacation',
      publicUrl: 'https://vacation-staging.timesyncher.com/shared/las-vegas-strip-vacation/',
    },
    telegramWebAccess: {
      role: 'owner',
      launchUrl,
    },
  },
  env: modelEnv,
  fetchImpl: websiteModel.fetchImpl,
});
assert.equal(websiteLinkReply, 'model-website');
const websiteFacts = factsFrom(websiteModel.calls[0]);
assert.equal(websiteFacts.ask, 'website_link');
assert.equal(websiteFacts.trip.title, 'Las Vegas Strip Vacation');
assert.equal(websiteFacts.trip.launchUrl, launchUrl);
assert.equal(websiteFacts.trip.role, 'owner');
assert.doesNotMatch(websiteModel.calls[0].messages[0].content, /the Vegas vacation/i);

const mediaQuestion = vacationSupportIntent('Am I able to upload pics and videos to the Vegas vacation?');
assert.equal(mediaQuestion.intent, 'media_upload_question');
assert.equal(mediaQuestion.shouldQueueWorker, false);
const mediaAllowedModel = supportModel('model-media-yes');
assert.equal(
  await vacationSupportReply({
    text: 'Am I able to upload pics and videos to the Vegas vacation?',
    intent: mediaQuestion,
    access: { linked: true, hasPhotoUpload: true, hasVideoUpload: true, trip: { title: 'Harbor Week' } },
    env: modelEnv,
    fetchImpl: mediaAllowedModel.fetchImpl,
  }),
  'model-media-yes',
);
const mediaAllowedFacts = factsFrom(mediaAllowedModel.calls[0]);
assert.equal(mediaAllowedFacts.ask, 'media_upload');
assert.equal(mediaAllowedFacts.media.allowed, true);
assert.equal(mediaAllowedFacts.media.checkoutUrl, null);
assert.equal(mediaAllowedFacts.trip.title, 'Harbor Week');
assert.doesNotMatch(JSON.stringify(mediaAllowedModel.calls[0].messages[0]), /the Vegas vacation/i);
const mediaPhotoModel = supportModel('model-media-no');
await vacationSupportReply({
  text: 'Am I able to upload pics and videos to the Vegas vacation?',
  intent: mediaQuestion,
  access: { linked: true, hasPhotoUpload: false, hasVideoUpload: false, session: { token: 'owner-token-123' }, trip: { title: 'Harbor Week' } },
  env: modelEnv,
  fetchImpl: mediaPhotoModel.fetchImpl,
});
assert.match(factsFrom(mediaPhotoModel.calls[0]).media.checkoutUrl, /owner-media-checkout\.html\?session=owner-token-123/);
const mediaJoinedModel = supportModel('model-media-joined');
await vacationSupportReply({
  text: 'Am I able to upload pics and videos to the Vegas vacation?',
  intent: mediaQuestion,
  access: { linked: true, hasPhotoUpload: false, hasVideoUpload: false, session: { onboardingToken: 'joined-token-456' }, trip: { title: 'Harbor Week' } },
  env: modelEnv,
  fetchImpl: mediaJoinedModel.fetchImpl,
});
assert.match(factsFrom(mediaJoinedModel.calls[0]).media.checkoutUrl, /owner-media-checkout\.html\?session=joined-token-456/);

const collaboratorPlansModel = supportModel('model-collaborator-plans');
assert.equal(
  await vacationSupportReply({
    text: 'Can my wife Kim change the Vegas site and upload videos?',
    intent: { intent: 'collaborator_access_question', shouldQueueWorker: false, confidence: 0.93 },
    access: { linked: true, trip: { title: 'Harbor Week' } },
    env: modelEnv,
    fetchImpl: collaboratorPlansModel.fetchImpl,
  }),
  'model-collaborator-plans',
);
const collaboratorPlanFacts = factsFrom(collaboratorPlansModel.calls[0]);
assert.equal(collaboratorPlanFacts.ask, 'collaborator_access');
assert.equal(collaboratorPlanFacts.collaborator.statusQuestion, false);
assert.ok(collaboratorPlanFacts.collaborator.plans.some((plan) => plan.scope === 'single_trip' && plan.amountCents === 1500));
assert.ok(collaboratorPlanFacts.collaborator.plans.some((plan) => plan.scope === 'unlimited_trips' && plan.amountCents === 1900));
assert.equal(collaboratorPlanFacts.trip.title, 'Harbor Week');

const wifeTelegramCollaboratorStatusIntent = vacationSupportIntent('Is my wife already a telegram collaborator?');
assert.equal(wifeTelegramCollaboratorStatusIntent.intent, 'collaborator_access_question');
assert.equal(wifeTelegramCollaboratorStatusIntent.shouldQueueWorker, false);
assert.equal(wifeTelegramCollaboratorStatusIntent.answerMode, 'account_state');

const wifeModel = supportModel('model-wife-status');
const wifeTelegramCollaboratorStatusReply = await vacationSupportReply({
  text: 'Is my wife already a telegram collaborator?',
  intent: { intent: 'collaborator_access_question', shouldQueueWorker: false, confidence: 0.95, answerMode: 'account_state' },
  access: {
    linked: true,
    trip: { title: 'Las Vegas Strip Vacation' },
    activeTelegramCollaborators: [],
    websiteEditorGrants: [{ displayName: 'Kim', email: 'kdkona@gmail.com', role: 'web_editor', status: 'invited' }],
  },
  env: modelEnv,
  fetchImpl: wifeModel.fetchImpl,
});
assert.equal(wifeTelegramCollaboratorStatusReply, 'model-wife-status');
const wifeFacts = factsFrom(wifeModel.calls[0]);
assert.equal(wifeFacts.collaborator.person, 'Kim');
assert.equal(wifeFacts.collaborator.telegramCollaborator, false);
assert.equal(wifeFacts.collaborator.webEditor.status, 'invited');
assert.equal(wifeFacts.collaborator.tripTitle, 'Las Vegas Strip Vacation');
assert.equal(wifeFacts.trip.title, 'Las Vegas Strip Vacation');

await assert.rejects(
  () => vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: false },
    env: {},
    fetchImpl: async () => {
      throw new Error('network should not be called');
    },
  }),
  /live model key is missing/,
);

await assert.rejects(
  () => vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: false },
    env: { TIMESYNCHER_XAI_API_KEY: 'test-key' },
    fetchImpl: async () => {
      throw new Error('network should not be called');
    },
  }),
  /model unavailable/,
);

const mockedGrokFetch = async () => ({
  ok: true,
  async json() {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'media_upload_question',
            write_mode: 'none',
            answerMode: 'account_state',
            shouldQueueWorker: false,
            confidence: 0.93,
            reasons: ['asks_about_media_upload_access'],
          }),
        },
      }],
    };
  },
});
const grokMediaQuestion = await vacationSupportIntentWithModel('Am I able to upload pics and videos to the Vegas vacation?', {
  env: { TIMESYNCHER_XAI_API_KEY: 'test-key', TIMESYNCHER_XAI_ROUTER_MODEL: BAKEOFF_MODEL },
  fetchImpl: mockedGrokFetch,
});
assert.equal(grokMediaQuestion.intent, 'media_upload_question');
assert.equal(grokMediaQuestion.source, 'grok');
assert.equal(grokMediaQuestion.shouldQueueWorker, false);

const ubuntuRouterQuestion = await vacationSupportIntentWithModel('Am I able to upload pics and videos to the Vegas vacation?', {
  env: { TIMESYNCHER_GROK_ROUTER_URL: 'https://auth.timesyncher.com/grok-router/intent', TIMESYNCHER_GROK_ROUTER_TOKEN: 'test-token' },
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://auth.timesyncher.com/grok-router/intent');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          decision: {
            intent: 'media_upload_question',
            write_mode: 'none',
            answerMode: 'account_state',
            shouldQueueWorker: false,
            confidence: 0.96,
            reasons: ['ubuntu_grok_router_fixture'],
          },
        };
      },
    };
  },
});
assert.equal(ubuntuRouterQuestion.intent, 'media_upload_question');
assert.equal(ubuntuRouterQuestion.source, 'ubuntu_grok_router');
assert.equal(ubuntuRouterQuestion.shouldQueueWorker, false);

const fallbackMediaQuestion = await vacationSupportIntentWithModel('Am I able to upload pics and videos to the Vegas vacation?', {
  env: {},
  fetchImpl: async () => {
    throw new Error('should not call Grok without key');
  },
});
assert.equal(fallbackMediaQuestion.intent, 'media_upload_question');
assert.equal(fallbackMediaQuestion.source, 'deterministic_fallback');

const jevShadowDecision = await jevVacationDecision('Looks good, let us do it', {
  env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'shadow' },
  session: {
    customer_id: 'customer_123',
    trip_id: 'trip_123',
    current_step: 'awaiting_trip_details',
    metadata: { vacationName: 'Las Vegas' },
  },
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
    assert.equal(options.headers.authorization, 'Bearer test-openrouter-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'typesafe/jev-1.13');
    assert.equal(body.state.current_turn, 'Looks good, let us do it');
    assert.deepEqual(body.state.active_vacations, ['Las Vegas']);
    assert.equal(body.questions.intent.type, 'choice');
    assert.equal(body.questions.tag_budget.type, 'noul');
    assert.equal(body.questions.tag_restaurants_food.type, 'noul');
    return {
      ok: true,
      async json() {
        return {
          model: 'typesafe/jev-1.13-test',
          usage: { cost: 0.00001 },
          answers: {
            intent: { type: 'choice', choice: 'approval', confidence: 0.99, probabilities: { approval: 0.99 } },
            write_mode: { type: 'choice', choice: 'none', confidence: 0.92, probabilities: { none: 0.92 } },
            approval_signal: { type: 'noul', noul: 0.95 },
            needs_clarification: { type: 'noul', noul: 0.2 },
            tag_approval: { type: 'noul', noul: 0.97 },
            tag_change_request: { type: 'noul', noul: 0.12 },
          },
        };
      },
    };
  },
});
assert.equal(jevShadowDecision.intent, 'approval');
assert.equal(jevShadowDecision.write_mode, 'none');
assert.equal(jevShadowDecision.source, 'openrouter_jev');
assert.equal(jevShadowDecision.approval_signal, 0.95);
assert.deepEqual(jevShadowDecision.issue_tags, ['approval']);

const jevShadowRouter = await vacationSupportIntentWithJevShadow('Looks good, let us do it', {
  env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'shadow' },
  session: { customer_id: 'customer_123', trip_id: 'trip_123', metadata: { vacationName: 'Las Vegas' } },
  fetchImpl: async () => ({
    ok: true,
    async json() {
      return {
        answers: {
          intent: { type: 'choice', choice: 'approval', confidence: 0.99 },
          write_mode: { type: 'choice', choice: 'none', confidence: 0.91 },
          approval_signal: { type: 'noul', noul: 0.94 },
          needs_clarification: { type: 'noul', noul: 0.1 },
          tag_approval: { type: 'noul', noul: 0.96 },
          tag_budget: { type: 'noul', noul: 0.04 },
        },
      };
    },
  }),
});
assert.equal(jevShadowRouter.selectedDecision, null);
assert.equal(jevShadowRouter.currentDecision, null);
assert.equal(jevShadowRouter.comparison.mode, 'shadow');
assert.equal(jevShadowRouter.comparison.jevInfluencedBehavior, false);
assert.deepEqual(jevShadowRouter.issueTags, ['approval']);

const multiTagJevDecision = await jevVacationDecision('Can you add kid-friendly dinners under $40 and send my wife the link?', {
  env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'shadow' },
  fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.questions.tag_travelers.type, 'noul');
    assert.equal(body.questions.tag_budget.type, 'noul');
    assert.equal(body.questions.tag_restaurants_food.type, 'noul');
    assert.equal(body.questions.tag_collaborator_access.type, 'noul');
    return {
      ok: true,
      async json() {
        return {
          answers: {
            intent: { type: 'choice', choice: 'itinerary_action', confidence: 0.9 },
            write_mode: { type: 'choice', choice: 'edit', confidence: 0.87 },
            approval_signal: { type: 'noul', noul: 0.01 },
            needs_clarification: { type: 'noul', noul: 0.16 },
            tag_travelers: { type: 'noul', noul: 0.86 },
            tag_budget: { type: 'noul', noul: 0.91 },
            tag_restaurants_food: { type: 'noul', noul: 0.94 },
            tag_collaborator_access: { type: 'noul', noul: 0.88 },
            tag_flights: { type: 'noul', noul: 0.03 },
          },
        };
      },
    };
  },
});
assert.deepEqual(multiTagJevDecision.issue_tags, ['travelers', 'budget', 'restaurants_food', 'collaborator_access']);

const jevAssistRouter = await vacationSupportIntentWithJevShadow('What does this cost?', {
  env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'assist' },
  fetchImpl: async () => ({
    ok: true,
    async json() {
      return {
        answers: {
          intent: { type: 'choice', choice: 'support_question', confidence: 0.98 },
          write_mode: { type: 'choice', choice: 'none', confidence: 0.95 },
          approval_signal: { type: 'noul', noul: 0.01 },
          needs_clarification: { type: 'noul', noul: 0.2 },
        },
      };
    },
  }),
});
assert.equal(jevAssistRouter.selectedDecision.intent, 'support_question');
assert.equal(jevAssistRouter.selectedDecision.source, 'deterministic_fallback');
assert.equal(jevAssistRouter.comparison.jevInfluencedBehavior, false);

const jevAssistDowngrade = await vacationSupportIntentWithJevShadow('Can this thing do calendar stuff?', {
  env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'assist' },
  fetchImpl: async () => ({
    ok: true,
    async json() {
      return {
        answers: {
          intent: { type: 'choice', choice: 'support_question', confidence: 0.96 },
          write_mode: { type: 'choice', choice: 'none', confidence: 0.9 },
          approval_signal: { type: 'noul', noul: 0.01 },
          needs_clarification: { type: 'noul', noul: 0.2 },
        },
      };
    },
  }),
});
assert.equal(jevAssistDowngrade.selectedDecision.intent, 'support_question');
assert.equal(jevAssistDowngrade.selectedDecision.source, 'openrouter_jev_assist');
assert.equal(jevAssistDowngrade.comparison.jevInfluencedBehavior, true);

const coverageResult = await jevResponseCoverage(
  'Can you add kid-friendly dinners under $40 and send my wife the link?',
  'I can add kid-friendly dinners.',
  ['travelers', 'budget', 'restaurants_food', 'collaborator_access'],
  {
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'shadow' },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.ai/api/alpha/decisions');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.state.issue_tags, ['travelers', 'budget', 'restaurants_food', 'collaborator_access']);
      assert.equal(body.questions.covers_budget.type, 'noul');
      return {
        ok: true,
        async json() {
          return {
            answers: {
              covers_travelers: { type: 'noul', noul: 0.92 },
              covers_budget: { type: 'noul', noul: 0.28 },
              covers_restaurants_food: { type: 'noul', noul: 0.91 },
              covers_collaborator_access: { type: 'noul', noul: 0.19 },
              overall_ready: { type: 'noul', noul: 0.35 },
            },
          };
        },
      };
    },
  },
);
assert.equal(coverageResult.ok, false);
assert.deepEqual(coverageResult.missing_tags, ['budget', 'collaborator_access']);

let coverageAttempt = 0;
const repairedCoverage = await ensureJevResponseCoverage(
  'Can you add kid-friendly dinners under $40 and send my wife the link?',
  'I can add kid-friendly dinners.',
  ['travelers', 'budget', 'restaurants_food', 'collaborator_access'],
  {
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', JEV_ROUTER_MODE: 'shadow' },
    fetchImpl: async () => {
      coverageAttempt += 1;
      return {
        ok: true,
        async json() {
          if (coverageAttempt === 1) {
            return {
              answers: {
                covers_travelers: { type: 'noul', noul: 0.91 },
                covers_budget: { type: 'noul', noul: 0.2 },
                covers_restaurants_food: { type: 'noul', noul: 0.9 },
                covers_collaborator_access: { type: 'noul', noul: 0.18 },
                overall_ready: { type: 'noul', noul: 0.32 },
              },
            };
          }
          return {
            answers: {
              covers_travelers: { type: 'noul', noul: 0.93 },
              covers_budget: { type: 'noul', noul: 0.89 },
              covers_restaurants_food: { type: 'noul', noul: 0.91 },
              covers_collaborator_access: { type: 'noul', noul: 0.86 },
              overall_ready: { type: 'noul', noul: 0.9 },
            },
          };
        },
      };
    },
    repairDraft: async ({ draftResponse, missingTags }) => `${draftResponse} I will keep dinner picks under $40 where possible and handle your wife's access separately. Missing: ${missingTags.join(', ')}.`,
  },
);
assert.equal(repairedCoverage.changed, true);
assert.equal(repairedCoverage.coverage.ok, true);
assert.equal(repairedCoverage.attempts.length, 2);

assert.equal(vacationSupportIntent('Can you find flight prices to Miami?'), null);
const telegramSource = fs.readFileSync(new URL('../routes/vacation-telegram-turn.mjs', import.meta.url), 'utf8');
assert.equal(telegramSource.includes("[/\\bkona\\b|\\bbig island\\b/i, 'Kona/Big Island']"), false);
assert.match(telegramSource, /classifyTripIntake/);
assert.doesNotMatch(telegramSource, /classic Waikiki beach energy/);

const telegramTurnSource = await readFile(new URL('../routes/vacation-telegram-turn.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(telegramTurnSource, /the Vegas vacation/i);
assert.doesNotMatch(telegramTurnSource, /seatJoinCustomerText/);
assert.match(telegramTurnSource, /modelSupportReply/);
const replyRulesSource = await readFile(new URL('./vacation-app-reply-rules.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(replyRulesSource, /The first sentence is/);
assert.doesNotMatch(replyRulesSource, /Welcome aboard, Kimberly/);
assert.doesNotMatch(replyRulesSource, /Craig paid for this seat/);

console.log('vacation telegram intake regression passed');
