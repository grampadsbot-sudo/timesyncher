import assert from 'node:assert/strict';

import {
  hasTripPlanningDetails,
  collaboratorCheckoutReplyText,
  canQueueTelegramModification,
  parseVacationIdentity,
  resolveMediaUploadTargetTripFromRows,
  vacationSupportIntent,
  vacationSupportIntentWithModel,
  vacationSupportReply,
  vacationIdentityAck,
} from '../api/vacation-telegram-turn.mjs';
import { collaboratorDeniedCopy } from '../src/vacation/collaborators.mjs';

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
assert.match(ack, /turning that into the hosted TimeSyncher Vacation itinerary now/i);
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
      publicUrl: 'https://travel.timesyncher.com/shared/las-vegas-strip-vacation/',
    },
    telegramWebAccess: {
      role: 'owner',
      launchUrl: 'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=telegram_launch&token=owner-token&redirect=https%3A%2F%2Ftravel.timesyncher.com%2Fshared%2Flas-vegas-strip-vacation%2F',
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
assert.match(
  vacationSupportReply({
    text: 'Am I able to upload pics to the girlfriend trip?',
    intent: { intent: 'media_upload_question', shouldQueueWorker: false, confidence: 0.94 },
    access: { linked: true, hasPhotoUpload: true, hasVideoUpload: true, trip: { title: 'Big Island Girlfriend Visit' } },
  }),
  /attach them to Big Island Girlfriend Visit/i,
);
assert.doesNotMatch(
  vacationSupportReply({
    text: 'Am I able to upload pics to the girlfriend trip?',
    intent: { intent: 'media_upload_question', shouldQueueWorker: false, confidence: 0.94 },
    access: { linked: true, hasPhotoUpload: true, hasVideoUpload: true, trip: { title: 'Big Island Girlfriend Visit' } },
  }),
  /Vegas vacation/i,
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

const collaboratorCheckoutText = collaboratorCheckoutReplyText({
  singleTripUrl: 'https://vacation-staging.timesyncher.com/addons-checkout.html?collaboratorInvite=single-token&plan=telegram_collaborators_single_trip',
  vacationLabel: 'Las Vegas Strip Vacation',
});
assert.match(collaboratorCheckoutText, /One collaborator is added per checkout/i);
assert.match(collaboratorCheckoutText, /Anyone can view and edit the website for FREE, but editing is owner-approved and the editable link is sent through email\./i);
assert.match(collaboratorCheckoutText, /Telegram collaborator access for Las Vegas Strip Vacation/i);
assert.match(collaboratorCheckoutText, /<a href="https:\/\/vacation-staging\.timesyncher\.com\/addons-checkout\.html\?collaboratorInvite=single-token&amp;plan=telegram_collaborators_single_trip">Click here<\/a>/i);
assert.doesNotMatch(collaboratorCheckoutText, /All vacations:/i);
assert.doesNotMatch(collaboratorCheckoutText, /One vacation:/i);
assert.match(collaboratorCheckoutText, /photo and video upload access/i);
assert.doesNotMatch(collaboratorCheckoutText, /up to 3 people|Choose a Telegram add-on option below/i);

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

const vagueFollowupContext = {
  activeVacation: 'Las Vegas Strip Vacation',
  knownParticipants: ['Kim'],
  recentTurns: [
    { speaker: 'customer', body: 'Can my wife Kim get full Telegram access and upload pictures and videos?' },
    { speaker: 'assistant', body: 'Telegram editing for another person is a paid TimeSyncher Vacation add-on.' },
  ],
};
const grokSetupFollowup = await vacationSupportIntentWithModel('Can you send me the link?', {
  env: { TIMESYNCHER_XAI_API_KEY: 'test-key', TIMESYNCHER_XAI_ROUTER_MODEL: 'grok-test' },
  conversationContext: vagueFollowupContext,
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.x.ai/v1/chat/completions');
    const body = JSON.parse(options.body);
    const prompt = body.messages[1].content;
    assert.match(prompt, /Conversation state for resolving pronouns and follow-ups/);
    assert.match(prompt, /Las Vegas Strip Vacation/);
    assert.match(prompt, /Kim/);
    assert.match(prompt, /Can my wife Kim get full Telegram access/);
    assert.match(prompt, /collaborator_setup_link/);
    assert.match(prompt, /Customer turn: Can you send me the link\?/);
    return {
      ok: true,
      async json() {
        return {
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'collaborator_setup_link',
                write_mode: 'none',
                answerMode: 'collaborator_checkout',
                shouldQueueWorker: false,
                confidence: 0.94,
                reasons: ['recent_context_mentions_wife_kim_telegram_access'],
              }),
            },
          }],
        };
      },
    };
  },
});
assert.equal(grokSetupFollowup.intent, 'collaborator_setup_link');
assert.equal(grokSetupFollowup.source, 'grok');
assert.equal(grokSetupFollowup.shouldQueueWorker, false);

