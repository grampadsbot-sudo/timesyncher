import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { hashMcpToken } from '../src/vacation/mcp-tokens.mjs';
import { tryHandleReservationsChatTurn } from '../src/vacation/mcp-reservations-chat.mjs';
import { isReservationAsk, parseReservationsHandshakeText, reservationChatTurnNeedsLookup } from '../src/vacation/mcp-reservations-handshake.mjs';
import { RESERVATION_HOW_TO_URI, RESERVATION_MCP_TOOLS } from '../src/vacation/mcp-reservations-tools.mjs';
import { createReservationsTestDb } from './lib/reservations-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';

async function mcpRpc(method, params = {}, token = '') {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp',
    headers,
    body: { jsonrpc: '2.0', id: crypto.randomUUID(), method, params },
  });
}

function extractBearerFromCopyText(copyText) {
  const match = String(copyText || '').match(/Authorization:\s*Bearer\s+(\S+)/i);
  assert.ok(match, 'setup copyText must include Bearer token');
  return match[1].trim();
}

async function test_R1_R2_R3_R5_ask_setup_and_handshake_by_paste() {
  const db = createReservationsTestDb();
  useVacationMcpDatabase(db);
  const ownerId = crypto.randomUUID();
  const trip = db.seedVacation({ ownerCustomerId: ownerId, title: 'Manhattan Food Weekend', destination: 'New York, NY', startDate: '2026-07-08', endDate: '2026-07-11' });
  const ownerSession = { customer_id: ownerId, email: 'owner-r1@example.test', first_name: 'Sam', last_name: 'Rivera', display_name: 'Sam Rivera' };
  const reqHeaders = { headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' } };
  const tripRef = { id: trip.id, title: trip.title, destination: trip.destination };

  assert.equal(isReservationAsk('book Carbone for 8 on Wednesday'), true);
  assert.equal(isReservationAsk('I want to import vacation details from my AI'), false);
  assert.equal(reservationChatTurnNeedsLookup('hi'), false);
  assert.equal(reservationChatTurnNeedsLookup('Hello'), false);
  assert.equal(reservationChatTurnNeedsLookup('book Carbone for 8 on Wednesday'), true);
  assert.equal(reservationChatTurnNeedsLookup('Yes, please set it up'), true);

  let ordinaryCalls = 0;
  const countingDb = (strings, ...values) => {
    ordinaryCalls += 1;
    return db(strings, ...values);
  };
  const ignored = await tryHandleReservationsChatTurn(countingDb, {
    session: ownerSession,
    trip: tripRef,
    requestText: 'hi',
    httpReq: reqHeaders,
  });
  assert.equal(ignored, null);
  assert.equal(ordinaryCalls, 0);

  const offerRes = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: 'book Carbone for 8 on Wednesday', httpReq: reqHeaders });
  assert.equal(offerRes.ok, true);
  assert.match(offerRes.reply, /doesn't book reservations directly/i);
  assert.match(offerRes.reply, /your own AI/i);
  assert.match(offerRes.reply, /vacation/i);
  assert.doesNotMatch(offerRes.reply, /\btrips?\b/i);
  assert.equal(offerRes.reservationCard.kind, 'ai_reservation_offer');

  const setupRes = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: 'Yes, please set it up', httpReq: reqHeaders });
  assert.equal(setupRes.ok, true);
  assert.equal(setupRes.reservationCard.kind, 'ai_reservation_setup');
  assert.match(setupRes.reservationCard.mcpEndpoint, /\/api\/mcp$/);
  const rawToken = extractBearerFromCopyText(setupRes.reservationCard.copyText);
  assert.ok(rawToken.startsWith('vkr_'));
  assert.equal(setupRes.reservationCard.maskedToken.includes(rawToken), false);
  assert.match(setupRes.reservationCard.copyText, /\(a\)/i);
  assert.match(setupRes.reservationCard.copyText, /\(b\)/i);
  assert.match(setupRes.reservationCard.copyText, /\(c\)/i);
  assert.match(setupRes.reservationCard.copyText, /check my VK reservations/i);
  assert.doesNotMatch(setupRes.reservationCard.copyText, /\btrips?\b/i);

  const connRow = db.tables.vacation_reservation_connections[0];
  assert.equal(connRow.token_hash, hashMcpToken(rawToken, process.env));
  assert.equal(JSON.stringify(connRow).includes(rawToken), false);
  assert.equal(JSON.stringify(db.tables.transcript_turns).includes(rawToken), false);

  const malformed = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: '{ "mode": "webhook", "webhook_url": "not-a-url" }', httpReq: reqHeaders });
  assert.equal(malformed.ok, true);
  assert.equal(malformed.reservationCard.kind, 'ai_reservation_handshake_error');
  assert.doesNotMatch(malformed.reply, /stack|Error:|SyntaxError|\{/);
  assert.match(malformed.reply, /webhook|https:\/\//i);

  const modeA = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: JSON.stringify({ mode: 'webhook', webhook_url: 'https://ai.example.test/vk-hook' }), httpReq: reqHeaders });
  assert.equal(modeA.reservationCard.kind, 'ai_reservation_connected');
  assert.equal(modeA.reservationCard.mode, 'webhook');
  assert.match(modeA.reply, /You're set up for reservations/i);
  assert.match(modeA.reply, /just ask Vacay Keepsake.*wait/i);

  const modeB = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: 'Option (b) polling every 12 minutes', httpReq: reqHeaders });
  assert.equal(modeB.reservationCard.mode, 'polling');
  assert.equal(modeB.reservationCard.pollIntervalMinutes, 12);
  assert.match(modeB.reply, /You're set up for reservations/i);
  assert.match(modeB.reply, /within about 12 minutes/i);

  const modeC = await tryHandleReservationsChatTurn(db, { session: ownerSession, trip: tripRef, requestText: 'Option (c) manual', httpReq: reqHeaders });
  assert.equal(modeC.reservationCard.mode, 'manual');
  assert.match(modeC.reply, /You're set up for reservations/i);
  assert.match(modeC.reply, /check my VK reservations/i);

  const badJson = parseReservationsHandshakeText('{ broken json', { hasPendingConnection: true });
  assert.equal(badJson.matched, true);
  assert.equal(badJson.valid, false);
}

async function test_R4_R6_R7_R8_R9_R10_R11_live_booking_and_account_level() {
  const db = createReservationsTestDb();
  useVacationMcpDatabase(db);
  const ownerId = crypto.randomUUID();
  const otherOwnerId = crypto.randomUUID();

  const ownedTrip = db.seedVacation({
    ownerCustomerId: ownerId,
    title: 'NYC Culinary Escape',
    destination: 'New York, NY',
    startDate: '2026-07-08',
    endDate: '2026-07-11',
  });
  const collabTrip = db.seedVacation({
    ownerCustomerId: otherOwnerId,
    title: 'Napa Harvest Retreat',
    destination: 'Napa, CA',
    startDate: '2026-09-12',
    endDate: '2026-09-15',
  });
  db.seedThing({
    tripId: ownedTrip.id,
    category: 'restaurant',
    title: 'Carbone',
    description: 'Classic Italian restaurant',
  });
  db.seedCollaborator({
    tripId: collabTrip.id,
    ownerCustomerId: otherOwnerId,
    collaboratorCustomerId: ownerId,
    email: 'sam-r6@example.test',
    displayName: 'Sam',
  });

  const samSession = {
    customer_id: ownerId,
    email: 'sam-r6@example.test',
    first_name: 'Sam',
    display_name: 'Sam',
  };

  await tryHandleReservationsChatTurn(db, {
    session: samSession,
    trip: { id: ownedTrip.id, title: ownedTrip.title, destination: ownedTrip.destination },
    requestText: 'book Carbone for 8 on Wednesday',
  });
  const setup = await tryHandleReservationsChatTurn(db, {
    session: samSession,
    trip: { id: ownedTrip.id, title: ownedTrip.title, destination: ownedTrip.destination },
    requestText: 'yes',
  });
  const resToken = extractBearerFromCopyText(setup.reservationCard.copyText);

  const hsRes = await mcpRpc('tools/call', {
    name: 'register_reservations_handshake',
    arguments: {
      mode: 'webhook',
      webhook_url: 'http://127.0.0.1:41999/vk-hook',
      client_name: 'Fake Outside AI',
    },
  }, resToken);
  assert.equal(hsRes.statusCode, 200);
  assert.equal(hsRes.json.result.structuredContent.status, 'active');
  assert.equal(hsRes.json.result.structuredContent.mode, 'webhook');
  assert.ok(db.tables.transcript_turns.some((t) => /You're set up for reservations/i.test(t.body)));

  const webhookCaptures = [];
  const fakeFetch = async (url, init) => {
    webhookCaptures.push({ url, headers: init.headers, body: JSON.parse(init.body), rawBody: init.body });
    return { ok: true, status: 200 };
  };

  const askOwned = await tryHandleReservationsChatTurn(db, {
    session: samSession,
    trip: { id: ownedTrip.id, title: ownedTrip.title, destination: ownedTrip.destination },
    requestText: 'book Carbone for 8 at 8:00 PM on 2026-07-08',
    fetchImpl: fakeFetch,
  });
  assert.equal(askOwned.reservationCard.status, 'waiting');
  assert.equal(webhookCaptures.length, 1);
  assert.equal(webhookCaptures[0].body.vacation_id, ownedTrip.id);
  assert.equal(webhookCaptures[0].rawBody.includes(resToken), false, 'webhook payload must never contain token');
  assert.equal(JSON.stringify(webhookCaptures[0].headers).includes(resToken), false, 'webhook headers must never contain token');

  const askCollab = await tryHandleReservationsChatTurn(db, {
    session: { ...samSession, metadata: { seat: { role: 'collaborator', ownerCustomerId: otherOwnerId, ownerTripId: collabTrip.id, displayName: 'Sam' } } },
    trip: { id: collabTrip.id, title: collabTrip.title, destination: collabTrip.destination },
    requestText: 'book French Laundry for 4 at 7:00 PM on 2026-09-12',
    fetchImpl: fakeFetch,
  });
  assert.equal(askCollab.reservationCard.status, 'waiting');
  assert.equal(webhookCaptures.length, 2);
  assert.equal(webhookCaptures[1].body.vacation_id, collabTrip.id);

  const listedReqs = await mcpRpc('tools/call', { name: 'list_reservation_requests', arguments: {} }, resToken);
  assert.equal(listedReqs.statusCode, 200);
  const reqs = listedReqs.json.result.structuredContent.requests;
  assert.equal(reqs.length, 2);
  const ownedReq = reqs.find((r) => r.vacation_id === ownedTrip.id);
  const collabReq = reqs.find((r) => r.vacation_id === collabTrip.id);
  assert.ok(ownedReq && collabReq);

  const confirmOwned = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      request_id: ownedReq.request_id,
      status: 'confirmed',
      date: '2026-07-08',
      time: '8:00 PM',
      party_size: 8,
      confirmation_number: 'CARB-8842',
      notes: 'Main dining room booth',
    },
  }, resToken);
  assert.equal(confirmOwned.statusCode, 200);
  assert.equal(confirmOwned.json.result.structuredContent.status, 'booked');
  assert.equal(confirmOwned.json.result.structuredContent.published, true);
  assert.equal(confirmOwned.json.result.structuredContent.thing_created, false);
  const carboneRow = db.tables.trip_things.find((t) => t.trip_id === ownedTrip.id && t.title === 'Carbone');
  assert.equal(carboneRow.metadata.bookedByAi, true);
  assert.equal(carboneRow.metadata.bookedByLabel, 'Booked by your AI');
  assert.equal(carboneRow.metadata.confirmationNumber, 'CARB-8842');
  const sharedDoc = sharedTripFromIntake({
    trip: ownedTrip,
    things: db.tables.trip_things.filter((t) => t.trip_id === ownedTrip.id).map(thingRecordFromTripRow),
  });
  const sharedCarbone = sharedDoc.places.find((p) => p.name === 'Carbone');
  assert.equal(sharedCarbone.booked_by_ai, true);
  assert.equal(sharedCarbone.confirmation_number, 'CARB-8842');
  assert.equal(sharedDoc.thingOverrides[`place:${sharedCarbone.id}`].bookedByLabel, 'Booked by your AI');
  const bookedChatTurn = db.tables.transcript_turns.find((t) => t.payload?.reservationCard?.status === 'booked');
  assert.ok(bookedChatTurn);
  assert.match(bookedChatTurn.body, /Booked by your AI.*Carbone.*CARB-8842/);

  const failCollab = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      request_id: collabReq.request_id,
      status: 'failed',
      reason: 'Fully booked on that evening.',
      alternatives: ['Try 5:30 PM seating', 'Try Bouchon Bistro instead', 'Try again tomorrow'],
    },
  }, resToken);
  assert.equal(failCollab.statusCode, 200);
  assert.equal(failCollab.json.result.structuredContent.status, 'failed');
  assert.equal(db.tables.trip_things.filter((t) => t.trip_id === collabTrip.id).length, 0);
  const failedChatTurn = db.tables.transcript_turns.find((t) => t.payload?.reservationCard?.status === 'failed');
  assert.ok(failedChatTurn);
  assert.match(failedChatTurn.body, /Fully booked on that evening/);

  const findRes = await mcpRpc('tools/call', { name: 'find_vacation', arguments: { query: 'NYC' } }, resToken);
  assert.equal(findRes.statusCode, 200);
  assert.equal(findRes.json.result.structuredContent.vacations.length, 1);
  assert.equal(findRes.json.result.structuredContent.vacations[0].vacation_id, ownedTrip.id);

  const directBook = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: {
      vacation_id: ownedTrip.id,
      status: 'confirmed',
      venue_name: 'Via Carota',
      category: 'restaurant',
      date: '2026-07-09',
      time: '7:30 PM',
      party_size: 4,
      confirmation_number: 'VIA-9910',
      notes: 'Patio table',
    },
  }, resToken);
  assert.equal(directBook.statusCode, 200);
  assert.equal(directBook.json.result.structuredContent.thing_created, true);
  assert.ok(db.tables.trip_things.some((t) => t.trip_id === ownedTrip.id && t.title === 'Via Carota' && t.metadata.bookedByAi === true));

  await mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'manual' } }, resToken);
  const manualAsk = await tryHandleReservationsChatTurn(db, {
    session: samSession,
    trip: { id: ownedTrip.id, title: ownedTrip.title, destination: ownedTrip.destination },
    requestText: 'book Balthazar for 2 at 6:30 PM',
  });
  assert.equal(manualAsk.reservationCard.status, 'waiting');
  assert.equal(manualAsk.reservationCard.mode, 'manual');
  assert.equal(manualAsk.reservationCard.manualPrompt, 'check my VK reservations');
}

