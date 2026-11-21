import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r14');
try {
  const imp = await ctx.apiCall('/api/mcp/tokens', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken, label: 'Import Token', role: 'owner' },
  });
  assert.equal(imp.status, 201);
  const importToken = imp.json.token;

  const res = await ctx.apiCall('/api/mcp/reservations/connections', {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken, label: 'Reservations AI' },
  });
  assert.equal(res.status, 201);
  const resToken = res.json.token;
  const connId = res.json.record.id;

  await ctx.mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 10 } }, resToken);

  const collabAdmin = await ctx.apiCall(`/api/mcp/reservations/connections?shareToken=${encodeURIComponent(ctx.vacation1.shareToken)}&admin=1`, {
    webToken: ctx.collaborator.webToken,
  });
  assert.equal(collabAdmin.status, 403, 'collaborator must not access admin reservations connections');

  const sharedUrl = `${ctx.origin}/shared/${encodeURIComponent(ctx.vacation1.shareToken)}/?panel=reservations`;
  const collabShots = await ctx.captureViewports('r14-collab-admin-blocked', {
    url: sharedUrl,
    webToken: ctx.collaborator.webToken,
    prepare: async (page) => {
      await page.waitForSelector('[data-ts-mcp-admin-only="1"]', { timeout: 15000 });
    },
  });
  assert.equal(collabShots.length, 2);

  const ownerShots = await ctx.captureViewports('r14-owner-reservations-access', {
    url: sharedUrl,
    webToken: ctx.owner.webToken,
    prepare: async (page) => {
      await page.waitForSelector(`[data-ts-reservation-connection-row="${connId}"]`, { timeout: 15000 });
      const modeText = await page.$eval(`[data-ts-reservation-connection-row="${connId}"] [data-ts-reservation-mode="1"]`, (el) => el.textContent || '');
      const createdText = await page.$eval(`[data-ts-reservation-connection-row="${connId}"] [data-ts-reservation-created="1"]`, (el) => el.textContent || '');
      assert.match(modeText, /Scheduled polling.*10 min/i);
      assert.match(createdText, /Created \d{4}-\d{2}-\d{2}/);
    },
  });
  assert.equal(ownerShots.length, 2);

  const revoke = await ctx.apiCall(`/api/mcp/reservations/connections/${encodeURIComponent(connId)}/revoke`, {
    method: 'POST',
    webToken: ctx.owner.webToken,
    body: { shareToken: ctx.vacation1.shareToken },
  });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.json.record.status, 'revoked');

  const afterRevoke = await ctx.mcpRpc('tools/call', { name: 'list_vacations', arguments: {} }, resToken);
  assert.equal(afterRevoke.status, 401);

  const importOk = await ctx.mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, importToken);
  assert.equal(importOk.status, 200, 'import connection must remain unaffected');
  console.log('r14_revoke passed', ownerShots.map((s) => s.path).join(', '));
} finally {
  await ctx.cleanup();
}
