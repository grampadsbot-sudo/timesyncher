import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import apiHandler from '../api/[...route].mjs';
import { setVacationMcpClock, useVacationMcpDatabase } from '../routes/vacation-mcp.mjs';
import {
  handleAiImportChatTurn,
  isAiImportChatRequest,
  maskMcpToken,
} from '../src/vacation/mcp-chat-import.mjs';
import { ensureVacationWebAccessSchema, webAccessCookieName } from '../src/vacation/web-access.mjs';
import { ensureVacationMcpSchema, hashMcpToken } from '../src/vacation/mcp-tokens.mjs';
import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { vacationAppCollaboratorWebAccessCookie } from '../src/vacation/vacation-app-owner-web-access.mjs';
import { createMcpTestDb } from './lib/mcp-test-harness.mjs';
import { invokeRoute } from './lib/mcp-test-exif.mjs';

async function runGenericMcpClientFromPastedText(pastedText, transport) {
  const endpointMatch = pastedText.match(/MCP endpoint:\s*(https?:\/\/\S+)/i);
  const bearerMatch = pastedText.match(/Authorization:\s*Bearer\s+(\S+)/i);
  const nameMatch = pastedText.match(/Vacation name:\s*(.+)/i);
  assert.ok(endpointMatch, 'pasted text must include MCP endpoint URL');
  assert.ok(bearerMatch, 'pasted text must include Bearer token');
  assert.ok(nameMatch, 'pasted text must include vacation name');
  const endpointPath = new URL(endpointMatch[1]).pathname;
  const token = bearerMatch[1].trim();
  const vacationName = nameMatch[1].trim();

  const callRpc = async (method, params = {}) => {
    const res = await transport({
      method: 'POST',
      url: endpointPath,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: { jsonrpc: '2.0', id: crypto.randomUUID(), method, params },
    });
    assert.equal(res.statusCode, 200, `MCP ${method} failed (${res.statusCode}): ${JSON.stringify(res.json)}`);
    return res.json.result;
  };

  const listed = await callRpc('tools/list');
  const toolNames = (listed.tools || []).map((t) => t.name);
  const formatTool = toolNames.find((n) => /describe.*format/i.test(n));
  const startTool = toolNames.find((n) => /start.*import/i.test(n));
  const previewTool = toolNames.find((n) => /preview.*import/i.test(n));
  const commitTool = toolNames.find((n) => /commit.*import/i.test(n));
  assert.ok(formatTool && startTool && previewTool && commitTool, `discovered tools: ${toolNames.join(', ')}`);

  const formatRes = await callRpc('tools/call', { name: formatTool, arguments: {} });
  const example = structuredClone(formatRes.structuredContent.example);
  example.vacation.title = vacationName;
  delete example.media;

  const startRes = await callRpc('tools/call', {
    name: startTool,
    arguments: { ...example, apply_mode: 'populate_scoped' },
  });
  const draftId = startRes.structuredContent.draft_id;
  assert.ok(draftId, 'start_import must return draft_id');

  const previewRes = await callRpc('tools/call', { name: previewTool, arguments: { draft_id: draftId } });
  const previewHash = previewRes.structuredContent.preview_hash;
  assert.ok(previewHash, 'preview_import must return preview_hash');

  const commitRes = await callRpc('tools/call', {
    name: commitTool,
    arguments: { draft_id: draftId, preview_hash: previewHash },
  });
  assert.equal(commitRes.structuredContent.status, 'pending_approval');
  assert.equal(commitRes.structuredContent.published, false);
  return { draftId, previewHash, preview: commitRes.structuredContent.preview };
}

