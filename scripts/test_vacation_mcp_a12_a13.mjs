import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import sharedTripHandler, { intakeSharedResponse, useSharedTripDatabase } from '../src/vacation/shared-trip-handler.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { buildDayTimeline } from '../apps/vacation-client/src/lib/dayTimelineModel.mjs';
import { placesForCategoryTab } from '../apps/vacation-client/src/lib/listTabModel.mjs';
import { extractApprovalPreviewView } from '../apps/vacation-client/src/lib/mcpPanelModel.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { buildJpegWithExif, buildPlainJpeg, invokeRoute } from './lib/mcp-test-exif.mjs';

async function mcpRpc(method, params = {}, token = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp',
    headers,
    body: { jsonrpc: '2.0', id: 'req-a12', method, params },
  });
}

async function setupToken(db, { title, sessionToken }) {
  const trip = db.seedVacation({
    title,
    destination: 'Astoria, OR',
    startDate: '2026-07-03',
    endDate: '2026-07-05',
    timezone: 'America/Los_Angeles',
  });
  db.seedEditorSession({
    tripId: trip.id,
    ownerCustomerId: trip.customer_id,
    email: 'owner@example.com',
    role: 'owner',
    sessionToken,
    shareSlug: trip.metadata.publicSlug,
  });
  const res = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/tokens',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': sessionToken },
    body: { tripId: trip.id, label: 'Preview AI', role: 'owner' },
  });
  assert.equal(res.statusCode, 201);
  return { trip, token: res.json.token };
}

function buildMixedDraft() {
  return {
    vacation: {
      title: 'Oregon Coast Keepsake',
      destination: 'Astoria, Oregon',
      start_date: '2026-07-03',
      end_date: '2026-07-05',
      timezone: 'America/Los_Angeles',
      currency: 'usd',
      summary: 'Three coastal days with saved ideas for rainy afternoons.',
    },
    days: [
      { day_number: 1, date: '2026-07-03', title: 'Waterfront Arrival', notes: 'Walk the pier.' },
      { day_number: 2, date: '2026-07-04', title: 'Column and Harbor', notes: 'Views and seafood.' },
      { day_number: 3, date: '2026-07-05', title: 'Morning Coffee', notes: 'Pack up.' },
    ],
    hotels: [
      {
        ref: 'hotel-pier',
        title: 'Cannery Pier Hotel',
        check_in: '2026-07-03',
        check_out: '2026-07-05',
        total_price_cents: 84000,
        location: { address: '10 Basin St, Astoria, OR', lat: 46.1912, lng: -123.8511 },
      },
    ],
    restaurants: [
      {
        ref: 'rest-harbor',
        title: 'Harbor Chowder House',
        day_date: '2026-07-04',
        starts_at: '2026-07-04T12:30:00-07:00',
        total_price_cents: 8500,
        location: { address: '1400 Marine Dr, Astoria, OR', lat: 46.1897, lng: -123.8315 },
      },
      {
        ref: 'saved-bakery',
        title: 'Pier Sourdough Bakery',
        description: 'Backup morning pastries if we have extra time.',
        location: { address: '220 11th St, Astoria, OR', lat: 46.1892, lng: -123.8322 },
      },
    ],
    things_to_do: [
      {
        ref: 'act-column',
        title: 'Astoria Column',
        day_date: '2026-07-04',
        starts_at: '2026-07-04T09:30:00-07:00',
        total_price_cents: 500,
        location: { address: '1 Coxcomb Dr, Astoria, OR', lat: 46.1813, lng: -123.8174 },
      },
    ],
    unscheduled_things: [
      {
        ref: 'saved-bookshop',
        category: 'store',
        title: 'Riverfront Bookshop',
        description: 'Indie maritime bookstore saved for browsing.',
        location: { address: '1120 Commercial St, Astoria, OR', lat: 46.1886, lng: -123.8318 },
      },
    ],
  };
}

