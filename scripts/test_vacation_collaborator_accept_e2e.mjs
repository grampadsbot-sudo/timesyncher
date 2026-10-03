import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { activationStatusPersistent, createOnboardingSessionPersistent, loadSessionPersistent, sessionKey } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { openCollaboratorAppSeats } from '../src/vacation/collaborator-app-seat.mjs';
import { attachSessionCollaboratorInvitesToTrip, collaboratorEulaAcceptUrl, collaboratorEulaClientKey } from '../src/vacation/collaborators.mjs';
import { collaboratorInviteEmail, queueOrSendCollaboratorInviteEmail } from '../src/vacation/email.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { webAccessTokenHash } from '../src/vacation/web-access.mjs';
import { transcriptAuthorMissingError, turnAuthorLabel } from '../src/vacation/turn-author.mjs';
import { buildState, createHttpCaller, dbFor } from './fixtures/vacation-collaborator-accept-e2e-fixtures.mjs';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;

const storeDir = await mkdtemp(path.join(tmpdir(), 'collab-accept-e2e-'));
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_SITE_BASE_URL = process.env.TIMESYNCHER_SITE_BASE_URL || 'https://vacation-staging.timesyncher.com/';
process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS || '2500';
process.env.TIMESYNCHER_COLLABORATOR_NAME = process.env.TIMESYNCHER_COLLABORATOR_NAME || 'Collaborator seat';
process.env.TIMESYNCHER_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only';

const { default: handler } = await import('../api/[...route].mjs');
const { useOnboardingLookup } = await import('../routes/eula.mjs');
const { useVacationAppDatabase } = await import('../routes/vacation-itinerary.mjs');
const call = createHttpCaller(handler);

assert.match(collaboratorInviteEmail({
  contact: { firstName: 'Alex', email: 'alex@example.com' },
  invite: { id: crypto.randomUUID(), trip_id: crypto.randomUUID(), owner_display_name: 'Owner Ada', trip_title: 'Harbor Ridge Week' },
  acceptUrl: 'https://vacation-staging.timesyncher.com/accept/vacation-collaborator-x',
}).subject, /Owner Ada invited you to edit Harbor Ridge Week/);

const badTurn = { speaker: 'customer', direction: 'inbound', authorId: 'unknown-person', authorName: '' };
assert.equal(turnAuthorLabel(badTurn, { viewerId: 'viewer-1', customer_id: 'viewer-1' }, []).reason, 'author_name_missing');
assert.equal(transcriptAuthorMissingError(badTurn, { customer_id: 'viewer-1' }).event, 'transcript_author_missing');

