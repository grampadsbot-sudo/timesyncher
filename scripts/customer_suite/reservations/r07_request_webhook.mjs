import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r07');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);

  const webhookUrl = process.env.WEBHOOK_PUBLIC_URL || ctx.webhook.url;
  const hs = await ctx.mcpRpc('tools/call', {
    name: 'register_reservations_handshake',
    arguments: { mode: 'webhook', webhook_url: webhookUrl },
  }, token);
  assert.equal(hs.status, 200);

  const ask = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 at 8:00 PM on 2026-07-08');
  assert.equal(ask.status, 201);
  assert.equal(ask.json.reservationCard?.status, 'waiting');
  if (!ctx.live || process.env.WEBHOOK_PUBLIC_URL) {
    assert.ok(ctx.webhook.received.length >= 1, 'webhook receiver must get ping');
    const ping = ctx.webhook.received[ctx.webhook.received.length - 1];
    assert.equal(ping.json.vacation_id, ctx.vacation1.id);
    assert.equal(ping.rawBody.includes(token), false, 'webhook body must never contain token');
    assert.equal(JSON.stringify(ping.headers).includes(token), false, 'webhook headers must never contain token');
  }
  console.log('r07_request_webhook passed');
} finally {
  await ctx.cleanup();
}
