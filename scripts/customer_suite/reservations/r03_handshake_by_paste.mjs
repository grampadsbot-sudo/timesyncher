import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r03');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 on Wednesday');
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');

  const malformed = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, '{ "mode": "webhook", "webhook_url": "not-valid" }');
  assert.equal(malformed.status, 201);
  assert.equal(malformed.json.reservationCard?.kind, 'ai_reservation_handshake_error');
  assert.doesNotMatch(malformed.json.reply, /Error:|SyntaxError|at\s+\w+\s*\(|\{/);

  const aRes = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, JSON.stringify({ mode: 'webhook', webhook_url: ctx.webhook.url }));
  assert.equal(aRes.json.reservationCard?.kind, 'ai_reservation_connected');
  assert.equal(aRes.json.reservationCard?.mode, 'webhook');

  const bRes = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Option (b) polling every 15 minutes');
  assert.equal(bRes.json.reservationCard?.kind, 'ai_reservation_connected');
  assert.equal(bRes.json.reservationCard?.mode, 'polling');
  assert.equal(bRes.json.reservationCard?.pollIntervalMinutes, 15);

  const cRes = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Option (c) manual');
  assert.equal(cRes.json.reservationCard?.kind, 'ai_reservation_connected');
  assert.equal(cRes.json.reservationCard?.mode, 'manual');

  console.log('r03_handshake_by_paste passed');
} finally {
  await ctx.cleanup();
}