async function inviteCollaboratorViaChat(state) {
  const invited = await call('POST', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.ownerToken)}`, {
    action: 'collaborator-invite',
    name: 'Alex',
    email: 'alex@example.com',
  });
  assert.equal(invited.statusCode, 200, invited.body);
  const payload = JSON.parse(invited.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.inviteResult?.code, 'collaborator_invite_sent');
  assert.ok(state.invites.length >= 1);
  assert.equal(state.invites[state.invites.length - 1].status, 'paid');
  assert.equal(state.invites[state.invites.length - 1].metadata.payer, 'owner');
}

async function acceptCollaboratorInvite(state) {
  assert.equal((await call('GET', `/accept/vacation-collaborator-${state.inviteId}`)).statusCode, 200);
  const accept = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-collaborator-${state.inviteId}`)}`, {
    acceptedByName: 'Alex',
    checkboxConfirmed: true,
  });
  assert.equal(accept.statusCode, 201, accept.body);
  const acceptPayload = JSON.parse(accept.body);
  assert.ok(acceptPayload.redirectUrl);
  const invite = state.invites.find((row) => row.id === state.inviteId) || state.invites[state.invites.length - 1];
  assert.ok(invite, 'invite row missing after accept');
  assert.notEqual(invite.status, 'pending_payment', `invite ${invite.id} still pending_payment after accept`);
  return acceptPayload;
}

async function runPreSiteFlow() {
  const state = buildState({ withTrip: false, withInvite: false });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);

  await inviteCollaboratorViaChat(state);
  if (state.tripId) {
    for (const row of state.transcript) {
      if (row.customer_id === state.ownerCustomerId && row.trip_id == null) row.trip_id = state.tripId;
    }
    if (state.ownerSession) state.ownerSession.trip_id = state.tripId;
  }
  await acceptCollaboratorInvite(state);

  const store = createPersistentStoreFromEnv(process.env);
  const activation = await activationStatusPersistent(store, collaboratorEulaClientKey({ id: state.inviteId }), process.env.TIMESYNCHER_EULA_VERSION);
  assert.equal(activation.ok, true, JSON.stringify(await loadSessionPersistent(store, `vacation-collaborator-${state.inviteId}`)));

  const appPayload = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`)).body);
  const expectedPreWelcome = renderOnboardingWelcome({
    audience: 'collaborator_no_site',
    collabFirstName: 'Alex',
    ownerFirstName: 'Owner',
    tripTitle: 'this vacation',
  });
  const welcomeFromTranscript = state.transcript.filter((row) => row.speaker === 'app'
    && (row.payload?.welcomeAudience === 'collaborator' || row.payload?.welcomeAudience === 'collaborator_no_site'));
  assert.equal(welcomeFromTranscript.length, 1);
  assert.doesNotMatch(String(welcomeFromTranscript[0]?.body || ''), /https?:\/\//);
  const welcomeInApp = (appPayload.turns || []).filter((turn) => turn.body === welcomeFromTranscript[0].body);
  assert.equal(welcomeInApp.length || welcomeFromTranscript.length, 1);
  assert.equal(appPayload.turns.find((turn) => turn.body === 'Owner planning note')?.authorLabel, 'Owner Ada');

  await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  assert.equal(state.transcript.filter((row) => row.speaker === 'app'
    && (row.payload?.welcomeAudience === 'collaborator' || row.payload?.welcomeAudience === 'collaborator_no_site')).length, 1);

  state.transcript.push({
    customer_id: state.ownerCustomerId,
    trip_id: state.tripId || null,
    speaker: 'customer',
    body: 'Collaborator planning note',
    channel: 'vacation-app',
    payload: { authorId: state.collabCustomerId, authorName: 'Alex' },
    direction: 'inbound',
  });
  const ownerPayload = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.ownerToken)}`)).body);
  assert.equal(ownerPayload.turns.find((turn) => turn.body === 'Collaborator planning note')?.authorLabel, 'Alex');
  const collabPayload2 = JSON.parse((await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`)).body);
  assert.equal(collabPayload2.turns.find((turn) => turn.body === 'Collaborator planning note')?.authorLabel, 'You');

  await queueOrSendCollaboratorInviteEmail(db, {
    invite: state.invites[0],
    contact: { email: 'alex@example.com', displayName: 'Alex' },
    acceptUrl: collaboratorEulaAcceptUrl({ id: state.inviteId }, process.env),
  }, process.env);
  assert.equal(state.outboundEmails.length, 1);

  state.tripId = crypto.randomUUID();
  state.trips.push({
    id: state.tripId,
    customer_id: state.ownerCustomerId,
    title: 'Harbor Ridge Week',
    destination: 'Neutral Bay',
    metadata: { publicUrl: state.siteUrl, shareToken: 'harbor-ridge-neutral' },
    status: 'planning',
  });
  await attachSessionCollaboratorInvitesToTrip(db, {
    ownerCustomerId: state.ownerCustomerId,
    tripId: state.tripId,
    onboardingSessionId: state.ownerSessionId,
  });
  assert.equal((await queueOrSendCollaboratorInviteEmail(db, {
    invite: state.invites[0],
    contact: { email: 'alex@example.com', displayName: 'Alex' },
    publicUrl: state.siteUrl,
  }, process.env)).status, 'already_sent');
  assert.equal(state.outboundEmails.length, 1);
}

async function runPostSiteFlow() {
  const state = buildState({ withTrip: true, withInvite: false });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);

  await inviteCollaboratorViaChat(state);
  await acceptCollaboratorInvite(state);

  const expectedPostWelcome = renderOnboardingWelcome({
    audience: 'collaborator',
    collabFirstName: 'Alex',
    ownerFirstName: 'Owner',
    tripTitle: 'Harbor Ridge Week',
    tripSiteUrl: state.siteUrl,
  });
  await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  const postWelcomeTurns = state.transcript.filter((row) => row.speaker === 'app'
    && (row.payload?.welcomeAudience === 'collaborator' || row.payload?.welcomeAudience === 'collaborator_no_site'));
  assert.equal(postWelcomeTurns.length, 1);
  assert.equal(postWelcomeTurns[0].body, expectedPostWelcome);
  const emailsBefore = state.outboundEmails.length;
  await openCollaboratorAppSeats(db, {
    ownerCustomerId: state.ownerCustomerId,
    tripId: state.tripId,
    onboardingSessionId: null,
    seats: [{ name: 'Bryn', email: 'bryn@example.com' }],
    env: process.env,
  });
  assert.equal(state.outboundEmails.length, emailsBefore + 1);
  const postInviteId = state.invites[state.invites.length - 1]?.id;
  const postAcceptUrl = collaboratorEulaAcceptUrl({ id: postInviteId }, process.env);
  assert.match(collaboratorInviteEmail({
    contact: { firstName: 'Bryn', email: 'bryn@example.com' },
    invite: { id: postInviteId, trip_id: state.tripId, owner_display_name: 'Owner Ada', trip_title: 'Harbor Ridge Week' },
    acceptUrl: postAcceptUrl,
    publicUrl: state.siteUrl,
  }).textBody, /\/accept\/vacation-collaborator-/);
}

