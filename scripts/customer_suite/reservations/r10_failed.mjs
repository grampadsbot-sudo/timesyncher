import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r10');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 5 } }, token);

  const ask = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 at 8:00 PM');
  const reqId = ask.json.reservationCard.requestId;

  const failed = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      request_id: reqId,
      status: 'failed',
      reason: 'No tables available for 8 guests at 8:00 PM.',
      alternatives: ['Try 6:00 PM or 9:30 PM', 'Try Don Angie instead', 'Try again tomorrow'],
    },
  }, token);
  assert.equal(failed.status, 200);
  assert.equal(failed.json.result.structuredContent.status, 'failed');

  const shared = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`);
  const carbone = (shared.json.places || []).find((p) => /Carbone/i.test(p.name));
  assert.notEqual(carbone?.booked_by_ai, true, 'failed reservation must not mark Thing booked');

  const loaded = await ctx.chatLoad(ctx.owner.appSession, ctx.vacation1.id);
  const failTurn = (loaded.json.turns || []).find((t) => t.payload?.reservationCard?.status === 'failed');
  assert.ok(failTurn, 'chat must show failed reservation message');
  assert.match(failTurn.body, /No tables available/i);
  assert.ok(Array.isArray(failTurn.payload.reservationCard.alternatives) && failTurn.payload.reservationCard.alternatives.length >= 2);
  console.log('r10_failed passed');
} finally {
  await ctx.cleanup();
}