const missingTelegramOptionContext = {
  recentTurns: [
    { speaker: 'customer', body: 'Can you send me the link to set her up?' },
    {
      speaker: 'assistant',
      body: [
        'Yes. You can share the vacation website with your wife or family so they can view it.',
        '',
        'Website editing is owner-approved and email-verified, so someone with only the shared URL stays view-only. Full access through Telegram, equal to yours, requires the Telegram access add-on. You can give Telegram access to up to 3 people.',
        '',
        'Choose a Telegram add-on option below. The checkout page also lets you add photo and video upload access with pricing that matches the selected scope.',
      ].join('\n'),
    },
  ],
};
const missingTelegramOptionFollowup = await vacationSupportIntentWithModel('Where is the link to the telegram add on option?', {
  env: {},
  conversationContext: missingTelegramOptionContext,
  fetchImpl: async () => {
    throw new Error('should not call Grok without key');
  },
});
assert.equal(missingTelegramOptionFollowup.intent, 'collaborator_setup_link');
assert.equal(missingTelegramOptionFollowup.source, 'conversation_context_fallback');
assert.equal(missingTelegramOptionFollowup.shouldQueueWorker, false);

const screenshotLinkCommandIntent = vacationSupportIntent('Send me the telegram link again');
assert.equal(screenshotLinkCommandIntent.intent, 'collaborator_setup_link');
assert.equal(screenshotLinkCommandIntent.shouldQueueWorker, false);

const screenshotLinkCommandFollowup = await vacationSupportIntentWithModel('Send me the telegram link again', {
  env: {},
  conversationContext: {
    activeVacation: 'Las Vegas Strip Vacation',
    knownParticipants: ['Kim'],
    recentTurns: [
      {
        speaker: 'assistant',
        body: collaboratorCheckoutText,
      },
    ],
  },
  fetchImpl: async () => {
    throw new Error('should not call Grok without key');
  },
});
assert.equal(screenshotLinkCommandFollowup.intent, 'collaborator_setup_link');
assert.equal(screenshotLinkCommandFollowup.source, 'conversation_context_fallback');
assert.equal(screenshotLinkCommandFollowup.shouldQueueWorker, false);

const ubuntuRouterQuestion = await vacationSupportIntentWithModel('Am I able to upload pics and videos to the Vegas vacation?', {
  env: { TIMESYNCHER_GROK_ROUTER_URL: 'https://auth.timesyncher.com/grok-router/intent', TIMESYNCHER_GROK_ROUTER_TOKEN: 'test-token' },
  fetchImpl: async (url, options) => {
    assert.equal(url, 'https://auth.timesyncher.com/grok-router/intent');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    const body = JSON.parse(options.body);
    assert.equal(body.context.product, 'timesyncher_vacation');
    assert.equal(body.context.classifierContract.setupLinkIntent, 'collaborator_setup_link');
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

const participantVoiceTranscript = [
  'Add the music event at the coffeehouse next Friday night.',
  'Also add the Sunday market while we are in town.',
].join(' ');
assert.equal(hasTripPlanningDetails(participantVoiceTranscript), true);

const noAccessDb = async () => [];
const participantVoiceAuthz = await canQueueTelegramModification(noAccessDb, {
  customer_id: 'owner-customer-id',
  trip_id: 'trip-id',
  metadata: {},
}, {
  telegramChatId: 'participant-chat-id',
  telegramUserId: 'telegram:participant-user-id',
  kind: { requestType: 'itinerary_research_update' },
});
assert.equal(participantVoiceAuthz.allowed, false);
assert.equal(participantVoiceAuthz.reason, 'missing_paid_collaborator');

const participantDenied = collaboratorDeniedCopy();
assert.match(participantDenied, /not authorized|paid Telegram collaborator/i);
assert.doesNotMatch(participantDenied, /updating the hosted TimeSyncher Vacation itinerary now/i);
assert.doesNotMatch(participantDenied, /send the itinerary link when the next pass is ready/i);

const kimTrips = [
  { id: 'kona-experiences-trip-id', title: 'Kona Experiences', status: 'active', metadata: {} },
  { id: 'oahu-trip-id', title: 'Oahu, Waikiki', status: 'active', metadata: { shareToken: 'oahu-waikiki' } },
  { id: 'girlfriend-trip-id', title: 'Big Island Girlfriend Visit', status: 'active', metadata: { shareToken: 'big-island-girlfriend-visit' } },
  { id: 'home-trip-id', title: 'Big Island Home', status: 'active', metadata: { shareToken: 'big-island-home' } },
];
const kimMediaTarget = resolveMediaUploadTargetTripFromRows(
  { customer_id: 'kim-customer-id', trip_id: 'kona-experiences-trip-id' },
  { mediaKind: 'photo', caption: 'Please add this to my girlfriend trip', metadata: {} },
  kimTrips,
  {},
);
assert.equal(kimMediaTarget.trip.id, 'girlfriend-trip-id');
assert.equal(kimMediaTarget.source, 'caption_or_payload');
assert.throws(
  () => resolveMediaUploadTargetTripFromRows(
    { customer_id: 'kim-customer-id', trip_id: 'kona-experiences-trip-id' },
    { mediaKind: 'photo', caption: '', metadata: {} },
    kimTrips,
    {},
  ),
  /Which vacation should receive this media/i,
);
assert.equal(
  resolveMediaUploadTargetTripFromRows(
    { customer_id: 'kim-customer-id', trip_id: 'kona-experiences-trip-id' },
    { mediaKind: 'photo', caption: '', metadata: { targetTripId: 'home-trip-id' } },
    kimTrips,
    {},
  ).trip.id,
  'home-trip-id',
);

assert.equal(vacationSupportIntent('Can you find flight prices to Miami?'), null);

console.log('vacation telegram intake regression passed');
