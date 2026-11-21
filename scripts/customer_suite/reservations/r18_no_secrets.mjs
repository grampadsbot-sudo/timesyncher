import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r18');
try {
  const offer = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  assert.match(offer.json.reply, /vacation/i);
  assert.match(offer.json.reply, /\bAI\b/);
  assert.doesNotMatch(offer.json.reply, /\btrips?\b/i);

  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);
  assert.equal(setup.json.reply.includes(token), false);
  assert.doesNotMatch(setup.json.reply, /\btrips?\b/i);
  assert.doesNotMatch(setup.json.reservationCard.copyText, /\btrips?\b/i);

  const webhookUrl = process.env.WEBHOOK_PUBLIC_URL || ctx.webhook.url;
  await ctx.mcpRpc('tools/call', {
    name: 'register_reservations_handshake',
    arguments: { mode: 'webhook', webhook_url: webhookUrl },
  }, token);

  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 at 8:00 PM');

  const loaded = await ctx.chatLoad(ctx.owner.appSession, ctx.vacation1.id);
  const serializedTurns = JSON.stringify(loaded.json.turns || []);
  assert.equal(serializedTurns.includes(token), false, 'raw token must never appear in chat history');
  for (const turn of loaded.json.turns || []) {
    if (turn.speaker === 'app') {
      assert.doesNotMatch(String(turn.body || ''), /\btrips?\b/i, `app chat reply used trip: ${turn.body}`);
    }
  }

  for (const ping of ctx.webhook.received) {
    assert.equal(ping.rawBody.includes(token), false, 'raw token must never appear in webhook payload');
    assert.equal(JSON.stringify(ping.headers).includes(token), false, 'raw token must never appear in webhook headers');
  }

  const errResp = await ctx.mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, token);
  assert.equal(errResp.status, 403);
  assert.equal(JSON.stringify(errResp.json).includes(token), false, 'raw token must never appear in API error body');

  const badAuth = await ctx.mcpRpc('tools/call', { name: 'list_vacations', arguments: {} }, 'vkr_invalid_secret_sample_value');
  assert.equal(badAuth.status, 401);
  assert.equal(JSON.stringify(badAuth.json).includes('vkr_invalid_secret_sample_value'), false);
  console.log('r18_no_secrets passed');
} finally {
  await ctx.cleanup();
}
