import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r06');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 8');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 5 } }, token);

  const vacs = await ctx.mcpRpc('tools/call', { name: 'list_vacations', arguments: {} }, token);
  const ids = vacs.json.result.structuredContent.vacations.map((v) => v.vacation_id);
  assert.ok(ids.includes(ctx.vacation1.id), 'must include owned vacation');
  assert.ok(ids.includes(ctx.vacation2.id), 'must include collaborated vacation');

  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone for 4 at 8:00 PM');
  await ctx.chatSend(ctx.owner.collabAppSession, ctx.vacation2.id, 'book Bouchon for 2 at 7:00 PM');

  const reqs = await ctx.mcpRpc('tools/call', { name: 'list_reservation_requests', arguments: {} }, token);
  const list = reqs.json.result.structuredContent.requests;
  assert.ok(list.some((r) => r.vacation_id === ctx.vacation1.id && /Carbone/i.test(r.venue_name)));
  assert.ok(list.some((r) => r.vacation_id === ctx.vacation2.id && /Bouchon/i.test(r.venue_name)));
  console.log('r06_account_level passed');
} finally {
  await ctx.cleanup();
}
