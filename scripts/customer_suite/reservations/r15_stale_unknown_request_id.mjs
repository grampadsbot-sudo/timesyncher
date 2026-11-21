import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r15');
try {
  const res = await ctx.apiCall('/api/mcp/reservations/connections', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  });
  const resToken = res.json.token;
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'manual' } }, resToken);

  const before = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`);

  const unknown = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: crypto.randomUUID(), status: 'confirmed', confirmation_number: 'UNKNOWN-1' },
  }, resToken);
  assert.equal(unknown.status, 404);

  const req1 = await ctx.apiCall('/api/mcp/reservations/requests', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken, venueName: 'Balthazar', time: '7:00 PM', partySize: 2 },
  });
  const req1Id = req1.json.request.request_id;
  assert.equal((await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: req1Id, status: 'confirmed', confirmation_number: 'BAL-1' },
  }, resToken)).status, 200);

  const repeat = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: req1Id, status: 'confirmed', confirmation_number: 'BAL-2' },
  }, resToken);
  assert.equal(repeat.status, 409);

  const req2 = await ctx.apiCall('/api/mcp/reservations/requests', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken, venueName: 'Pastis', time: '8:00 PM', partySize: 2 },
  });
  const req2Id = req2.json.request.request_id;
  assert.equal((await ctx.apiCall(`/api/mcp/reservations/requests/${encodeURIComponent(req2Id)}/cancel`, {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  })).status, 200);

  const cancelled = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: req2Id, status: 'confirmed', confirmation_number: 'PAS-1' },
  }, resToken);
  assert.equal(cancelled.status, 409);

  const after = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/`);
  assert.equal((after.json.places || []).some((p) => /Pastis/i.test(p.name)), false);
  assert.ok((before.json.places || []).length <= (after.json.places || []).length);
  console.log('r15_stale_unknown_request_id passed');
} finally {
  await ctx.cleanup();
}
