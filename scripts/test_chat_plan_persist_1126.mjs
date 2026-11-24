import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chatSaveMetadata } from '../routes/vacation-itinerary.mjs';
import { readStoredCost } from './harness/cost.mjs';
import { createReservationsTestDb } from './lib/reservations-test-harness.mjs';
import { runChatItineraryEditTurn } from '../src/vacation/chat-itinerary-edit.mjs';
import { scheduleChatThing } from '../src/vacation/chat-thing-schedule.mjs';
import {
  isOrdinaryPlanningTurn,
  isPlanConfirmation,
  keepPlannedDays,
  plannedCustomerThings,
  plannedItineraryItems,
  recoverOrdinaryPlanningReply,
} from '../src/vacation/chat-plan-persist.mjs';
import { liveTranscriptFromRows, liveTurnRecord } from '../src/vacation/live-app-turn.mjs';
import { isAiImportChatRequest } from '../src/vacation/mcp-chat-import.mjs';
import { tryHandleAiMcpChatTurn, tryHandleReservationsChatTurn } from '../src/vacation/mcp-reservations-chat.mjs';
import { isReservationAsk } from '../src/vacation/mcp-reservations-handshake.mjs';
import { mergeWantedThings } from '../src/vacation/trip-intake-classify.mjs';

const PLAN = "flag what we'd want to book early";
const DECLINE = "we're not ready to connect an AI for bookings — keep building the itinerary";
const DRAFT = [
  'Day 1',
  'Harbor Hotel',
  'Dinner at Harbor Bistro',
  '',
  'Day 2',
  'Flight to Lisbon',
].join('\n');

assert.equal(isReservationAsk('book Carbone for 8 on Wednesday'), true);
assert.equal(isReservationAsk('book a table'), true);
assert.equal(isReservationAsk('set up reservations'), true);
assert.equal(isReservationAsk('set up my AI for reservations'), true);
assert.equal(isReservationAsk(PLAN), false);
assert.equal(isReservationAsk(DECLINE), false);
assert.equal(isAiImportChatRequest(DECLINE), false);
assert.equal(isAiImportChatRequest('set up my AI for reservations'), false);
assert.equal(isAiImportChatRequest('Connect my Claude to this vacation'), true);
assert.equal(isAiImportChatRequest('I want to import vacation details from my AI'), true);
assert.equal(isOrdinaryPlanningTurn(PLAN), true);
assert.equal(isOrdinaryPlanningTurn(DECLINE), true);
assert.equal(isOrdinaryPlanningTurn('book Carbone for 8 on Wednesday'), false);
assert.equal(isOrdinaryPlanningTurn('set up my AI for reservations'), false);
assert.equal(isOrdinaryPlanningTurn('Connect my Claude to this vacation'), false);
assert.equal(isPlanConfirmation('yes'), false);
assert.equal(isPlanConfirmation('Yes, please set it up'), false);
assert.equal(isPlanConfirmation('yes, save that plan'), true);

const planning = await tryHandleAiMcpChatTurn(async () => {
  throw new Error('planning lookup');
}, {
  session: { customer_id: 'cust-plan', email: 'plan@example.test' },
  trip: { id: 'vac-plan', title: 'Harbor week' },
  requestText: PLAN,
});
assert.equal(planning, null);
const decline = await tryHandleAiMcpChatTurn(async () => {
  throw new Error('decline lookup');
}, {
  session: { customer_id: 'cust-plan', email: 'plan@example.test' },
  trip: { id: 'vac-plan', title: 'Harbor week' },
  requestText: DECLINE,
});
assert.equal(decline, null);

