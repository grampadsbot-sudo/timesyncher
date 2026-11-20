import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import {
  VACATION_IMPORT_EXAMPLE,
  VACATION_IMPORT_FORMAT_SCHEMA,
  validateVacationImportDocument,
} from '../src/vacation/mcp-schema.mjs';
import { MCP_TOOLS } from '../src/vacation/mcp-tools.mjs';
import {
  extractExifFromBuffer,
  normalizeExifTimestamp,
  resolveLocalCaptureDate,
  resolveMediaDayAssignment,
} from '../src/vacation/mcp-exif.mjs';
import { vacationShareSlugForRow } from '../src/vacation/mcp-read.mjs';
import { hashMcpToken } from '../src/vacation/mcp-tokens.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { buildJpegWithExif, buildPlainJpeg, invokeRoute } from './lib/mcp-test-exif.mjs';

const EXPECTED_TOOLS = [
  'describe_import_format',
  'start_import',
  'upload_media',
  'preview_import',
  'commit_import',
  'read_vacation',
  'update_vacation',
];

async function mcpRpc(method, params = {}, token = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp',
    headers,
    body: { jsonrpc: '2.0', id: 'req-1', method, params },
  });
}

async function createTokenViaApp(db, { trip, editorSession, label = 'Family AI', role = 'collaborator' }) {
  const res = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/tokens',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': editorSession },
    body: { tripId: trip.id, label, role },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json.ok, true);
  assert.ok(res.json.token);
  const stored = db.tables.vacation_mcp_tokens.find((row) => row.id === res.json.record.id);
  assert.equal(stored.token_hash, hashMcpToken(res.json.token, process.env));
  assert.equal(JSON.stringify(stored).includes(res.json.token), false);
  return { token: res.json.token, record: res.json.record };
}

async function test_A1_list_tools_and_describe_import_format() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'Coastal Break', destination: 'Astoria, OR', startDate: '2026-07-03', endDate: '2026-07-05' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a1', shareSlug: tripA.metadata.publicSlug });
  assert.equal(vacationShareSlugForRow(tripA), tripA.metadata.publicSlug);

  const discovery = await invokeRoute(apiHandler, { method: 'GET', url: '/api/mcp' });
  assert.equal(discovery.statusCode, 200);
  assert.equal(discovery.json.tools.length, 7);

  const listRes = await mcpRpc('tools/list', {});
  assert.equal(listRes.statusCode, 200);
  assert.deepEqual(listRes.json.result.tools.map((tool) => tool.name), EXPECTED_TOOLS);
  for (const tool of listRes.json.result.tools) {
    assert.ok(tool.description.length > 15);
    assert.equal(tool.inputSchema.type, 'object');
  }

  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a1', role: 'owner' });
  const descRes = await mcpRpc('tools/call', { name: 'describe_import_format', arguments: {} }, token);
  assert.equal(descRes.statusCode, 200);
  const payload = descRes.json.result.structuredContent;
  assert.deepEqual(payload.schema, VACATION_IMPORT_FORMAT_SCHEMA);
  assert.deepEqual(payload.example, VACATION_IMPORT_EXAMPLE);
  const validation = validateVacationImportDocument(payload.example);
  assert.equal(validation.valid, true, validation.errors.join(', '));
  assert.equal(MCP_TOOLS.length, 7);
}