async function test_C1_intent_recognition() {
  const positives = [
    'I want to import vacation details from my AI',
    'Can I import my vacation from ChatGPT?',
    'Bring in plans from my assistant',
    'Connect my Claude to this vacation',
    'Let Gemini upload my vacation itinerary',
    'How do I sync vacation plans from my AI assistant?',
    'Give me the MCP import instructions for my bot',
    'Pull my hotels and flights from ChatGPT',
  ];
  for (const phrase of positives) {
    assert.equal(isAiImportChatRequest(phrase), true, `should recognize: ${phrase}`);
  }
  const negatives = [
    'We are going to Carmel next weekend with Sam',
    'Add dinner at Harbor Bistro on Saturday at 7pm',
    'What is the weather like in Astoria?',
    'Invite sam@example.test to collaborate',
    'Move our kayak tour to Sunday morning',
    'Please revoke AI access for this vacation',
    "we're not ready to connect an AI for bookings — keep building the itinerary",
    'set up my AI for reservations',
  ];
  for (const phrase of negatives) {
    assert.equal(isAiImportChatRequest(phrase), false, `should not match: ${phrase}`);
  }
}

async function test_C2_C3_C4_C5_owner_flow_and_generic_mcp_client() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const fixedNow = new Date('2026-11-20T18:00:00.000Z');
  setVacationMcpClock(() => fixedNow);

  const ownerId = crypto.randomUUID();
  const trip = db.seedVacation({
    ownerCustomerId: ownerId,
    title: 'Big Sur Coastal Escape',
    destination: 'Big Sur, CA',
    startDate: '2026-07-03',
    endDate: '2026-07-05',
  });
  db.seedEditorSession({
    tripId: trip.id,
    ownerCustomerId: ownerId,
    email: 'owner-c2@example.test',
    role: 'owner',
    sessionToken: 'sess-owner-c2',
    shareSlug: trip.metadata.publicSlug,
  });

  const ownerSession = {
    customer_id: ownerId,
    email: 'owner-c2@example.test',
    first_name: 'Jordan',
    last_name: 'Lee',
    display_name: 'Jordan Lee',
  };
  const turnRes = await handleAiImportChatTurn(db, {
    session: ownerSession,
    trip: { id: trip.id, title: trip.title, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date },
    requestText: 'I want to import vacation details from my AI',
    httpReq: { headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' } },
    now: () => fixedNow,
  });

  assert.equal(turnRes.ok, true);
  assert.ok(turnRes.aiImportCard, 'must return ONE AI import card');
  assert.equal(turnRes.aiImportCard.kind, 'ai_import_handoff');
  assert.equal(turnRes.aiImportCard.vacationName, 'Big Sur Coastal Escape');

  assert.equal(db.tables.vacation_mcp_tokens.length, 1);
  const tokenRow = db.tables.vacation_mcp_tokens[0];
  assert.equal(tokenRow.trip_id, trip.id);
  assert.equal(tokenRow.role, 'owner');
  assert.equal(tokenRow.created_by_email, 'owner-c2@example.test');
  assert.equal(tokenRow.metadata.personCustomerId, ownerId);
  const ttlDays = Math.round((new Date(tokenRow.expires_at).getTime() - fixedNow.getTime()) / (86400 * 1000));
  assert.equal(ttlDays, 30, 'silent AI token must default to 30-day expiry');

  const rawTokenMatch = turnRes.aiImportCard.copyText.match(/Authorization:\s*Bearer\s+(\S+)/);
  assert.ok(rawTokenMatch);
  const rawToken = rawTokenMatch[1];
  assert.equal(tokenRow.token_hash, hashMcpToken(rawToken, process.env));
  assert.equal(turnRes.aiImportCard.maskedToken, maskMcpToken(rawToken));
  assert.equal(turnRes.aiImportCard.maskedToken.includes(rawToken), false);

  assert.equal(turnRes.reply.includes(rawToken), false, 'plain chat reply must never include raw token');
  for (const storedTurn of db.tables.transcript_turns) {
    assert.equal(JSON.stringify(storedTurn).includes(rawToken), false, 'stored transcript row must never include raw token');
  }
  assert.match(turnRes.aiImportCard.copyText, /Nothing goes live in Vacay Keepsake until I review and approve/i);
  assert.match(turnRes.aiImportCard.copyText, /Big Sur Coastal Escape/);
  assert.doesNotMatch(turnRes.aiImportCard.copyText, /\btrips?\b/i);

  const liveBefore = db.liveSnapshot();
  const staged = await runGenericMcpClientFromPastedText(
    turnRes.aiImportCard.copyText,
    (reqOpts) => invokeRoute(apiHandler, reqOpts),
  );
  assert.equal(db.liveSnapshot(), liveBefore, 'live vacation must remain unchanged before in-chat approve');

  const approvalTurns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
    loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan Lee', firstName: 'Jordan' }],
  });
  const approvalTurn = approvalTurns.find((t) => t.payload?.aiApprovalCard?.changeSetId === staged.draftId);
  assert.ok(approvalTurn, 'chat must post staged preview approval message to that person');
  assert.equal(approvalTurn.payload.aiApprovalCard.status, 'pending_approval');
  assert.equal(approvalTurn.payload.aiApprovalCard.previewHash, staged.previewHash);
  assert.ok(approvalTurn.payload.aiApprovalCard.bullets.length >= 1);

  const otherCollabSession = {
    customer_id: crypto.randomUUID(),
    email: 'other@example.test',
    metadata: { seat: { role: 'collaborator', ownerCustomerId: ownerId, ownerTripId: trip.id, displayName: 'Pat' } },
  };
  const otherTurns = await loadTripScopedVacationAppTurns(db, otherCollabSession, trip.id, {
    loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan Lee', firstName: 'Jordan' }],
  });
  assert.equal(otherTurns.some((t) => t.payload?.aiApprovalCard?.changeSetId === staged.draftId), false, 'owner staged preview must not leak to another person');

  const approveRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${staged.draftId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-owner-c2' },
    body: { tripId: trip.id, preview_hash: staged.previewHash },
  });
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json.publishedVacationId, trip.id);
  assert.ok(db.tables.trip_things.filter((row) => row.trip_id === trip.id).length >= 5);

  const afterApproveTurns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
    loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan Lee', firstName: 'Jordan' }],
  });
  const updatedCard = afterApproveTurns.find((t) => t.payload?.aiApprovalCard?.changeSetId === staged.draftId);
  assert.equal(updatedCard.payload.aiApprovalCard.status, 'approved');

  const editRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: '/api/mcp',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawToken}` },
    body: {
      jsonrpc: '2.0',
      id: 'edit-decline',
      method: 'tools/call',
      params: {
        name: 'update_vacation',
        arguments: {
          summary: 'Add coastal bakery',
          operations: [{ op: 'add_item', item: { category: 'restaurant', title: 'Declined Bakery', unscheduled: true } }],
        },
      },
    },
  });
  assert.equal(editRes.statusCode, 200);
  const editId = editRes.json.result.structuredContent.change_set_id;
  const snapBeforeDecline = db.liveSnapshot();
  const declineRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${editId}/decline`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': 'sess-owner-c2' },
    body: { tripId: trip.id },
  });
  assert.equal(declineRes.statusCode, 200);
  assert.equal(db.liveSnapshot(), snapBeforeDecline);
  const afterDeclineTurns = await loadTripScopedVacationAppTurns(db, ownerSession, trip.id, {
    loadTranscriptAuthorPeople: async () => [{ id: ownerId, displayName: 'Jordan Lee', firstName: 'Jordan' }],
  });
  assert.equal(afterDeclineTurns.find((t) => t.payload?.aiApprovalCard?.changeSetId === editId).payload.aiApprovalCard.status, 'declined');
  setVacationMcpClock(null);
}

