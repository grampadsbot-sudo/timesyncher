import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r11');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'manual' } }, token);

  const found = await ctx.mcpRpc('tools/call', { name: 'find_vacation', arguments: { query: 'New York' } }, token);
  assert.equal(found.status, 200);
  const match = found.json.result.structuredContent.vacations.find((v) => v.vacation_id === ctx.vacation1.id);
  assert.ok(match, 'find_vacation must locate the NYC vacation');

  const direct = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      vacation_id: match.vacation_id,
      status: 'confirmed',
      venue_name: 'Lilia',
      category: 'restaurant',
      date: '2026-07-09',
      time: '7:30 PM',
      party_size: 4,
      confirmation_number: 'LIL-4402',
      notes: 'Counter seats requested',
    },
  }, token);
  assert.equal(direct.status, 200);
  assert.equal(direct.json.result.structuredContent.status, 'booked');
  assert.equal(direct.json.result.structuredContent.published, true);

  const shared = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`);
  const lilia = (shared.json.places || []).find((p) => /Lilia/i.test(p.name));
  assert.ok(lilia, 'ask-your-AI-first booking must create Thing live');
  assert.equal(lilia.booked_by_ai, true);
  assert.equal(lilia.confirmation_number, 'LIL-4402');

  const loaded = await ctx.chatLoad(ctx.owner.appSession, ctx.vacation1.id);
  assert.ok((loaded.json.turns || []).some((t) => t.payload?.reservationCard?.status === 'booked' && /LIL-4402/.test(t.body)));
  console.log('r11_ask_your_ai_first passed');
} finally {
  await ctx.cleanup();
}