async function test_A2_draft_import_staged_until_approve() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  setVacationMcpClock(() => new Date('2026-07-10T18:00:00.000Z'));

  const tripA = db.seedVacation({ title: 'Existing Vacation A', destination: 'Bend, OR', startDate: '2026-06-01', endDate: '2026-06-03' });
  db.seedThing({ tripId: tripA.id, category: 'restaurant', title: 'Existing Cafe' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a2', shareSlug: tripA.metadata.publicSlug });
  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a2', role: 'owner' });

  const liveBefore = db.liveSnapshot();
  const startRes = await mcpRpc('tools/call', { name: 'start_import', arguments: VACATION_IMPORT_EXAMPLE }, token);
  const draftId = startRes.json.result.structuredContent.draft_id;
  assert.equal(startRes.statusCode, 200);
  assert.equal(db.liveSnapshot(), liveBefore);

  const reqUpload = await mcpRpc('tools/call', {
    name: 'upload_media',
    arguments: { action: 'request_upload', draft_id: draftId, files: [{ filename: 'column-sunset.jpg', mime_type: 'image/jpeg', caption: 'Tower view', thing_ref: 'item-column' }] },
  }, token);
  const uploadSlot = reqUpload.json.result.structuredContent.uploads[0];
  const uploadUrl = new URL(uploadSlot.upload_url);
  const photoBytes = buildJpegWithExif({ dateTimeOriginal: '2026:07:04 02:30:00', offsetTimeOriginal: '+00:00' });
  assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: uploadUrl.pathname + uploadUrl.search, headers: { 'content-type': 'image/jpeg' }, body: photoBytes })).statusCode, 200);

  const finRes = await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'finalize', draft_id: draftId, media_ids: [uploadSlot.media_id] } }, token);
  assert.equal(finRes.statusCode, 200);
  assert.equal(finRes.json.result.structuredContent.finalized[0].assigned_day_date, '2026-07-03');
  assert.equal(db.liveSnapshot(), liveBefore);

  const previewRes = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, token);
  const preview = previewRes.json.result.structuredContent.preview;
  assert.equal(preview.will_create.vacation.title, 'Astoria Coast Weekend');
  assert.equal(preview.counts.media, 1);
  assert.equal(db.liveSnapshot(), liveBefore);

  const commitRes = await mcpRpc('tools/call', { name: 'commit_import', arguments: { draft_id: draftId } }, token);
  assert.equal(commitRes.json.result.structuredContent.status, 'pending_approval');
  assert.equal(commitRes.json.result.structuredContent.published, false);
  assert.equal(db.liveSnapshot(), liveBefore);

  const approveRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${draftId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a2' },
    body: { tripId: tripA.id },
  });
  assert.equal(approveRes.statusCode, 200);
  const publishedId = approveRes.json.publishedVacationId;
  const publishedTrip = db.tables.trips.find((t) => t.id === publishedId);
  assert.equal(publishedTrip.title, preview.will_create.vacation.title);
  const publishedThings = db.tables.trip_things.filter((r) => r.trip_id === publishedId);
  const expectedItems = preview.counts.flights + preview.counts.hotels + preview.counts.cars + preview.counts.restaurants + preview.counts.things_to_do + preview.counts.notes;
  assert.equal(publishedThings.length, expectedItems);
  const publishedMedia = db.tables.thing_media_bindings.filter((m) => m.share_token === publishedTrip.metadata.publicSlug);
  assert.equal(publishedMedia.length, 1);
  assert.equal(publishedMedia[0].metadata.assignedDayDate, '2026-07-03');
  setVacationMcpClock(null);
}

