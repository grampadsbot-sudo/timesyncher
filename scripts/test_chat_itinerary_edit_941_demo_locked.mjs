import assert from 'node:assert/strict';
import {
  buildItineraryEditDemoLockedAuthoritativeSystemExtra,
  prepareChatItineraryEditForQueueTurn,
} from '../src/vacation/chat-itinerary-edit.mjs';
import { webAccessCookieName } from '../src/vacation/web-access.mjs';

const demoSlug = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
const barHopTurn = 'Add a bar hop before Carbone that night.';
const authenticatedHeaders = { cookie: `${webAccessCookieName()}=mock-owner-session` };

const demoLockedPrep = await prepareChatItineraryEditForQueueTurn({
  db: async () => [],
  trip: { id: 'trip-1', metadata: { sharedToken: demoSlug } },
  tripId: 'trip-1',
  seat: null,
  requestText: barHopTurn,
  turnId: 'turn-demo-locked-941',
  httpReq: { headers: authenticatedHeaders },
  env: {},
});
assert.equal(demoLockedPrep.itineraryEditResult?.reason, 'demo_locked');
assert.equal(demoLockedPrep.replyCustomerTurn, barHopTurn);
const authoritative = demoLockedPrep.itineraryEditAuthoritative || buildItineraryEditDemoLockedAuthoritativeSystemExtra();
assert.match(authoritative, /locked for chat itinerary edits/i);
assert.match(authoritative, /trip website/i);
assert.doesNotMatch(authoritative, /unscheduled items/i);
assert.doesNotMatch(authoritative, /bar hop/i);
assert.doesNotMatch(authoritative, /Carbone itself/i);
assert.doesNotMatch(demoLockedPrep.replyCustomerTurn, /Tell the customer this demo trip cannot be edited via chat/);

console.log('test_chat_itinerary_edit_941_demo_locked: ok');
