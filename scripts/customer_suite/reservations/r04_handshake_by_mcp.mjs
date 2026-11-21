import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r04');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8 on Wednesday');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);

  const hs = await ctx.mcpRpc('tools/call', {
    name: 'register_reservations_handshake',
    arguments: {
      mode: 'polling',
      poll_interval_minutes: 7,
      client_name: 'Fake Outside AI',
      vacation_id: ctx.vacation1.id,
    },
  }, token);
  assert.equal(hs.status, 200);
  assert.equal(hs.json.result.structuredContent.status, 'active');
  assert.equal(hs.json.result.structuredContent.mode, 'polling');
  assert.equal(hs.json.result.structuredContent.poll_interval_minutes, 7);

  const loaded = await ctx.chatLoad(ctx.owner.appSession, ctx.vacation1.id);
  const confirmTurn = (loaded.json.turns || []).find((t) => /You're set up for reservations/i.test(t.body));
  assert.ok(confirmTurn, 'VK chat must show handshake confirmation without paste');
  assert.match(confirmTurn.body, /within about 7 minutes/i);
  console.log('r04_handshake_by_mcp passed');
} finally {
  await ctx.cleanup();
}