async function test_A3_decline_leaves_live_unchanged() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'Decline Test Vacation', destination: 'Hood River, OR', startDate: '2026-08-01', endDate: '2026-08-03' });
  db.seedThing({ tripId: tripA.id, category: 'hotel', title: 'River Lodge' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a3', shareSlug: tripA.metadata.publicSlug });
  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a3', role: 'owner' });

  const liveBefore = db.liveSnapshot();
  const startRes = await mcpRpc('tools/call', { name: 'start_import', arguments: VACATION_IMPORT_EXAMPLE }, token);
  const draftId = startRes.json.result.structuredContent.draft_id;
  await mcpRpc('tools/call', { name: 'commit_import', arguments: { draft_id: draftId } }, token);

  const declineRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${draftId}/decline`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a3' },
    body: { tripId: tripA.id, reason: 'Not needed' },
  });
  assert.equal(declineRes.statusCode, 200);
  assert.equal(declineRes.json.status, 'declined');
  assert.equal(db.liveSnapshot(), liveBefore);
  assert.equal(db.tables.vacation_mcp_change_sets.find((c) => c.id === draftId).status, 'declined');
}

async function test_A4_cross_vacation_token_isolation_all_tools() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'Vacation A', destination: 'Newport, OR', startDate: '2026-09-01', endDate: '2026-09-03' });
  const tripB = db.seedVacation({ title: 'Vacation B', destination: 'Carmel, CA', startDate: '2026-10-01', endDate: '2026-10-03' });
  const thingB = db.seedThing({ tripId: tripB.id, category: 'restaurant', title: 'Bistro B' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'collab@example.com', role: 'web_editor', sessionToken: 'sess-a4-a', shareSlug: tripA.metadata.publicSlug });
  db.seedEditorSession({ tripId: tripB.id, ownerCustomerId: tripB.customer_id, email: 'ownerb@example.com', role: 'owner', sessionToken: 'sess-a4-b', shareSlug: tripB.metadata.publicSlug });

  const { token: tokenA } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a4-a', role: 'collaborator' });
  const { token: tokenB } = await createTokenViaApp(db, { trip: tripB, editorSession: 'sess-a4-b', role: 'owner' });
  const draftBId = (await mcpRpc('tools/call', { name: 'start_import', arguments: VACATION_IMPORT_EXAMPLE }, tokenB)).json.result.structuredContent.draft_id;

  const crossCalls = [
    { name: 'describe_import_format', arguments: { vacation_id: tripB.id } },
    { name: 'start_import', arguments: { vacation_id: tripB.id, ...VACATION_IMPORT_EXAMPLE } },
    { name: 'upload_media', arguments: { vacation_id: tripB.id, draft_id: draftBId, files: [{ filename: 'a.jpg', mime_type: 'image/jpeg' }] } },
    { name: 'preview_import', arguments: { draft_id: draftBId } },
    { name: 'commit_import', arguments: { draft_id: draftBId } },
    { name: 'read_vacation', arguments: { vacation_id: tripB.id } },
    { name: 'update_vacation', arguments: { vacation_id: tripB.id, operations: [{ op: 'remove_item', item_id: thingB.id }] } },
    { name: 'update_vacation', arguments: { operations: [{ op: 'remove_item', item_id: thingB.id }] } },
  ];

  for (const call of crossCalls) {
    const res = await mcpRpc('tools/call', call, tokenA);
    assert.equal(res.statusCode, 403, `Expected 403 for ${call.name} on Vacation B`);
    assert.equal(res.json.error.data.code, 'vacation_scope_mismatch');
  }
}

async function test_A5_revoked_token_rejected_all_tools() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'Revoke Test Vacation', destination: 'Ashland, OR', startDate: '2026-09-10', endDate: '2026-09-12' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a5', shareSlug: tripA.metadata.publicSlug });
  const { token, record } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a5', role: 'owner' });

  const revokeRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/tokens/${record.id}/revoke`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a5' },
    body: { tripId: tripA.id },
  });
  assert.equal(revokeRes.statusCode, 200);
  assert.equal((await mcpRpc('tools/list', {}, token)).statusCode, 401);

  for (const toolName of EXPECTED_TOOLS) {
    const res = await mcpRpc('tools/call', { name: toolName, arguments: {} }, token);
    assert.equal(res.statusCode, 401, `Revoked token must be rejected on ${toolName}`);
    assert.equal(res.json.error.data.code, 'mcp_token_revoked');
  }
}

async function test_A6_targeted_update_vacation_byte_identical_untouched_rows() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'Targeted Edit Vacation', destination: 'Monterey, CA', startDate: '2026-07-03', endDate: '2026-07-05' });
  const untouchedHotel = db.seedThing({ tripId: tripA.id, category: 'hotel', title: 'Bay View Inn', description: 'Keep byte identical', costEstimateCents: 64000, metadata: { keep: 'exact-value', nested: { a: 1 } } });
  const editRestaurant = db.seedThing({ tripId: tripA.id, category: 'restaurant', title: 'Old Pier Grill', description: 'Original description', costEstimateCents: 8000 });
  const removeNote = db.seedThing({ tripId: tripA.id, category: 'note', title: 'Obsolete Reminder', description: 'Drop this' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a6', shareSlug: tripA.metadata.publicSlug });
  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a6', role: 'owner' });

  const readRes = await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, token);
  assert.equal(readRes.json.result.structuredContent.hotels[0].id, untouchedHotel.id);

  const wholesaleRes = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: { replace_all: true, operations: [{ op: 'remove_item', item_id: removeNote.id }] },
  }, token);
  assert.equal(wholesaleRes.statusCode, 400);
  assert.equal(wholesaleRes.json.error.data.code, 'wholesale_overwrite_forbidden');

  const untouchedBefore = JSON.stringify(db.tables.trip_things.find((r) => r.id === untouchedHotel.id));
  const liveBefore = db.liveSnapshot();
  const updateRes = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: {
      summary: 'Update dinner spot, add kayak tour, remove old reminder',
      operations: [
        { op: 'update_item', item_id: editRestaurant.id, patch: { title: 'Harbor Bistro', total_price_cents: 11000 } },
        { op: 'add_item', item: { category: 'activity', title: 'Morning Kayak Tour', day_date: '2026-07-04', total_price_cents: 12000 } },
        { op: 'remove_item', item_id: removeNote.id },
        { op: 'update_day', day_date: '2026-07-04', patch: { title: 'Waterfront Day', notes: 'Kayaking at 9am.' } },
      ],
    },
  }, token);
  const changeSetId = updateRes.json.result.structuredContent.change_set_id;
  assert.equal(db.liveSnapshot(), liveBefore);

  assert.equal((await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${changeSetId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a6' },
    body: { tripId: tripA.id },
  })).statusCode, 200);

  assert.equal(JSON.stringify(db.tables.trip_things.find((r) => r.id === untouchedHotel.id)), untouchedBefore);
  assert.equal(db.tables.trip_things.find((r) => r.id === editRestaurant.id).title, 'Harbor Bistro');
  assert.equal(db.tables.trip_things.find((r) => r.id === editRestaurant.id).cost_estimate_cents, 11000);
  assert.equal(db.tables.trip_things.find((r) => r.id === removeNote.id), undefined);
  assert.ok(db.tables.trip_things.find((r) => r.title === 'Morning Kayak Tour'));
  const readAfter = await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, token);
  assert.equal(readAfter.json.result.structuredContent.days.find((d) => d.date === '2026-07-04').title, 'Waterfront Day');
}