async function test_R12_R13_R14_R15_R16_R17_R18_security_and_discovery() {
  const db = createReservationsTestDb();
  useVacationMcpDatabase(db);
  const ownerId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const trip = db.seedVacation({
    ownerCustomerId: ownerId,
    title: 'Boston Harbor Weekend',
    destination: 'Boston, MA',
    startDate: '2026-08-05',
    endDate: '2026-08-08',
  });
  const otherTrip = db.seedVacation({
    ownerCustomerId: outsiderId,
    title: 'Seattle Sound Getaway',
    destination: 'Seattle, WA',
    startDate: '2026-08-12',
    endDate: '2026-08-15',
  });
  db.seedEditorSession({ tripId: trip.id, ownerCustomerId: ownerId, email: 'owner-sec@example.test', role: 'owner', sessionToken: 'sess-sec-owner', shareSlug: trip.metadata.publicSlug });
  db.seedEditorSession({ tripId: trip.id, ownerCustomerId: ownerId, email: 'collab-sec@example.test', role: 'web_editor', sessionToken: 'sess-sec-collab', shareSlug: trip.metadata.publicSlug });
  db.seedEditorSession({ tripId: otherTrip.id, ownerCustomerId: outsiderId, email: 'outsider-sec@example.test', role: 'owner', sessionToken: 'sess-sec-outsider', shareSlug: otherTrip.metadata.publicSlug });
  db.tables.customers.push({ id: crypto.randomUUID(), email: 'collab-sec@example.test', display_name: 'Pat' });

  const importCreate = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/tokens',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-owner' },
    body: { tripId: trip.id, label: 'Import AI', role: 'owner' },
  });
  assert.equal(importCreate.statusCode, 201);
  const importToken = importCreate.json.token;

  const resCreate = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/connections',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-owner' },
    body: { shareToken: trip.metadata.publicSlug, label: 'Reservations AI' },
  });
  assert.equal(resCreate.statusCode, 201);
  const resToken = resCreate.json.token;
  const connId = resCreate.json.record.id;

  const listToolsRes = await mcpRpc('tools/list', {}, resToken);
  assert.equal(listToolsRes.statusCode, 200);
  const toolNames = listToolsRes.json.result.tools.map((t) => t.name);
  assert.deepEqual(toolNames, RESERVATION_MCP_TOOLS.map((t) => t.name));
  for (const tool of listToolsRes.json.result.tools) {
    assert.ok(tool.description.length > 20);
    assert.equal(tool.inputSchema.type, 'object');
  }

  const listResources = await mcpRpc('resources/list', {}, resToken);
  assert.equal(listResources.statusCode, 200);
  assert.ok(listResources.json.result.resources.some((r) => r.uri === RESERVATION_HOW_TO_URI));
  const readHowTo = await mcpRpc('resources/read', { uri: RESERVATION_HOW_TO_URI }, resToken);
  assert.equal(readHowTo.statusCode, 200);
  const howToText = readHowTo.json.result.contents[0].text;
  assert.match(howToText, /\(a\)/i);
  assert.match(howToText, /\(b\)/i);
  assert.match(howToText, /\(c\)/i);
  assert.match(howToText, /submit_reservation_result/);

  for (const resTool of ['register_reservations_handshake', 'list_vacations', 'find_vacation', 'list_reservation_requests', 'submit_reservation_result']) {
    const blocked = await mcpRpc('tools/call', { name: resTool, arguments: {} }, importToken);
    assert.equal(blocked.statusCode, 403, `import token must be 403 on ${resTool}`);
    assert.equal(JSON.stringify(blocked.json).includes(importToken), false);
  }
  for (const impTool of ['describe_import_format', 'start_import', 'upload_media', 'preview_import', 'commit_import', 'read_vacation', 'update_vacation']) {
    const blocked = await mcpRpc('tools/call', { name: impTool, arguments: {} }, resToken);
    assert.equal(blocked.statusCode, 403, `reservations token must be 403 on ${impTool}`);
    assert.equal(JSON.stringify(blocked.json).includes(resToken), false);
  }

  await mcpRpc('tools/call', { name: 'register_reservations_handshake', arguments: { mode: 'polling', poll_interval_minutes: 5 } }, resToken);

  const snapBeforeCross = db.liveSnapshot();
  const crossList = await mcpRpc('tools/call', { name: 'list_reservation_requests', arguments: { vacation_id: otherTrip.id } }, resToken);
  assert.equal(crossList.statusCode, 403);
  const crossSubmit = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { vacation_id: otherTrip.id, venue_name: 'Canlis', status: 'confirmed', confirmation_number: 'BAD-1' },
  }, resToken);
  assert.equal(crossSubmit.statusCode, 403);
  assert.equal(db.liveSnapshot(), snapBeforeCross);

  const unknownReq = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: crypto.randomUUID(), status: 'confirmed', confirmation_number: 'X1' },
  }, resToken);
  assert.equal(unknownReq.statusCode, 404);
  assert.equal(db.liveSnapshot(), snapBeforeCross);

  const reqCreated = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/requests',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-owner' },
    body: { shareToken: trip.metadata.publicSlug, venueName: 'Neptune Oyster', time: '7:00 PM', partySize: 2 },
  });
  assert.equal(reqCreated.statusCode, 201);
  const reqId = reqCreated.json.request.request_id;

  const cancelRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/reservations/requests/${reqId}/cancel`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-owner' },
    body: { shareToken: trip.metadata.publicSlug },
  });
  assert.equal(cancelRes.statusCode, 200);
  const snapAfterCancel = db.liveSnapshot();
  const staleSubmit = await mcpRpc('tools/call', {
    name: 'submit_reservation_result',
    arguments: { request_id: reqId, status: 'confirmed', confirmation_number: 'STALE-1' },
  }, resToken);
  assert.equal(staleSubmit.statusCode, 409);
  assert.equal(db.liveSnapshot(), snapAfterCancel);

  const collabReq = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/requests',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-collab' },
    body: { shareToken: trip.metadata.publicSlug, venueName: 'O Ya', time: '8:00 PM', partySize: 4 },
  });
  assert.equal(collabReq.statusCode, 201);
  const collabList = await invokeRoute(apiHandler, {
    method: 'GET',
    url: `/api/mcp/reservations/requests?shareToken=${trip.metadata.publicSlug}`,
    headers: { 'x-timesyncher-web-access-token': 'sess-sec-collab' },
  });
  assert.equal(collabList.statusCode, 200);
  assert.ok(collabList.json.requests.length >= 2);
  const collabConn = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/connections',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-collab' },
    body: { shareToken: trip.metadata.publicSlug },
  });
  assert.equal(collabConn.statusCode, 201);

  assert.equal((await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/connections',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-outsider' },
    body: { shareToken: trip.metadata.publicSlug },
  })).statusCode, 403);
  assert.equal((await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp/reservations/requests',
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-outsider' },
    body: { shareToken: trip.metadata.publicSlug, venueName: 'Intruder' },
  })).statusCode, 403);
  assert.equal((await invokeRoute(apiHandler, {
    method: 'GET',
    url: `/api/mcp/reservations/requests?shareToken=${trip.metadata.publicSlug}`,
    headers: { 'x-timesyncher-web-access-token': 'sess-sec-outsider' },
  })).statusCode, 403);

  const collabAdminView = await invokeRoute(apiHandler, {
    method: 'GET',
    url: `/api/mcp/reservations/connections?shareToken=${trip.metadata.publicSlug}&admin=1`,
    headers: { 'x-timesyncher-web-access-token': 'sess-sec-collab' },
  });
  assert.equal(collabAdminView.statusCode, 403);

  const ownerAdminView = await invokeRoute(apiHandler, {
    method: 'GET',
    url: `/api/mcp/reservations/connections?shareToken=${trip.metadata.publicSlug}&admin=1`,
    headers: { 'x-timesyncher-web-access-token': 'sess-sec-owner' },
  });
  assert.equal(ownerAdminView.statusCode, 200);
  const listedConn = ownerAdminView.json.connections.find((c) => c.id === connId);
  assert.ok(listedConn);
  assert.equal(listedConn.mode, 'polling');
  assert.ok(listedConn.createdAt);

  const revokeRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/reservations/connections/${connId}/revoke`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-sec-owner' },
    body: { shareToken: trip.metadata.publicSlug },
  });
  assert.equal(revokeRes.statusCode, 200);
  assert.equal(revokeRes.json.record.status, 'revoked');

  const afterRevoke = await mcpRpc('tools/call', { name: 'list_vacations', arguments: {} }, resToken);
  assert.equal(afterRevoke.statusCode, 401);
  assert.equal(afterRevoke.json.error.data.code, 'mcp_token_revoked');

  const importStillWorks = await mcpRpc('tools/call', { name: 'read_vacation', arguments: {} }, importToken);
  assert.equal(importStillWorks.statusCode, 200);

  const filesToCheck = [
    '../src/vacation/mcp-reservations-tools.mjs',
    '../src/vacation/mcp-reservations-chat.mjs',
    '../public/ts-mcp-ai-access.js',
    '../public/vacation-app-ai-import.js',
  ];
  for (const rel of filesToCheck) {
    const content = await readFile(new URL(rel, import.meta.url), 'utf8');
    const literals = [...content.matchAll(/(?:'([^'\\\n]*)'|"([^"\\\n]*)")/g)]
      .map((m) => (m[1] ?? m[2] ?? '').trim())
      .filter((t) => t.length > 2 && !t.startsWith('./') && !t.startsWith('../') && !t.startsWith('/api/') && !t.includes('trip_id') && !t.includes('tripId') && !t.includes('selectedTripId') && !t.includes('ownerTripId') && !t.includes('data-trip'));
    for (const literal of literals) {
      assert.doesNotMatch(literal, /\btrips?\b/i, `${rel} had trip literal: ${literal}`);
    }
  }
}

await test_R1_R2_R3_R5_ask_setup_and_handshake_by_paste();
await test_R4_R6_R7_R8_R9_R10_R11_live_booking_and_account_level();
await test_R12_R13_R14_R15_R16_R17_R18_security_and_discovery();
setVacationMcpClock(null);
useVacationMcpDatabase(null);
console.log('reservations mcp tests R1-R18 passed');