async function test_C7_first_open_idempotent_tokens_200() {
  let constraintCalls = 0;
  const raceDb = async (strings) => {
    const q = strings.join(' ').toLowerCase();
    if (q.includes('vacation_web_access_grants_role_check')) {
      constraintCalls += 1;
      if (constraintCalls > 1) {
        const err = new Error('constraint "vacation_web_access_grants_role_check" for relation "vacation_web_access_grants" already exists');
        err.code = '42710';
        throw err;
      }
    }
    if (q.includes('create table if not exists vacation_mcp_tokens')) {
      const err = new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"');
      err.code = '23505';
      throw err;
    }
    return [];
  };
  await Promise.all([
    ensureVacationWebAccessSchema(raceDb),
    ensureVacationWebAccessSchema(raceDb),
    ensureVacationMcpSchema(raceDb),
    ensureVacationMcpSchema(raceDb),
  ]);

  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const trip = db.seedVacation({ title: 'First Open Vacation', destination: 'Carmel, CA', startDate: '2026-08-01', endDate: '2026-08-03' });
  db.seedEditorSession({ tripId: trip.id, ownerCustomerId: trip.customer_id, email: 'first@example.test', role: 'owner', sessionToken: 'sess-c7', shareSlug: trip.metadata.publicSlug });
  const [tokensRes, changesRes] = await Promise.all([
    invokeRoute(apiHandler, { method: 'GET', url: `/api/mcp/tokens?shareToken=${trip.metadata.publicSlug}`, headers: { 'x-timesyncher-web-access-token': 'sess-c7' } }),
    invokeRoute(apiHandler, { method: 'GET', url: `/api/mcp/changes?shareToken=${trip.metadata.publicSlug}`, headers: { 'x-timesyncher-web-access-token': 'sess-c7' } }),
  ]);
  assert.equal(tokensRes.statusCode, 200);
  assert.equal(changesRes.statusCode, 200);
  assert.deepEqual(tokensRes.json.tokens, []);
}

