import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r16');
try {
  const res = await ctx.apiCall('/api/mcp/reservations/connections', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  });
  const resToken = res.json.token;
  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'manual' } }, resToken);

  const before = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.outsiderVacation.shareToken)}/`);

  const readCross = await ctx.mcpRpc('tools/call', {
    name: 'list_reservation_requests',
    arguments: { vacation_id: ctx.outsiderVacation.id },
  }, resToken);
  assert.equal(readCross.status, 403);

  const submitCross = await ctx.mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      vacation_id: ctx.outsiderVacation.id,
      venue_name: 'Canlis',
      status: 'confirmed',
      confirmation_number: 'CROSS-999',
    },
  }, resToken);
  assert.equal(submitCross.status, 403);

  const after = await ctx.apiCall(`/api/shared/${encodeURIComponent(ctx.outsiderVacation.shareToken)}/`);
  assert.equal((after.json.places || []).length, (before.json.places || []).length);
  console.log('r16_cross_account_vacation_rejected passed');
} finally {
  await ctx.cleanup();
}