async function test_A7_exif_timezone_day_assignment_and_usage_bytes() {
  const exifJpeg = buildJpegWithExif({ dateTimeOriginal: '2026:07:04 02:30:00', offsetTimeOriginal: '+00:00', lat: 46.1879, lng: -123.8313 });
  const parsed = extractExifFromBuffer(exifJpeg);
  assert.equal(parsed.hasExif, true);
  assert.equal(parsed.capturedAtIso, '2026-07-04T02:30:00.000Z');
  assert.ok(Math.abs(parsed.lat - 46.1879) < 0.01 && Math.abs(parsed.lng + 123.8313) < 0.01);
  assert.equal(normalizeExifTimestamp('2026:07:04 02:30:00', '+00:00'), '2026-07-04T02:30:00.000Z');
  assert.equal(resolveLocalCaptureDate({ capturedAt: parsed.capturedAtIso, vacationTimeZone: 'America/Los_Angeles' }), '2026-07-03');

  const assigned = resolveMediaDayAssignment({ capturedAt: parsed.capturedAtIso, vacationTimeZone: 'America/Los_Angeles', dayDates: ['2026-07-03', '2026-07-04', '2026-07-05'] });
  assert.equal(assigned.bucket, 'day');
  assert.equal(assigned.dayDate, '2026-07-03');
  assert.equal(assigned.dayNumber, 1);

  const plainJpeg = buildPlainJpeg();
  const unassigned = resolveMediaDayAssignment({ capturedAt: extractExifFromBuffer(plainJpeg).capturedAtIso, vacationTimeZone: 'America/Los_Angeles', dayDates: ['2026-07-03', '2026-07-04'] });
  assert.equal(unassigned.bucket, 'unassigned');
  assert.equal(unassigned.dayDate, null);

  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const tripA = db.seedVacation({ title: 'EXIF Usage Vacation', destination: 'Astoria, OR', startDate: '2026-07-03', endDate: '2026-07-05', timezone: 'America/Los_Angeles' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a7', shareSlug: tripA.metadata.publicSlug });
  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a7', role: 'owner' });

  const [slot1, slot2] = (await mcpRpc('tools/call', {
    name: 'upload_media',
    arguments: { files: [{ filename: 'with-exif.jpg', mime_type: 'image/jpeg' }, { filename: 'no-exif.jpg', mime_type: 'image/jpeg' }] },
  }, token)).json.result.structuredContent.uploads;
  const u1 = new URL(slot1.upload_url);
  const u2 = new URL(slot2.upload_url);
  assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: u1.pathname + u1.search, headers: { 'content-type': 'image/jpeg' }, body: exifJpeg })).statusCode, 200);
  assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: u2.pathname + u2.search, headers: { 'content-type': 'image/jpeg' }, body: plainJpeg })).statusCode, 200);

  const fin = await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'finalize', media_ids: [slot1.media_id, slot2.media_id] } }, token);
  const [f1, f2] = fin.json.result.structuredContent.finalized;
  assert.equal(f1.assignment_bucket, 'day');
  assert.equal(f1.assigned_day_date, '2026-07-03');
  assert.equal(f2.assignment_bucket, 'unassigned');
  assert.equal(fin.json.result.structuredContent.vacation_media_usage.total_bytes, exifJpeg.length + plainJpeg.length);
  assert.equal(fin.json.result.structuredContent.vacation_media_usage.media_count, 2);
}