async function test_A12_bot_preview_hash_guard_and_inapp_parity() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  setVacationMcpClock(() => new Date('2026-07-10T18:00:00.000Z'));

  const { trip, token } = await setupToken(db, { title: 'Scope Vacation A12', sessionToken: 'sess-a12' });
  const liveBefore = db.liveSnapshot();
  const draft = buildMixedDraft();

  const startRes = await mcpRpc('tools/call', { name: 'start_import', arguments: draft }, token);
  assert.equal(startRes.statusCode, 200);
  const draftId = startRes.json.result.structuredContent.draft_id;

  const reqMedia = await mcpRpc('tools/call', {
    name: 'upload_media',
    arguments: {
      action: 'request_upload',
      draft_id: draftId,
      files: [
        { filename: 'column-gps.jpg', mime_type: 'image/jpeg', caption: 'Tower top' },
        { filename: 'bookshop-front.jpg', mime_type: 'image/jpeg', caption: 'Window display', thing_ref: 'saved-bookshop' },
      ],
    },
  }, token);
  const [slotGps, slotUnsched] = reqMedia.json.result.structuredContent.uploads;
  const gpsPhoto = buildJpegWithExif({
    dateTimeOriginal: '2026:07:04 16:45:00',
    offsetTimeOriginal: '+00:00',
    lat: 46.1814,
    lng: -123.8173,
  });
  const bookshopPhoto = buildPlainJpeg();

  for (const [slot, bytes] of [[slotGps, gpsPhoto], [slotUnsched, bookshopPhoto]]) {
    const parsed = new URL(slot.upload_url);
    const putRes = await invokeRoute(apiHandler, {
      method: 'PUT',
      url: parsed.pathname + parsed.search,
      headers: { 'content-type': 'image/jpeg' },
      body: bytes,
    });
    assert.equal(putRes.statusCode, 200);
  }
  const finRes = await mcpRpc('tools/call', {
    name: 'upload_media',
    arguments: { action: 'finalize', draft_id: draftId, media_ids: [slotGps.media_id, slotUnsched.media_id] },
  }, token);
  assert.equal(finRes.statusCode, 200);

  const previewRes = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, token);
  assert.equal(previewRes.statusCode, 200);
  const botBody = previewRes.json.result.structuredContent;
  const preview = botBody.preview;
  assert.match(preview.preview_hash, /^[0-9a-f]{64}$/);
  assert.equal(botBody.preview_hash, preview.preview_hash);
  assert.equal(preview.days.length, 3);
  assert.equal(preview.days[0].items.length, 1);
  assert.equal(preview.days[1].items.length, 2);
  assert.equal(preview.unscheduled_things.length, 2);
  assert.equal(preview.media.length, 2);
  assert.equal(preview.total_bytes, gpsPhoto.length + bookshopPhoto.length);

  const gpsEntry = preview.media.find((m) => m.media_id === slotGps.media_id);
  assert.equal(gpsEntry.bytes, gpsPhoto.length);
  assert.equal(gpsEntry.attached_day_date, '2026-07-04');
  assert.equal(gpsEntry.attached_day_number, 2);
  assert.equal(gpsEntry.attached_thing_ref, 'act-column');
  assert.equal(gpsEntry.attached_thing_title, 'Astoria Column');
  assert.equal(gpsEntry.exif_match.time_matched, true);
  assert.equal(gpsEntry.exif_match.gps_matched, true);
  assert.ok(gpsEntry.exif_match.gps_distance_meters <= 30);

  const bookshopEntry = preview.media.find((m) => m.media_id === slotUnsched.media_id);
  assert.equal(bookshopEntry.bytes, bookshopPhoto.length);
  assert.equal(bookshopEntry.attached_thing_ref, 'saved-bookshop');
  assert.equal(bookshopEntry.attached_thing_title, 'Riverfront Bookshop');
  assert.equal(bookshopEntry.attached_thing_scheduled, false);

  const missingHashCommit = await mcpRpc('tools/call', { name: 'commit_import', arguments: { draft_id: draftId } }, token);
  assert.equal(missingHashCommit.statusCode, 400);
  assert.equal(missingHashCommit.json.error.data.code, 'preview_hash_required');

  const mutatedDraft = {
    ...draft,
    unscheduled_things: [
      ...draft.unscheduled_things,
      { ref: 'saved-coffee', category: 'restaurant', title: 'Dockside Roasters' },
    ],
  };
  const mutateRes = await mcpRpc('tools/call', {
    name: 'start_import',
    arguments: { draft_id: draftId, ...mutatedDraft },
  }, token);
  assert.equal(mutateRes.statusCode, 200);
  assert.notEqual(mutateRes.json.result.structuredContent.preview_hash, preview.preview_hash);

  const staleCommit = await mcpRpc('tools/call', {
    name: 'commit_import',
    arguments: { draft_id: draftId, preview_hash: preview.preview_hash },
  }, token);
  assert.equal(staleCommit.statusCode, 409);
  assert.equal(staleCommit.json.error.data.code, 'preview_hash_mismatch');
  assert.equal(db.liveSnapshot(), liveBefore);

  const refreshedPreview = (await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, token))
    .json.result.structuredContent.preview;
  assert.notEqual(refreshedPreview.preview_hash, preview.preview_hash);

  const commitRes = await mcpRpc('tools/call', {
    name: 'commit_import',
    arguments: { draft_id: draftId, preview_hash: refreshedPreview.preview_hash },
  }, token);
  assert.equal(commitRes.statusCode, 200);
  assert.equal(commitRes.json.result.structuredContent.status, 'pending_approval');
  assert.equal(commitRes.json.result.structuredContent.preview_hash, refreshedPreview.preview_hash);
  assert.equal(db.liveSnapshot(), liveBefore);

  const inAppRes = await invokeRoute(apiHandler, {
    method: 'GET',
    url: `/api/mcp/changes/${draftId}?tripId=${trip.id}`,
    headers: { 'x-timesyncher-web-access-token': 'sess-a12' },
  });
  assert.equal(inAppRes.statusCode, 200);
  const inAppView = extractApprovalPreviewView(inAppRes.json.change);
  assert.equal(inAppView.previewHash, refreshedPreview.preview_hash);
  assert.deepEqual(
    inAppView.days.flatMap((d) => (d.items || []).map((i) => i.title)),
    refreshedPreview.days.flatMap((d) => d.items.map((i) => i.title)),
  );
  assert.deepEqual(
    inAppView.unscheduledThings.map((i) => i.title),
    refreshedPreview.unscheduled_things.map((i) => i.title),
  );
  assert.deepEqual(
    inAppView.media.map((m) => [m.media_id, m.filename, m.bytes, m.attached_thing_title, m.attached_day_date]),
    refreshedPreview.media.map((m) => [m.media_id, m.filename, m.bytes, m.attached_thing_title, m.attached_day_date]),
  );
  assert.equal(inAppView.totalBytes, refreshedPreview.total_bytes);

  const dryRunRes = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: {
      dry_run: true,
      operations: [
        { op: 'add_item', item: { category: 'store', title: 'Coastal Pottery', unscheduled: true } },
      ],
    },
  }, token);
  assert.equal(dryRunRes.statusCode, 200);
  const dryBody = dryRunRes.json.result.structuredContent;
  assert.equal(dryBody.dry_run, true);
  assert.equal(dryBody.published, false);
  assert.match(dryBody.preview_hash, /^[0-9a-f]{64}$/);
  assert.equal(dryBody.preview.unscheduled_things.some((i) => i.title === 'Coastal Pottery'), true);
  assert.equal(db.tables.vacation_mcp_change_sets.filter((c) => c.kind === 'targeted_edit').length, 0);

  const staleEdit = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: {
      preview_hash: dryBody.preview_hash,
      operations: [
        { op: 'add_item', item: { category: 'store', title: 'Different Shop', unscheduled: true } },
      ],
    },
  }, token);
  assert.equal(staleEdit.statusCode, 409);
  assert.equal(staleEdit.json.error.data.code, 'preview_hash_mismatch');

  const stagedEdit = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: {
      preview_hash: dryBody.preview_hash,
      operations: [
        { op: 'add_item', item: { category: 'store', title: 'Coastal Pottery', unscheduled: true } },
      ],
    },
  }, token);
  assert.equal(stagedEdit.statusCode, 200);
  assert.equal(stagedEdit.json.result.structuredContent.status, 'pending_approval');
  assert.equal(stagedEdit.json.result.structuredContent.preview_hash, dryBody.preview_hash);
  setVacationMcpClock(null);
}