async function test_C8_collaborator_end_to_end_throwaway() {
  const db = createMcpTestDb();
  useVacationMcpDatabase(db);
  const ownerId = crypto.randomUUID();
  const collabId = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const trip = db.seedVacation({
    ownerCustomerId: ownerId,
    title: 'Sonoma Wine Weekend',
    destination: 'Sonoma, CA',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
  });
  db.tables.vacation_collaborators.push({
    id: crypto.randomUUID(),
    invite_id: inviteId,
    owner_customer_id: ownerId,
    trip_id: trip.id,
    display_name: 'Morgan',
    status: 'active',
    metadata: { email: 'throwaway-collab-c8@example.test', onboardingToken: 'collab-app-tok-c8' },
  });
  const cookieDb = async (strings) => {
    const q = strings.join(' ').toLowerCase();
    if (q.includes('from vacation_collaborators')) return [{ id: 'c-c8', trip_id: trip.id, metadata: { email: 'throwaway-collab-c8@example.test' } }];
    if (q.includes('from trips')) return [{ id: trip.id, customer_id: ownerId, title: trip.title, metadata: trip.metadata }];
    if (q.includes('insert into vacation_web_access_grants')) return [{ id: 'g-c8', role: 'web_editor', status: 'accepted' }];
    return [];
  };
  const cookieHeader = await vacationAppCollaboratorWebAccessCookie(cookieDb, { headers: {} }, {
    session: { customer_id: collabId, email: 'throwaway-collab-c8@example.test', token: 'collab-app-tok-c8' },
    seat: { role: 'collaborator', ownerCustomerId: ownerId, ownerTripId: trip.id, displayName: 'Morgan', inviteId },
    tripId: trip.id,
    env: { TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation-staging.timesyncher.com' },
  });
  assert.ok(cookieHeader.includes(`${webAccessCookieName()}=`));
  const collabSessionToken = 'sess-collab-c8';
  db.seedEditorSession({
    tripId: trip.id,
    ownerCustomerId: ownerId,
    email: 'throwaway-collab-c8@example.test',
    role: 'web_editor',
    sessionToken: collabSessionToken,
    shareSlug: trip.metadata.publicSlug,
  });

  const collabSession = {
    customer_id: collabId,
    email: 'throwaway-collab-c8@example.test',
    first_name: 'Morgan',
    display_name: 'Morgan',
    token: 'collab-app-tok-c8',
    metadata: {
      seat: { role: 'collaborator', ownerCustomerId: ownerId, ownerTripId: trip.id, displayName: 'Morgan', inviteId },
    },
  };
  const cardTurn = await handleAiImportChatTurn(db, {
    session: collabSession,
    trip: { id: trip.id, title: trip.title, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date },
    requestText: 'Can I import our vacation details from ChatGPT?',
    httpReq: { headers: { host: 'vacation-staging.timesyncher.com', 'x-forwarded-proto': 'https' } },
  });
  assert.equal(cardTurn.ok, true);
  assert.equal(cardTurn.aiImportCard.role, 'collaborator');
  assert.equal(db.tables.vacation_mcp_tokens[0].role, 'collaborator');
  assert.equal(db.tables.vacation_mcp_tokens[0].created_by_email, 'throwaway-collab-c8@example.test');

  const staged = await runGenericMcpClientFromPastedText(
    cardTurn.aiImportCard.copyText,
    (reqOpts) => invokeRoute(apiHandler, reqOpts),
  );
  const collabTurns = await loadTripScopedVacationAppTurns(db, collabSession, trip.id, {
    loadTranscriptAuthorPeople: async () => [
      { id: ownerId, displayName: 'Owner', firstName: 'Owner' },
      { id: collabId, displayName: 'Morgan', firstName: 'Morgan' },
    ],
  });
  const collabApproval = collabTurns.find((t) => t.payload?.aiApprovalCard?.changeSetId === staged.draftId);
  assert.ok(collabApproval, 'collaborator must receive in-chat approval card');

  const ownerTurns = await loadTripScopedVacationAppTurns(db, { customer_id: ownerId, email: 'throwaway-owner-c8@example.test' }, trip.id, {
    loadTranscriptAuthorPeople: async () => [
      { id: ownerId, displayName: 'Owner', firstName: 'Owner' },
      { id: collabId, displayName: 'Morgan', firstName: 'Morgan' },
    ],
  });
  assert.equal(ownerTurns.some((t) => t.payload?.aiApprovalCard?.changeSetId === staged.draftId), false, 'collaborator card stays scoped to collaborator');

  const approveRes = await invokeRoute(apiHandler, {
    method: 'POST',
    url: `/api/mcp/changes/${staged.draftId}/approve`,
    headers: { 'content-type': 'application/json', 'x-timesyncher-web-access-token': collabSessionToken },
    body: { tripId: trip.id, shareToken: trip.metadata.publicSlug, preview_hash: staged.previewHash },
  });
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.json.publishedVacationId, trip.id);
  assert.ok(db.tables.trip_things.filter((r) => r.trip_id === trip.id).length >= 5);
}

