import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r01');
try {
  const res = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 on Wednesday');
  assert.equal(res.status, 201);
  assert.equal(res.json.ok, true);
  assert.match(res.json.reply, /doesn't book reservations directly/i);
  assert.match(res.json.reply, /your own AI/i);
  assert.match(res.json.reply, /vacation/i);
  assert.match(res.json.reply, /set up/i);
  assert.doesNotMatch(res.json.reply, /\btrips?\b/i);
  assert.equal(res.json.reservationCard?.kind, 'ai_reservation_offer');
  console.log('r01_ask_offer passed');
} finally {
  await ctx.cleanup();
}
