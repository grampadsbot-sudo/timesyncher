import assert from 'node:assert/strict';

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
} from '../api/vacation-telegram-turn.mjs';

const screenshotTranscript = [
  'I will call it this our Hawaiian getaway and what would make it unforgettable',
  "we're gonna stay seven nights in Hawaii is just having a fabulous time.",
  "We'll start out in Oahu.",
].join(' ');

const parsed = parseVacationIdentity(screenshotTranscript);
assert.equal(parsed.vacationName, 'our Hawaiian getaway');
assert.match(parsed.unforgettableGoal, /seven nights in Hawaii/i);
assert.equal(hasTripPlanningDetails(screenshotTranscript), true);

const ack = vacationIdentityAck({
  vacationName: parsed.vacationName,
  text: screenshotTranscript,
  queued: { id: 'request_123' },
});
assert.match(ack, /working title/i);
assert.match(ack, /seven nights/i);
assert.match(ack, /Oahu\/Waikiki/i);
assert.match(ack, /I'm building your initial itinerary now and it may take 10–15 minutes/i);
assert.doesNotMatch(ack, /Now send me the destination/i);

const detailsOnly = parseVacationIdentity('We are staying seven nights in Hawaii and starting in Oahu.');
assert.equal(detailsOnly.vacationName, '');
assert.equal(hasTripPlanningDetails('We are staying seven nights in Hawaii and starting in Oahu.'), true);

const unlimitedQuestion = vacationSupportIntent('Do I have unlimited vacations?');
assert.equal(unlimitedQuestion.intent, 'account_question');
assert.equal(unlimitedQuestion.shouldQueueWorker, false);

assert.equal(
  vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: true, hasUnlimited: true, activePlan: 'unlimited', activeCount: 1 },
  }),
  'Yes. This Telegram chat is linked to an active unlimited TimeSyncher Vacation plan.',
);

assert.match(
  vacationSupportReply({
    text: 'Do I have unlimited vacations?',
    intent: unlimitedQuestion,
    access: { linked: true, hasUnlimited: false, activePlan: 'single', activeCount: 1 },
  }),
  /single-vacation TimeSyncher Vacation plan/i,
);

const bookingQuestion = vacationSupportIntent('Can you book flights for me?');
assert.equal(bookingQuestion.intent, 'support_question');
assert.equal(bookingQuestion.shouldQueueWorker, false);
assert.match(
  vacationSupportReply({ text: 'Can you book flights for me?', intent: bookingQuestion, access: { linked: true } }),
  /Customers verify details and make any bookings themselves/i,
);

const websiteLinkQuestion = vacationSupportIntent('Can you send me the link to the Vegas vacation?');
assert.equal(websiteLinkQuestion.intent, 'website_link_question');
assert.equal(websiteLinkQuestion.shouldQueueWorker, false);
const websiteLinkReply = vacationSupportReply({
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
      launchUrl: 'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=telegram_launch&token=owner-token&redirect=https%3A%2F%2Fvacation-staging.timesyncher.com%2Fshared%2Flas-vegas-strip-vacation%2F',
    },
  },
});
assert.match(websiteLinkReply, /<a href="https:\/\/vacation-staging\.timesyncher\.com\/api\/vacation-web-access\?action=telegram_launch[^"]+">click this link<\/a>/i);
assert.doesNotMatch(websiteLinkReply, /Opening that link from Telegram/i);

const mediaQuestion = vacationSupportIntent('Am I able to upload pics and videos to the Vegas vacation?');
assert.equal(mediaQuestion.intent, 'media_upload_question');
assert.equal(mediaQuestion.shouldQueueWorker, false);
assert.match(
  vacationSupportReply({
    text: 'Am I able to upload pics and videos to the Vegas vacation?',
    intent: mediaQuestion,
    access: { linked: true, hasPhotoUpload: true, hasVideoUpload: true },
  }),
  /Yes.*photo\/video upload access/i,
);
assert.doesNotMatch(
  vacationSupportReply({
    text: 'Am I able to upload pics and videos to the Vegas vacation?',
    intent: mediaQuestion,
    access: { linked: true, hasPhotoUpload: true, hasVideoUpload: true },
  }),
  /first pass|turning the information/i,
);
assert.match(
  vacationSupportReply({
    text: 'Am I able to upload pics and videos to the Vegas vacation?',
    intent: mediaQuestion,
    access: { linked: true, hasPhotoUpload: false, hasVideoUpload: false, session: { token: 'owner-token-123' } },
  }),
  /owner-media-checkout\.html\?session=owner-token-123/i,
);
assert.match(
  vacationSupportReply({
    text: 'Am I able to upload pics and videos to the Vegas vacation?',
    intent: mediaQuestion,
    access: { linked: true, hasPhotoUpload: false, hasVideoUpload: false, session: { onboardingToken: 'joined-token-456' } },
  }),
  /owner-media-checkout\.html\?session=joined-token-456/i,
);

assert.match(
  vacationSupportReply({
    text: 'Can my wife Kim change the Vegas site and upload videos?',
    intent: { intent: 'collaborator_access_question', shouldQueueWorker: false, confidence: 0.93 },
    access: { linked: true },
  }),
  /Telegram editing for another person is a paid TimeSyncher Vacation add-on/i,
);

const wifeTelegramCollaboratorStatusIntent = vacationSupportIntent('Is my wife already a telegram collaborator?');
assert.equal(wifeTelegramCollaboratorStatusIntent.intent, 'collaborator_access_question');
assert.equal(wifeTelegramCollaboratorStatusIntent.shouldQueueWorker, false);
assert.equal(wifeTelegramCollaboratorStatusIntent.answerMode, 'account_state');

const wifeTelegramCollaboratorStatusReply = vacationSupportReply({
  text: 'Is my wife already a telegram collaborator?',
  intent: { intent: 'collaborator_access_question', shouldQueueWorker: false, confidence: 0.95, answerMode: 'account_state' },
  access: {
    linked: true,
    trip: { title: 'Las Vegas Strip Vacation' },
    activeTelegramCollaborators: [],
    websiteEditorGrants: [{ displayName: 'Kim', email: 'kdkona@gmail.com', role: 'web_editor', status: 'invited' }],
  },
});
assert.match(wifeTelegramCollaboratorStatusReply, /^No, Kim is not a Telegram collaborator on Las Vegas Strip Vacation yet/i);
assert.match(wifeTelegramCollaboratorStatusReply, /website editor invite/i);
assert.match(wifeTelegramCollaboratorStatusReply, /website editing and Telegram collaboration are separate/i);
assert.doesNotMatch(wifeTelegramCollaboratorStatusReply, /could not verify|matching vacation|Yes\.|up to 3 people|Choose a Telegram add-on option/i);

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
  env: { TIMESYNCHER_XAI_API_KEY: 'test-key', TIMESYNCHER_XAI_ROUTER_MODEL: 'grok-test' },
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

console.log('vacation telegram intake regression passed');