async function test_A13_unscheduled_long_list_things_end_to_end() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);

  const { trip, token } = await setupToken(db, { title: 'Scope Vacation A13', sessionToken: 'sess-a13' });
  const draft = buildMixedDraft();

  const startRes = await mcpRpc('tools/call', { name: 'start_import', arguments: draft }, token);
  const draftId = startRes.json.result.structuredContent.draft_id;

  const reqMedia = await mcpRpc('tools/call', {
    name: 'upload_media',
    arguments: {
      action: 'request_upload',
      draft_id: draftId,
      files: [{ filename: 'bookshop.jpg', mime_type: 'image/jpeg', thing_ref: 'saved-bookshop', caption: 'Bookshelf' }],
    },
  }, token);
  const slot = reqMedia.json.result.structuredContent.uploads[0];
  const parsed = new URL(slot.upload_url);
  await invokeRoute(apiHandler, {
    method: 'PUT',
    url: parsed.pathname + parsed.search,
    headers: { 'content-type': 'image/jpeg' },
    body: buildPlainJpeg(),
  });
  await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'finalize', draft_id: draftId, media_ids: [slot.media_id] } }, token);

  const previewRes = await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, token);
  const preview = previewRes.json.result.structuredContent.preview;
  const scheduledInPreview = preview.days.flatMap((d) => d.items);
  assert.equal(scheduledInPreview.length, 3);
  assert.equal(preview.unscheduled_things.length, 2);
  assert.deepEqual(preview.unscheduled_things.map((t) => t.title), ['Pier Sourdough Bakery', 'Riverfront Bookshop']);
  for (const item of preview.unscheduled_things) {
    assert.equal(item.scheduled, false);
    assert.equal(item.day_date, null);
  }
  const bookshopPreview = preview.unscheduled_things.find((t) => t.ref === 'saved-bookshop');
  assert.equal(bookshopPreview.media.length, 1);
  assert.equal(bookshopPreview.media[0].filename, 'bookshop.jpg');

  const commitRes = await mcpRpc('tools/call', {
    name: 'commit_import',
    arguments: { draft_id: draftId, preview_hash: preview.preview_hash },
  }, token);
  assert.equal(commitRes.statusCode, 200);

  const approveRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${draftId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a13' },
    body: { tripId: trip.id },
  });
  assert.equal(approveRes.statusCode, 200);
  const publishedId = approveRes.json.publishedVacationId;

  const publishedTrip = db.tables.trips.find((t) => t.id === publishedId);
  const publishedThings = db.tables.trip_things.filter((r) => r.trip_id === publishedId);
  assert.equal(publishedThings.length, 5);

  const shared = sharedTripFromIntake({
    trip: publishedTrip,
    things: publishedThings.map((row) => thingRecordFromTripRow(row)),
  });
  assert.equal(shared.places.length, 5);

  const longListRestaurants = placesForCategoryTab(shared, 'restaurants').map((p) => p.name);
  const longListStores = placesForCategoryTab(shared, 'stores').map((p) => p.name);
  assert.ok(longListRestaurants.includes('Pier Sourdough Bakery'), 'unscheduled restaurant must appear on long list');
  assert.ok(longListStores.includes('Riverfront Bookshop'), 'unscheduled store must appear on long list');

  const allDayTitles = shared.days.flatMap((day) => buildDayTimeline(shared, day).map((entry) => entry.title));
  assert.equal(allDayTitles.some((t) => t.includes('Pier Sourdough Bakery')), false, 'unscheduled restaurant must not appear on any day');
  assert.equal(allDayTitles.some((t) => t.includes('Riverfront Bookshop')), false, 'unscheduled store must not appear on any day');
  assert.equal(allDayTitles.some((t) => t.includes('Harbor Chowder House')), true);
  assert.equal(allDayTitles.some((t) => t.includes('Astoria Column')), true);
  assert.equal(allDayTitles.some((t) => t.includes('Cannery Pier Hotel')), true);

  const bookshopRow = publishedThings.find((r) => r.title === 'Riverfront Bookshop');
  const bindings = db.tables.thing_media_bindings.filter((b) => b.share_token === publishedTrip.metadata.publicSlug);
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].metadata.thingId, bookshopRow.id);
  assert.equal(bindings[0].day_number, null);

  const editRes = await mcpRpc('tools/call', {
    name: 'update_vacation',
    arguments: {
      operations: [
        { op: 'add_item', item: { category: 'attraction', title: 'Maritime Museum', unscheduled: true } },
      ],
    },
  }, token);
  assert.equal(editRes.statusCode, 200);
  const editId = editRes.json.result.structuredContent.change_set_id;
  const approveEdit = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${editId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-a13' },
    body: { tripId: trip.id },
  });
  assert.equal(approveEdit.statusCode, 200);
  const readAfter = await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, token);
  const unscheduledAfter = readAfter.json.result.structuredContent.unscheduled_things;
  assert.equal(unscheduledAfter.some((item) => item.title === 'Maritime Museum' && item.scheduled === false && item.day_date === null), true);
}