const db = createReservationsTestDb();
const ownerId = crypto.randomUUID();
const trip = db.seedVacation({
  ownerCustomerId: ownerId,
  title: 'Harbor week',
  destination: 'Harbor',
  startDate: '2026-07-08',
  endDate: '2026-07-11',
});
const session = {
  customer_id: ownerId,
  email: 'owner-plan@example.test',
  first_name: 'Sam',
  last_name: 'Rivera',
  display_name: 'Sam Rivera',
};
const offer = await tryHandleReservationsChatTurn(db, {
  session,
  trip: { id: trip.id, title: trip.title, destination: trip.destination },
  requestText: 'set up my AI for reservations',
  httpReq: { headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' } },
});
assert.match(offer.reply, /doesn't book reservations directly/i);
assert.doesNotMatch(offer.reply, /Ready to import into/i);

const skipped = await runChatItineraryEditTurn({
  db: null,
  trip: { id: 'trip-1', shareToken: 'lane-test-slug' },
  customerTurn: `${PLAN}. Please plan our days day by day.`,
  httpReq: { headers: {} },
});
assert.equal(skipped.reason, 'no_intent');
assert.equal(skipped.replyContext || '', '');
const stillEdit = await runChatItineraryEditTurn({
  db: null,
  trip: { id: 'trip-1', shareToken: 'lane-test-slug' },
  customerTurn: 'move dinner at Carbone to 8:30 PM on Day 2',
  httpReq: { headers: {} },
});
assert.equal(stillEdit.reason, 'web_edit_access_required');

function planDb(startDate, priorBody) {
  return async (strings) => {
    const sql = strings.join(' ');
    if (sql.includes('transcript_turns')) return [{ speaker: 'app', body: priorBody }];
    if (sql.includes('from trips')) return [{ start_date: startDate }];
    throw new Error(`Unhandled test SQL: ${sql}`);
  };
}

const described = await plannedCustomerThings(planDb('2026-06-10', ''), 'vac-1', 'plan our days day by day', DRAFT, []);
const saved = keepPlannedDays(mergeWantedThings([], described), described).map((thing) => {
  const slot = scheduleChatThing(thing, { start_date: '2026-06-10', end_date: '2026-06-12' });
  return { ...thing, starts_at: slot.starts_at, whenLabel: slot.whenLabel || thing.whenLabel };
});
assert.deepEqual(saved.map((thing) => thing.title), ['Harbor Hotel', 'Dinner at Harbor Bistro', 'Flight to Lisbon']);
assert.deepEqual(saved.map((thing) => thing.category), ['hotel', 'restaurant', 'flight']);
assert.deepEqual(saved.map((thing) => thing.dayNumber), [1, 1, 2]);
assert.equal(saved[0].starts_at, '2026-06-10T12:00:00.000Z');
assert.equal(saved[2].starts_at, '2026-06-11T12:00:00.000Z');
for (const thing of saved) {
  assert.equal(thing.price, undefined);
  assert.equal(thing.rating, undefined);
  assert.equal(thing.logoUrl, undefined);
  const meta = chatSaveMetadata(thing, { whenLabel: thing.whenLabel, customerWhen: thing.customerWhen, starts_at: thing.starts_at });
  assert.equal(meta.dayNumber, thing.dayNumber);
  assert.equal(meta.price, undefined);
}
const confirmed = await plannedCustomerThings(planDb('2026-06-10', DRAFT), 'vac-1', 'yes, save that plan', 'Saved.', []);
assert.equal(confirmed.length, 3);
assert.equal(confirmed[0].dayNumber, 1);
assert.equal(plannedItineraryItems('yes').length, 0);
const bareYes = await plannedCustomerThings(planDb('2026-06-10', DRAFT), 'vac-1', 'yes', '', []);
assert.equal(bareYes.length, 0);

const recovered = recoverOrdinaryPlanningReply({
  reply: '',
  reason: 'app reply text is empty',
  model: { backend: 'vk_bot_mcp', via: 'vk_bot_mcp', responseModel: 'anthropic/claude-haiku-5.5' },
}, PLAN, { backend: 'vk_bot_mcp', previousReply: DRAFT });
assert.equal(recovered.reason, null);
assert.match(recovered.reply, /Harbor Hotel/);
assert.equal(recovered.quality.judged, true);
assert.doesNotMatch(recovered.reply, /doesn't book reservations directly/i);
assert.doesNotMatch(recovered.reply, /Ready to import into/i);
assert.equal(recovered.model.cost.status, 'unmeasured');
const empty = recoverOrdinaryPlanningReply({ reply: null, reason: 'app reply text is empty', model: { backend: 'vk_bot_mcp' } }, DECLINE, { backend: 'vk_bot_mcp' });
assert.equal(empty.reason, null);
assert.match(empty.reply, /could not finish that planning reply/i);
assert.doesNotMatch(empty.reply, /app reply text is empty/);
assert.equal(String(empty.reply || '').trim().length > 0, true);

function storedTurn(cost) {
  const record = liveTurnRecord({
    turnIndex: 2,
    role: 'app',
    modality: 'text',
    text: DRAFT,
    at: '2026-11-24T12:00:00.000Z',
    latencyMs: 20,
    sessionE2eMs: 30,
    jev: { jevRan: false },
    model: {
      called: true,
      via: 'vk_bot_mcp',
      backend: 'vk_bot_mcp',
      responseModel: 'anthropic/claude-haiku-5.5',
      cost,
      quality: { judged: true, score: 4 },
    },
    backend: 'vk_bot_mcp',
  });
  return liveTranscriptFromRows({
    session: { token: 'session-plan' },
    rows: [{ body: DRAFT, payload: { liveTranscript: record } }],
  }).turns[0];
}

const measured = readStoredCost(storedTurn({
  status: 'measured',
  dollars: null,
  currency: null,
  source: 'vk_bot_usage',
  promptTokens: 10,
  completionTokens: 8,
  totalTokens: 18,
  usagePercentDelta: null,
  replyCount: 1,
  wallMs: 12,
}), 'vk_bot_mcp');
assert.equal(measured.gap, '');
assert.equal(measured.state, 'measured');
assert.equal(measured.amount, 18);
const unmeasured = readStoredCost(storedTurn(null), 'vk_bot_mcp');
assert.equal(unmeasured.state, 'unmeasured');
assert.equal(unmeasured.gap, '');
const percent = readStoredCost(storedTurn({
  status: 'measured',
  dollars: null,
  currency: null,
  source: 'vk_bot_usage',
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  usagePercentDelta: 0.25,
  replyCount: 1,
  wallMs: 12,
}), 'vk_bot_mcp');
assert.equal(percent.gap, '');
assert.equal(percent.unit, 'percent');
assert.equal(percent.amount, 0.25);

console.log('chat plan persist #1126 passed');