async function test_C6_and_copy_invariants() {
  const bundle = await readFile(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
  const configStart = bundle.indexOf('children:"Vacation View"');
  assert.ok(configStart > 0);
  const configSlice = bundle.slice(configStart, configStart + 600);
  assert.equal(configSlice.includes('AI Access & Approvals'), false, 'Config Options must not contain AI Access & Approvals');
  assert.equal(configSlice.includes('data-ts-mcp-open'), false, 'Config Options must not open MCP panel');

  const gridStart = bundle.indexOf('"data-ts-vacation-grid-root":"1"');
  assert.ok(gridStart > 0, 'bottom grid admin entry must exist in served bundle');
  const gridSlice = bundle.slice(gridStart, gridStart + 2600);
  assert.ok(gridSlice.includes('["flights","cars","hotels"]'), 'bottom grid menu must include show/hide for flights, cars, hotels');
  assert.ok(gridSlice.includes('AI Access & Approvals'), 'bottom grid menu must include AI Access & Approvals');
  assert.ok(gridSlice.includes('__tsOpenMcpPanel("approvals")'));
  assert.ok(gridSlice.includes('__tsOpenMcpPanel("tokens")'));

  const chatClient = await readFile(new URL('../public/vacation-app-ai-import.js', import.meta.url), 'utf8');
  assert.doesNotMatch(chatClient, /\btrips?\b/i);
  assert.match(chatClient, /data-ai-import-copy/);
  assert.match(chatClient, /data-ai-chat-approve/);
  assert.match(chatClient, /data-ai-chat-decline/);
}

await test_C1_intent_recognition();
await test_C2_C3_C4_C5_owner_flow_and_generic_mcp_client();
await test_C7_first_open_idempotent_tokens_200();
await test_C8_collaborator_end_to_end_throwaway();
await test_C6_and_copy_invariants();
useVacationMcpDatabase(null);
console.log('vacation mcp #1070 chat-first AI import tests C1-C8 passed');