async function test_B3_B4_B5_B6_B7_intake_photos_times_icons_detail_copy() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  useSharedTripDatabase(db);
  const carmelTrip = db.seedVacation({ title: 'Carmel-by-the-Sea', destination: 'Carmel-by-the-Sea, CA', startDate: new Date('2025-05-10T00:00:00.000Z'), endDate: new Date('2025-05-11T00:00:00.000Z'), timezone: 'UTC' });
  db.seedEditorSession({ tripId: carmelTrip.id, ownerCustomerId: carmelTrip.customer_id, email: 'owner@example.com', role: 'owner', sessionToken: 'sess-b4', shareSlug: carmelTrip.metadata.publicSlug });
  const token = (await invokeRoute(apiHandler, { method: 'POST', url: '/api/mcp/tokens', headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-b4' }, body: { tripId: carmelTrip.id, label: 'Carmel AI', role: 'owner' } })).json.token;

  const readBefore = (await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, token)).json.result.structuredContent;
  assert.equal(readBefore.vacation.start_date, '2025-05-10');
  assert.equal(readBefore.vacation.end_date, '2025-05-11');
  assert.equal(readBefore.vacation.timezone, 'America/Los_Angeles');

  const draft = {
    vacation: { title: 'Carmel Coast', destination: 'Carmel-by-the-Sea, CA', start_date: '2025-05-10', end_date: '2025-05-11', timezone: 'America/Los_Angeles' },
    days: [{ day_number: 1, date: '2025-05-10', title: 'Point Lobos Hike', notes: 'Arrive early' }, { day_number: 2, date: '2025-05-11', title: 'Village Stroll', notes: 'Ocean Ave' }],
    things_to_do: [{ ref: 'hike-1', category: 'activity', title: 'Point Lobos Carmel Hike', day_date: '2025-05-10', starts_at: '2025-05-10T09:00:00-07:00', notes: 'Bring windbreaker', location: { lat: 36.515, lng: -121.943 } }],
    unscheduled_things: [{ ref: 'beach-1', category: 'activity', title: 'Carmel Beach Sunset', notes: 'Great sunset spot', location: { lat: 36.554, lng: -121.928 } }],
  };
  const draftId = (await mcpRpc('tools/call', { name: 'start_import', arguments: draft }, token)).json.result.structuredContent.draft_id;
  const slots = (await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'request_upload', draft_id: draftId, files: [{ filename: 'hike.jpg', mime_type: 'image/jpeg', thing_ref: 'hike-1' }, { filename: 'beach.jpg', mime_type: 'image/jpeg', thing_ref: 'beach-1' }] } }, token)).json.result.structuredContent.uploads;
  for (const [slot, bytes] of [[slots[0], buildJpegWithExif({ dateTimeOriginal: '2025:05:10 09:45:00' })], [slots[1], buildPlainJpeg()]]) {
    const u = new URL(slot.upload_url);
    assert.equal((await invokeRoute(apiHandler, { method: 'PUT', url: u.pathname + u.search, headers: { 'content-type': 'image/jpeg' }, body: bytes })).statusCode, 200);
  }
  const fin = (await mcpRpc('tools/call', { name: 'upload_media', arguments: { action: 'finalize', draft_id: draftId, media_ids: slots.map((s) => s.media_id) } }, token)).json.result.structuredContent.finalized;
  assert.equal(fin[0].assigned_day_date, '2025-05-10');
  db.tables.vacation_mcp_draft_media.find((m) => m.id === slots[0].media_id).exif_captured_at = new Date('2025-05-10T09:45:00.000Z');

  const preview = (await mcpRpc('tools/call', { name: 'preview_import', arguments: { draft_id: draftId } }, token)).json.result.structuredContent.preview;
  const hikeMediaPreview = preview.media.find((m) => m.media_id === slots[0].media_id);
  assert.equal(hikeMediaPreview.exif_match.time_matched, true);
  assert.equal(hikeMediaPreview.exif_match.local_date, '2025-05-10');
  assert.equal((await mcpRpc('tools/call', { name: 'commit_import', arguments: { draft_id: draftId, preview_hash: preview.preview_hash } }, token)).statusCode, 200);
  const approve = await invokeRoute(apiHandler, { method: 'POST', url: `/api/mcp/changes/${draftId}/approve`, headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-b4' }, body: { tripId: carmelTrip.id, preview_hash: preview.preview_hash } });
  assert.equal(approve.statusCode, 200);
  const served = await intakeSharedResponse(approve.json.shareSlug, db);
  assert.equal(served.days[0].title, 'Point Lobos Hike');
  assert.equal(served.media.length, 2);
  const hikePlace = served.places.find((p) => p.name === 'Point Lobos Carmel Hike');
  const beachPlace = served.places.find((p) => p.name === 'Carmel Beach Sunset');
  assert.equal(hikePlace.bound_media.length, 1);
  assert.equal(beachPlace.bound_media.length, 1);
  assert.match(hikePlace.bound_media[0].publicUrl, /^\/api\/bind-thing-media\?/);
  assert.equal(hikePlace.category_name, 'sightseeing');
  assert.equal(served.thingOverrides[`place:${hikePlace.id}`].startTime, '09:00');
  assert.equal(served.thingOverrides[`place:${hikePlace.id}`].itineraryNote, 'Bring windbreaker');
  assert.equal(served.thingOverrides[`place:${hikePlace.id}`].status, 'completed');

  const httpShared = await invokeRoute(sharedTripHandler, { method: 'GET', url: `/api/shared/${approve.json.shareSlug}/` });
  assert.equal(httpShared.statusCode, 200);
  assert.equal(httpShared.headers['cache-control'], 'no-store');
  assert.doesNotMatch(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'), /\btrips?\b/i);
  const bundleJs = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
  assert.ok(bundleJs.includes('children:"Vacation View"') && bundleJs.includes('children:"AI Access & Approvals"') && bundleJs.includes("edit ? field('lat', 'Latitude') : null") && bundleJs.includes('visitStatusLabel(visit)'));

  const filtered = await loadTripScopedVacationAppTurns(
    async (strings) => (strings.join(' ').includes('customer_id =') ? [] : [
      { request_id: 'r1', speaker: 'customer', body: 'Invite bad@invalid', channel: 'vacation-app', direction: 'inbound', payload: { authorId: 'o1', authorName: 'Ada', turnActionResults: { invite: { ok: false } } }, received_at: '2026-07-01T10:00:00Z' },
      { request_id: 'r1', speaker: 'app', body: 'That invite bounced.', channel: 'vacation-app', direction: 'outbound', payload: { inviteActionFailed: true }, sent_at: '2026-07-01T10:00:02Z' },
      { request_id: 'r2', speaker: 'customer', body: 'Looking forward to Carmel!', channel: 'vacation-app', direction: 'inbound', payload: { authorId: 'o1', authorName: 'Ada' }, received_at: '2026-07-01T10:05:00Z' },
    ]),
    { customer_id: 'c1', metadata: { seat: { role: 'collaborator', ownerCustomerId: 'o1', ownerTripId: 't1', displayName: 'Sam' } } },
    't1',
    { loadTranscriptAuthorPeople: async () => [{ id: 'o1', firstName: 'Ada', displayName: 'Ada' }, { id: 'c1', firstName: 'Sam', displayName: 'Sam' }] },
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].body, 'Looking forward to Carmel!');
  useSharedTripDatabase(null);
}

await test_A12_bot_preview_hash_guard_and_inapp_parity();
await test_A13_unscheduled_long_list_things_end_to_end();
await test_B3_B4_B5_B6_B7_intake_photos_times_icons_detail_copy();
useVacationMcpDatabase(null);
console.log('vacation mcp acceptance tests A12-A13 + B3-B7 passed');
