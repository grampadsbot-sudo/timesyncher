import assert from 'node:assert/strict';
import { createReservationsSuiteContext } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r13');
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
    body: { shareToken: ctx.vacation1.shareToken, label: 'Reservations Token' },
  });
  assert.equal(res.status, 201);
  const resToken = res.json.token;

  for (const tool of ['register_reservations_handshake', 'list_vacations', 'find_vacation', 'list_reservation_requests', 'submit_reservation_result']) {
    const call = await ctx.mcpRpc('tools/call', { name: tool, arguments: {} }, importToken);
    assert.equal(call.status, 403, `import token must receive 403 on ${tool}`);
  }
  for (const tool of ['describe_import_format', 'start_import', 'upload_media', 'preview_import', 'commit_import', 'read_vacation', 'update_vacation']) {
    const call = await ctx.mcpRpc('tools/call', { name: tool, arguments: {} }, resToken);
    assert.equal(call.status, 403, `reservations token must receive 403 on ${tool}`);
  }
  console.log('r13_token_scope_isolation passed');
} finally {
  await ctx.cleanup();
}