async function test_A8_signed_upload_url_no_mcp_bytes_and_expiry() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  let nowMs = Date.parse('2026-07-10T18:00:00.000Z');
  setVacationMcpClock(() => new Date(nowMs));

  const tripA = db.seedVacation({ title: 'Upload Guard Vacation', destination: 'Bend, OR', startDate: '2026-07-03', endDate: '2026-07-05' });
  db.seedEditorSession({ tripId: tripA.id, ownerCustomerId: tripA.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-a8', shareSlug: tripA.metadata.publicSlug });
  const { token } = await createTokenViaApp(db, { trip: tripA, editorSession: 'sess-a8', role: 'owner' });

  const rejectedBytes = await mcpRpc('tools/call', { name: 'upload_media', arguments: { files: [{ filename: 'pic.jpg', mime_type: 'image/jpeg', base64: 'AAAA' }] } }, token);
  assert.equal(rejectedBytes.statusCode, 400);
  assert.equal(rejectedBytes.json.error.data.code, 'media_bytes_not_allowed_in_mcp');

  const rejectedDataUrl = await mcpRpc('tools/call', { name: 'upload_media', arguments: { files: [{ filename: 'pic.jpg', mime_type: 'image/jpeg', caption: 'data:image/jpeg;base64,/9j/4AAQ' }] } }, token);
  assert.equal(rejectedDataUrl.statusCode, 400);

  const slot = (await mcpRpc('tools/call', { name: 'upload_media', arguments: { files: [{ filename: 'sunset.jpg', mime_type: 'image/jpeg' }] } }, token)).json.result.structuredContent.uploads[0];
  const parsedUrl = new URL(slot.upload_url);
  assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: `${parsedUrl.pathname}?exp=${parsedUrl.searchParams.get('exp')}&sig=tampered`, headers: { 'content-type': 'image/jpeg' }, body: buildPlainJpeg() })).statusCode, 403);

  nowMs += 1000 * 1000;
  const expired = await invokeRoute(apiHandler, { method: 'PUT', url: parsedUrl.pathname + parsedUrl.search, headers: { 'content-type': 'image/jpeg' }, body: buildPlainJpeg() });
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.json.code, 'upload_url_expired');
  setVacationMcpClock(null);
}

async function test_A9_copy_rules_no_trip_travel_si() {
  const filesToScan = [
    '../src/vacation/mcp-schema.mjs',
    '../src/vacation/mcp-tools.mjs',
    '../src/vacation/mcp-preview.mjs',
    '../apps/vacation-client/src/components/McpApprovalPanel.tsx',
    '../apps/vacation-client/src/lib/mcpPanelModel.mjs',
    '../apps/vacation-client/src/api/mcpAdmin.ts',
  ];
  const banned = [['trip', /\btrips?\b/i], ['travel', /\btravel\w*\b/i], ['SI', /\bSI\b/]];
  const serializedTools = JSON.stringify({ tools: MCP_TOOLS, schema: VACATION_IMPORT_FORMAT_SCHEMA, example: VACATION_IMPORT_EXAMPLE });
  for (const [label, pattern] of banned) assert.doesNotMatch(serializedTools, pattern, `MCP schema contained "${label}"`);
  for (const rel of filesToScan) {
    const content = await readFile(new URL(rel, import.meta.url), 'utf8');
    const literals = [...content.matchAll(/(?:'([^'\\\n]*)'|"([^"\\\n]*)"|>([^<>{}\n]+)<)/g)]
      .map((match) => (match[1] ?? match[2] ?? match[3] ?? '').trim())
      .filter((text) => text.length > 1 && !text.startsWith('./') && !text.startsWith('../') && !text.startsWith('/api/'));
    for (const literal of literals) {
      for (const [label, pattern] of banned) assert.doesNotMatch(literal, pattern, `${rel} contained "${label}": "${literal}"`);
    }
  }
}

await test_A1_list_tools_and_describe_import_format();
await test_A2_draft_import_staged_until_approve();
await test_A3_decline_leaves_live_unchanged();
await test_A4_cross_vacation_token_isolation_all_tools();
await test_A5_revoked_token_rejected_all_tools();
await test_A6_targeted_update_vacation_byte_identical_untouched_rows();
await test_A7_exif_timezone_day_assignment_and_usage_bytes();
await test_A8_signed_upload_url_no_mcp_bytes_and_expiry();
await test_A9_copy_rules_no_trip_travel_si();
useVacationMcpDatabase(null);
console.log('vacation mcp acceptance tests A1-A9 passed');
