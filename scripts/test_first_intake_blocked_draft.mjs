#!/usr/bin/env node
import assert from 'node:assert/strict';
import { attachBlockedFirstIntakeDraft, vacationAppTurnPayloadForClient } from '../src/vacation/blocked-turn-payload.mjs';
import { applyLiveAppReplyFailureToPayload } from '../src/vacation/reply-ship.mjs';

const STAGING_TURN_ID = 'a68dc1a0-6ac9-4079-81bd-7adf7c3b7086';
const CUSTOMER_TURN = 'Maui March 10-17 2027 with my wife';
const STAGING_FLAGGED_DRAFT = "Shepherd, I'm building your Maui itinerary for Wednesday, March 10 through Wednesday, March 17, 2027, with you and your wife. I can add your wife when you agree. I will not grant view or edit until you agree. Where are you staying?";

const produced = {
  reply: null,
  reason: 'first_intake_reply_flagged',
  blockedDraft: STAGING_FLAGGED_DRAFT,
  blockedReasons: ['first_intake_weekday_not_allowed:Wednesday', 'first_intake_question_count_gaps'],
};

const payload = {
  source: 'vacation_app',
  surface: 'vacation-app',
  authorName: 'Shepherd C891',
  liveTranscript: {
    role: 'customer',
    text: CUSTOMER_TURN,
    turnIndex: 2,
    replyFailure: null,
  },
};
const customerLive = payload.liveTranscript;

const failure = applyLiveAppReplyFailureToPayload(payload, customerLive, produced);
assert.equal(failure.failureStatus, 'reply_unavailable');
assert.equal(failure.replyFailure, 'first_intake_reply_flagged');
assert.equal(payload.blockedDraft, STAGING_FLAGGED_DRAFT);
assert.deepEqual(payload.blockedReasons, produced.blockedReasons);
assert.equal(customerLive.blockedDraft, undefined);
assert.equal(customerLive.replyFailure, 'first_intake_reply_flagged');

const clientPayload = vacationAppTurnPayloadForClient(payload);
assert.equal(clientPayload.blockedDraft, undefined);
assert.equal(clientPayload.blockedReasons, undefined);
assert.equal(clientPayload.liveTranscript.text, CUSTOMER_TURN);
assert.equal(JSON.stringify(clientPayload).includes('Wednesday, March 10'), false);

const apiResponse = {
  ok: false,
  status: failure.failureStatus,
  error: failure.replyFailure,
  reply: null,
  requestId: '07dd26b7-d45f-4386-a866-fcbfb5f0364c',
};
assert.equal(apiResponse.blockedDraft, undefined);
assert.equal(JSON.stringify(apiResponse).includes(STAGING_FLAGGED_DRAFT), false);

const storedTurn = {
  speaker: 'customer',
  body: CUSTOMER_TURN,
  payload,
};
const visibleTurn = {
  ...storedTurn,
  payload: vacationAppTurnPayloadForClient(storedTurn.payload),
};
assert.equal(visibleTurn.payload.replyFailure, 'first_intake_reply_flagged');
assert.equal(visibleTurn.body, CUSTOMER_TURN);
assert.equal(JSON.stringify(visibleTurn).includes('Where are you staying?'), false);

attachBlockedFirstIntakeDraft(payload, { blockedDraft: '', blockedReasons: [] });
assert.equal(payload.blockedDraft, STAGING_FLAGGED_DRAFT);

console.log(JSON.stringify({
  ok: true,
  checked: 'first-intake-blocked-draft',
  stagingTurnId: STAGING_TURN_ID,
  customerTurn: CUSTOMER_TURN,
}));
