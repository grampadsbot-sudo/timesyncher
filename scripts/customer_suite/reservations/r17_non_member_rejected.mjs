import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r17');
try {
  const outConn = await ctx.apiCall('/api/mcp/reservations/connections', {
    method: 'POST',
    webToken: ctx.outsider.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  });
  assert.equal(outConn.status, 403);

  const outReq = await ctx.apiCall('/api/mcp/reservations/requests', {
    method: 'POST',
    webToken: ctx.outsider.webToken,
    body: { shareToken: ctx.vacation1.shareToken, venueName: 'Unauthorized Venue' },
  });
  assert.equal(outReq.status, 403);

  const outList = await ctx.apiCall(`/api/mcp/reservations/requests?shareToken=${encodeURIComponent(ctx.vacation1.shareToken)}`, {
    webToken: ctx.outsider.webToken,
  });
  assert.equal(outList.status, 403);

  const collabConn = await ctx.apiCall('/api/mcp/reservations/connections', {
    method: 'POST',
    webToken: ctx.collaborator.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  });
  assert.equal(collabConn.status, 201);

  const collabReq = await ctx.apiCall('/api/mcp/reservations/requests', {
    method: 'POST',
    webToken: ctx.collaborator.webToken,
    body: { shareToken: ctx.vacation1.shareToken, venueName: 'Via Carota', time: '7:00 PM', partySize: 4 },
  });
  assert.equal(collabReq.status, 201);

  const collabList = await ctx.apiCall(`/api/mcp/reservations/requests?shareToken=${encodeURIComponent(ctx.vacation1.shareToken)}`, {
    webToken: ctx.collaborator.webToken,
  });
  assert.equal(collabList.status, 200);
  assert.ok((collabList.json.requests || []).some((r) => /Via Carota/i.test(r.venue_name)));
  console.log('r17_non_member_rejected passed');
} finally {
  await ctx.cleanup();
}
