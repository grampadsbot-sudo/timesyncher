import assert from 'node:assert/strict';
import { createReservationsSuiteContext, extractBearerFromCopyText } from './lib.mjs';

const ctx = await createReservationsSuiteContext('r12');
try {
  await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'book Carbone');
  const setup = await ctx.chatSend(ctx.owner.appSession, ctx.vacation1.id, 'Yes');
  const token = extractBearerFromCopyText(setup.json.reservationCard.copyText);

  const listed = await ctx.mcpRpc('tools/list', {}, token);
  assert.equal(listed.status, 200);
  const tools = listed.json.result.tools || [];
  const names = tools.map((t) => t.name);
  for (const required of ['register_reservations_handshake', 'list_vacations', 'find_vacation', 'list_reservation_requests', 'submit_reservation_result']) {
    assert.ok(names.includes(required), `tools/list missing ${required}`);
  }
  for (const tool of tools) {
    assert.ok(String(tool.description || '').length > 20);
    assert.equal(tool.inputSchema?.type, 'object');
  }

  const resList = await ctx.mcpRpc('resources/list', {}, token);
  assert.equal(resList.status, 200);
  const howTo = (resList.json.result.resources || []).find((r) => /how-to/i.test(r.uri));
  assert.ok(howTo, 'how-to resource must be listed');

  const resRead = await ctx.mcpRpc('resources/read', { uri: howTo.uri }, token);
  assert.equal(resRead.status, 200);
  const text = resRead.json.result.contents?.[0]?.text || '';
  assert.match(text, /\(a\)/i);
  assert.match(text, /\(b\)/i);
  assert.match(text, /\(c\)/i);
  assert.match(text, /submit_reservation_result/);
  assert.match(text, /confirmation_number/);
  console.log('r12_discoverable passed');
} finally {
  await ctx.cleanup();
}