async function runStaleBlobHydratesJoin() {
  const state = buildState({ withTrip: false, withInvite: false });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);
  await inviteCollaboratorViaChat(state);

  const store = createPersistentStoreFromEnv(process.env);
  const sessionId = `vacation-collaborator-${state.inviteId}`;
  await store.putJson(sessionKey(sessionId), await createOnboardingSessionPersistent(store, {
    sessionId,
    clientKey: collaboratorEulaClientKey({ id: state.inviteId }),
    clientLabel: 'Alex',
    contact: { email: 'alex@example.com', phone: null },
    selectedFunctionality: ['vacation_planning_onboarding'],
    google: { returnUrl: 'https://example.com/stale' },
    eula: { version: process.env.TIMESYNCHER_EULA_VERSION, text: 'Terms' },
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }));

  await acceptCollaboratorInvite(state);
  assert.equal(state.invites[0].status, 'accepted');
  assert.ok(state.collabSession?.token);
}

async function runWebAccessGrantRedirects() {
  const state = buildState({ withTrip: true, withInvite: false });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);
  await inviteCollaboratorViaChat(state);

  const legacyToken = 'legacy-grant-token';
  state.webAccessGrants.push({
    id: crypto.randomUUID(),
    trip_id: state.tripId,
    email: 'alex@example.com',
    role: 'web_editor',
    status: 'invited',
    invite_token_hash: webAccessTokenHash(legacyToken, process.env),
    metadata: {},
  });
  const legacy = await call('GET', `/api/vacation-web-access?action=accept&token=${encodeURIComponent(legacyToken)}`);
  assert.equal(legacy.statusCode, 302);
  assert.match(legacy.headers.location || '', /\/accept\/vacation-collaborator-/);

  const modernToken = 'modern-grant-token';
  state.webAccessGrants.push({
    id: crypto.randomUUID(),
    trip_id: state.tripId,
    email: 'alex@example.com',
    role: 'telegram_collaborator',
    status: 'invited',
    invite_token_hash: webAccessTokenHash(modernToken, process.env),
    metadata: { collaboratorInviteId: state.inviteId },
  });
  const modern = await call('GET', `/api/vacation-web-access?action=accept&token=${encodeURIComponent(modernToken)}`);
  assert.equal(modern.statusCode, 302);
  assert.equal(modern.headers.location, collaboratorEulaAcceptUrl({ id: state.inviteId }, process.env));

  const orphanToken = 'orphan-grant-token';
  state.webAccessGrants.push({
    id: crypto.randomUUID(),
    trip_id: state.tripId,
    email: 'missing@example.com',
    role: 'telegram_collaborator',
    status: 'invited',
    invite_token_hash: webAccessTokenHash(orphanToken, process.env),
    metadata: {},
  });
  const orphan = await call('GET', `/api/vacation-web-access?action=accept&token=${encodeURIComponent(orphanToken)}`);
  assert.equal(orphan.statusCode, 409);
  assert.match(orphan.body, /collaborator_web_access_invite_unresolved/);
}

async function runMissingAuthorFailure() {
  const state = buildState({ withTrip: false });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);
  state.transcript.push({
    customer_id: state.ownerCustomerId,
    trip_id: null,
    speaker: 'customer',
    body: 'Unlabeled stranger turn',
    channel: 'vacation-app',
    payload: { authorId: '00000000-0000-0000-0000-000000000001', authorName: 'Nobody' },
    direction: 'inbound',
  });
  await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-collaborator-${state.inviteId}`)}`, {
    acceptedByName: 'Alex',
    checkboxConfirmed: true,
  });
  const broken = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  assert.notEqual(broken.statusCode, 200);
  assert.match(broken.body, /transcript_author_missing/);
}

try {
  await runPreSiteFlow();
  await runPostSiteFlow();
  await runStaleBlobHydratesJoin();
  await runWebAccessGrantRedirects();
  await runMissingAuthorFailure();
} finally {
  useOnboardingLookup(null);
  useVacationAppDatabase(null);
  await rm(storeDir, { recursive: true, force: true });
}

console.log('vacation collaborator accept e2e passed');
