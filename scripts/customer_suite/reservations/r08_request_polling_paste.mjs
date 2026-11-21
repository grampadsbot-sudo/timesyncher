import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r08');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);

  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 5 } }, token);
  const askPoll = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Balthazar for 4 at 7:00 PM');
  assert.equal(askPoll.json.reservationCard?.status, 'waiting');

  const listed = await ctx.mcpRpc('tools/call', { name: 'list_reservation_requests', arguments: { vacation_id: ctx.vacation1.id } }, token);
  assert.equal(listed.status, 200);
  assert.ok(listed.json.result.structuredContent.requests.some((r) => /Balthazar/i.test(r.venue_name) && r.status === 'waiting'));

  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'manual' } }, token);
  const askManual = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Via Carota for 2 at 6:30 PM');
  assert.equal(askManual.json.reservationCard?.status, 'waiting');
  assert.equal(askManual.json.reservationCard?.mode, 'manual');
  assert.equal(askManual.json.reservationCard?.manualPrompt, 'check my VK reservations');
  assert.match(askManual.json.reply, /check my VK reservations/i);
  console.log('r08_request_polling_paste passed');
} finally {
  await ctx.cleanup();
}
