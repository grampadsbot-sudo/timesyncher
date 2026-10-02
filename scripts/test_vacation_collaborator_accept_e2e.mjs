import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { activationStatusPersistent, loadSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { attachSessionCollaboratorInvitesToTrip, collaboratorEulaAcceptUrl, collaboratorEulaClientKey } from '../src/vacation/collaborators.mjs';
import { openCollaboratorAppSeats } from '../src/vacation/collaborator-app-seat.mjs';
import { collaboratorInviteEmail, queueOrSendCollaboratorInviteEmail } from '../src/vacation/email.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { transcriptAuthorMissingError, turnAuthorLabel } from '../src/vacation/turn-author.mjs';

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

function mockRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload ?? ''); },
  };
}

function request(method, url, json) {
  return {
    method,
    url,
    headers: { 'user-agent': 'collaborator-accept-e2e' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (json) yield Buffer.from(JSON.stringify(json));
    },
  };
}

async function call(method, url, json) {
  const res = mockRes();
  await handler(request(method, url, json), res);
  return res;
}

function buildState({ withTrip = false } = {}) {
  const ownerCustomerId = crypto.randomUUID();
  const ownerSessionId = crypto.randomUUID();
  const ownerToken = 'owner-session-token';
  const tripId = withTrip ? crypto.randomUUID() : null;
  const inviteId = crypto.randomUUID();
  const inviteToken = 'collab-invite-token';
  const collabCustomerId = crypto.randomUUID();
  const collabSessionId = crypto.randomUUID();
  const collabToken = 'collab-session-token';
  return {
    ownerCustomerId,
    ownerSessionId,
    ownerToken,
    tripId,
    inviteId,
    inviteToken,
    collabCustomerId,
    collabSessionId,
    collabToken,
    invites: [{
      id: inviteId,
      owner_customer_id: ownerCustomerId,
      trip_id: tripId,
      plan_code: 'telegram_collaborators_single_trip',
      scope: 'single_trip',
      requested_for: 'Alex',
      status: 'pending_payment',
      metadata: {
        payer: 'owner',
        email: 'alex@example.com',
        displayName: 'Alex',
        channel: 'vacation-app',
        onboardingSessionId: ownerSessionId,
        deferredWebEditor: !withTrip,
      },
      owner_display_name: 'Owner Ada',
      owner_email: 'owner@example.com',
      trip_title: withTrip ? 'Harbor Ridge Week' : null,
    }],
    ownerSession: {
      id: ownerSessionId,
      customer_id: ownerCustomerId,
      trip_id: tripId,
      token: ownerToken,
      status: 'purchase_confirmed',
      metadata: {},
      display_name: 'Owner Ada',
      first_name: 'Owner',
      last_name: 'Ada',
      email: 'owner@example.com',
    },
    collabSession: null,
    collaborators: [],
    transcript: [{
      customer_id: ownerCustomerId,
      trip_id: null,
      speaker: 'customer',
      body: 'Owner planning note',
      channel: 'vacation-app',
      payload: {},
      direction: 'inbound',
    }],
    welcomes: new Set(),
    outboundEmails: [],
    customers: {
      [ownerCustomerId]: { id: ownerCustomerId, first_name: 'Owner', display_name: 'Owner Ada', email: 'owner@example.com' },
    },
    siteUrl: 'https://www.timesyncher.com/v/harbor-ridge-neutral',
    trips: withTrip ? [{
      id: tripId,
      customer_id: ownerCustomerId,
      title: 'Harbor Ridge Week',
      destination: 'Neutral Bay',
      metadata: { publicUrl: 'https://www.timesyncher.com/v/harbor-ridge-neutral', shareToken: 'harbor-ridge-neutral' },
      status: 'planning',
    }] : [],
    eulaStoreDir: null,
  };
}

function dbFor(state) {
  return async (strings, ...values) => {
    const text = sqlText(strings);
    if (/insert into vacation_collaborator_invites/i.test(text)) {
      const id = crypto.randomUUID();
      state.invites.push({
        id,
        owner_customer_id: state.ownerCustomerId,
        trip_id: values.find((v) => v === state.tripId) || state.tripId,
        plan_code: 'telegram_collaborators_single_trip',
        scope: 'single_trip',
        requested_for: values.find((v) => typeof v === 'string' && v.includes('@')) ? 'Bryn' : 'Alex',
        status: 'pending_payment',
        metadata: values.find((v) => v && typeof v === 'object' && v.email) || {},
        owner_display_name: 'Owner Ada',
        owner_email: 'owner@example.com',
        trip_title: state.trips[0]?.title || null,
      });
      return [{ id, token: 'invite-token' }];
    }
    if (/from vacation_collaborator_invites/i.test(text) && /where i\.id =/i.test(text)) {
      const id = values.find((v) => typeof v === 'string' && state.invites.some((row) => row.id === v));
      const invite = state.invites.find((row) => row.id === id);
      return invite ? [invite] : [];
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'paid'/i.test(text)) {
      const invite = state.invites[0];
      invite.status = 'paid';
      return [invite];
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'accepted'/i.test(text)) {
      const invite = state.invites[0];
      invite.status = 'accepted';
      const metaPatch = values.find((v) => v && typeof v === 'object' && !Array.isArray(v) && ('collaboratorOnboardingToken' in v || 'paidVia' in v));
      invite.metadata = { ...invite.metadata, ...(metaPatch || {}), collaboratorOnboardingToken: state.collabToken, collaboratorCustomerId: state.collabCustomerId };
      return [];
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set trip_id =/i.test(text)) {
      state.invites[0].trip_id = values.find((v) => typeof v === 'string' && v !== state.ownerCustomerId && v !== state.ownerSessionId) || state.tripId;
      return [state.invites[0]];
    }
    if (/insert into customers/i.test(text)) {
      const id = crypto.randomUUID();
      state.collabCustomerId = id;
      state.customers[id] = { id, first_name: 'Alex', display_name: 'Alex', email: 'alex@example.com' };
      return [{ id }];
    }
    if (/insert into onboarding_sessions/i.test(text)) {
      const token = values[2];
      const metadata = values[6] && typeof values[6] === 'object'
        ? values[6]
        : { seat: { role: 'collaborator', ownerCustomerId: state.ownerCustomerId, ownerOnboardingSessionId: state.ownerSessionId, inviteId: state.inviteId, displayName: 'Alex', payer: 'owner' }, source: 'collaborator_app_seat' };
      state.collabSession = {
        id: state.collabSessionId,
        customer_id: state.collabCustomerId,
        trip_id: state.tripId,
        token,
        status: 'purchase_confirmed',
        metadata,
        display_name: 'Alex',
        first_name: 'Alex',
        email: 'alex@example.com',
      };
      state.collabToken = token;
      return [state.collabSession];
    }
    if (/from onboarding_sessions/i.test(text) && /where onboarding_sessions\.token =/i.test(text)) {
      const token = values[0];
      if (token === state.ownerToken) return [state.ownerSession];
      if (token === state.collabToken && state.collabSession) return [state.collabSession];
      return [];
    }
    if (/insert into vacation_collaborators/i.test(text)) {
      state.collaborators.push({
        invite_id: state.inviteId,
        trip_id: state.tripId,
        owner_customer_id: state.ownerCustomerId,
        display_name: 'Alex',
        metadata: {},
      });
      return [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      const key = `${values[0]}:${values[1]}`;
      if (state.welcomes.has(key)) return [];
      state.welcomes.add(key);
      return [{ id: crypto.randomUUID() }];
    }
    if (/from customers/i.test(text) && /where id =/i.test(text)) {
      const id = values[0];
      return state.customers[id] ? [state.customers[id]] : [];
    }
    if (/from customers/i.test(text) && /first_name/i.test(text)) {
      const id = values.find((v) => state.customers[v]) || state.ownerCustomerId;
      return state.customers[id] ? [state.customers[id]] : [];
    }
    if (/from vacation_collaborators c/i.test(text)) {
      return state.collaborators.map((row) => ({
        display_name: row.display_name || 'Alex',
        metadata: row.metadata || {},
        invite_metadata: { collaboratorCustomerId: state.collabCustomerId },
      }));
    }
    if (/from outbound_emails/i.test(text)) {
      const inviteId = values.find((v) => typeof v === 'string' && state.invites.some((row) => row.id === v));
      if (!inviteId) return [];
      return state.outboundEmails.filter((row) => row.collaboratorInviteId === inviteId);
    }
    if (/insert into outbound_emails/i.test(text)) {
      const meta = values.find((v) => v && typeof v === 'object' && v.collaboratorInviteId);
      if (meta?.collaboratorInviteId) {
        state.outboundEmails.push({
          id: crypto.randomUUID(),
          collaboratorInviteId: meta.collaboratorInviteId,
          status: 'sent',
          subject: values.find((v) => typeof v === 'string' && v.includes('invited you')),
        });
      }
      return [{ id: crypto.randomUUID() }];
    }
    if (/update outbound_emails/i.test(text)) return [{ id: crypto.randomUUID() }];
    if (/from transcript_turns/i.test(text)) {
      const customerId = values.find((v) => v === state.ownerCustomerId) || state.ownerCustomerId;
      const tripScoped = /trip_id =/i.test(text) && !/trip_id is null/i.test(text);
      const rows = state.transcript.filter((row) => {
        if (row.customer_id !== customerId) return false;
        if (tripScoped) return row.trip_id === state.tripId;
        return row.trip_id == null;
      });
      return rows.slice().reverse();
    }
    if (/insert into transcript_turns/i.test(text)) {
      let speaker = 'customer';
      let body = '';
      let channel = 'vacation-app';
      let payload = {};
      let direction = 'inbound';
      if (/response_latency_ms/i.test(text)) {
        speaker = 'app';
        body = String(values[2] || '');
        payload = values[3] || {};
        direction = 'outbound';
        if (state.transcript.some((row) => row.speaker === 'app' && row.body === body && body)) {
          return [{ id: 'welcome-dup' }];
        }
      } else if (/collaborator_seat_join|speaker, channel, body, payload, direction, sent_at/i.test(text) && values[2] === 'system') {
        speaker = 'system';
        body = '';
        payload = values[5] || {};
        direction = 'system';
      } else if (/speaker, channel, body, payload, direction, sent_at/i.test(text)) {
        speaker = String(values[2] || 'system');
        body = String(values[4] || '');
        payload = values[5] || {};
        direction = String(values[6] || 'system');
      } else {
        body = String(values.find((v) => typeof v === 'string' && v === 'Owner planning note') || '');
      }
      state.transcript.push({
        customer_id: values[0],
        trip_id: values[1],
        speaker,
        body,
        channel,
        payload,
        direction,
      });
      return [{ id: crypto.randomUUID() }];
    }
    if (/from trips/i.test(text)) return state.trips;
    if (/update vacation_collaborators/i.test(text)) {
      for (const row of state.collaborators) row.trip_id = state.tripId;
      return [];
    }
    if (/update onboarding_sessions/i.test(text) && /jsonb_set/i.test(text)) {
      if (state.collabSession) state.collabSession.trip_id = state.tripId;
      return [];
    }
    if (/from vacation_collaborators/i.test(text)) return [];
    return [];
  };
}

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_BLOB_STORE_ID;

const storeDir = await mkdtemp(path.join(tmpdir(), 'collab-accept-e2e-'));
process.env.TIMESYNCHER_ONBOARDING_STORE = storeDir;
process.env.TIMESYNCHER_EULA_STORE = '';
process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS = process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS || '2500';
process.env.TIMESYNCHER_COLLABORATOR_NAME = process.env.TIMESYNCHER_COLLABORATOR_NAME || 'Collaborator seat';
process.env.TIMESYNCHER_EULA_VERSION = process.env.TIMESYNCHER_EULA_VERSION || '2026-06-terms-advisory-only';

const { default: handler } = await import('../api/[...route].mjs');
const { useOnboardingLookup } = await import('../routes/eula.mjs');
const { useVacationAppDatabase } = await import('../routes/vacation-itinerary.mjs');

const emailWithTrip = collaboratorInviteEmail({
  contact: { firstName: 'Alex', email: 'alex@example.com' },
  invite: {
    id: crypto.randomUUID(),
    trip_id: crypto.randomUUID(),
    owner_display_name: 'Owner Ada',
    trip_title: 'Harbor Ridge Week',
  },
  acceptUrl: 'https://vacation-staging.timesyncher.com/accept/vacation-collaborator-x',
});
assert.match(emailWithTrip.subject, /Owner Ada invited you to edit Harbor Ridge Week/);
assert.doesNotMatch(emailWithTrip.textBody, /the vacation owner/);

const emailPreSite = collaboratorInviteEmail({
  contact: { firstName: 'Alex', email: 'alex@example.com' },
  invite: {
    id: crypto.randomUUID(),
    trip_id: null,
    owner_display_name: 'Owner Ada',
    trip_title: null,
  },
  acceptUrl: 'https://vacation-staging.timesyncher.com/accept/vacation-collaborator-x',
});
assert.match(emailPreSite.subject, /Owner Ada invited you to a TimeSyncher Vacation/);
assert.doesNotMatch(emailPreSite.textBody, /edit null/);
assert.match(emailPreSite.textBody, /review and accept the terms/i);
const emailNoName = collaboratorInviteEmail({
  contact: { email: 'alex@example.com' },
  invite: { id: crypto.randomUUID(), owner_display_name: 'Owner Ada', trip_id: null },
  acceptUrl: 'https://example.com/accept',
});
assert.doesNotMatch(emailNoName.textBody, /Hi alex@/i);
assert.match(emailNoName.textBody, /^Hello,/m);

const logs = [];
const originalLog = console.log;
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('{')) logs.push(JSON.parse(args[0]));
  originalLog(...args);
};
collaboratorInviteEmail({
  contact: { firstName: 'Alex', email: 'alex@example.com' },
  invite: {
    id: crypto.randomUUID(),
    owner_display_name: '',
    owner_email: 'owner@example.com',
    trip_id: null,
  },
  acceptUrl: 'https://example.com/accept',
});
console.log = originalLog;
assert.equal(logs.some((row) => row.event === 'invite_email_owner_name_missing'), true);

async function runPreSiteFlow() {
  const state = buildState({ withTrip: false });
  const db = dbFor(state);
  db.transaction = async (fn) => fn(db);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);

  const acceptPage = await call('GET', `/accept/vacation-collaborator-${state.inviteId}`);
  assert.equal(acceptPage.statusCode, 200, acceptPage.body.slice(0, 200));
  assert.match(acceptPage.body, /Review & continue/);
  assert.doesNotMatch(acceptPage.body, /Acceptance session not found/);

  const accept = await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-collaborator-${state.inviteId}`)}`, {
    acceptedByName: 'Alex',
    checkboxConfirmed: true,
  });
  assert.equal(accept.statusCode, 201, accept.body);
  const acceptPayload = JSON.parse(accept.body);
  assert.match(acceptPayload.redirectUrl, /vacation-app\.html\?session=/);
  const store = createPersistentStoreFromEnv(process.env);
  const eulaSessionId = `vacation-collaborator-${state.inviteId}`;
  const stored = await loadSessionPersistent(store, eulaSessionId);
  const activation = await activationStatusPersistent(store, collaboratorEulaClientKey({ id: state.inviteId }), process.env.TIMESYNCHER_EULA_VERSION);
  if (!activation.ok) {
    throw new Error(`activation failed after accept: ${JSON.stringify({ storedStatus: stored?.status, activation })}`);
  }

  const appGet = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  const appPayload = JSON.parse(appGet.body);
  assert.equal(appGet.statusCode, 200, appGet.body);
  assert.equal(appPayload.eula.accepted, true);
  const expectedPreWelcome = renderOnboardingWelcome({
    audience: 'collaborator_no_site',
    collabFirstName: 'Alex',
    ownerFirstName: 'Owner',
    tripTitle: 'this vacation',
  });
  const welcomeTurns = appPayload.turns.filter((turn) => turn.body === expectedPreWelcome);
  assert.equal(welcomeTurns.length, 1, `turns=${JSON.stringify(appPayload.turns.map((turn) => turn.body))}`);
  assert.doesNotMatch(welcomeTurns[0].body, /https?:\/\//);
  assert.equal(appPayload.turns.some((turn) => turn.body === 'Owner planning note'), true);
  const ownerPlanning = appPayload.turns.find((turn) => turn.body === 'Owner planning note');
  assert.equal(ownerPlanning?.authorLabel, 'Owner');
  assert.ok(appPayload.turns.every((turn) => {
    if (turn.speaker === 'system' || turn.direction === 'system') return true;
    return String(turn.authorLabel || '').trim().length > 0;
  }));

  state.transcript.push({
    customer_id: state.ownerCustomerId,
    trip_id: null,
    speaker: 'customer',
    body: 'Collaborator planning note',
    channel: 'vacation-app',
    payload: { authorId: state.collabCustomerId, authorName: 'Alex' },
    direction: 'inbound',
  });
  const ownerGet = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.ownerToken)}`);
  const ownerPayload = JSON.parse(ownerGet.body);
  assert.equal(ownerGet.statusCode, 200, ownerGet.body);
  const ownerSeesCollab = ownerPayload.turns.find((turn) => turn.body === 'Collaborator planning note');
  assert.equal(ownerSeesCollab?.authorLabel, 'Alex');
  const collabSeesSelf = (await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`));
  const collabPayload2 = JSON.parse(collabSeesSelf.body);
  assert.equal(collabPayload2.turns.find((turn) => turn.body === 'Collaborator planning note')?.authorLabel, 'You');
  assert.equal(collabPayload2.turns.find((turn) => turn.body === 'Owner planning note')?.authorLabel, 'Owner');

  const inviteAcceptUrl = collaboratorEulaAcceptUrl({ id: state.inviteId }, process.env);
  await queueOrSendCollaboratorInviteEmail(db, {
    invite: state.invites[0],
    contact: { email: 'alex@example.com', displayName: 'Alex' },
    acceptUrl: inviteAcceptUrl,
  }, process.env);
  assert.equal(state.outboundEmails.length, 1);
  assert.match(state.outboundEmails[0].subject || '', /invited you/i);

  const secondGet = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  const secondPayload = JSON.parse(secondGet.body);
  assert.equal(secondPayload.turns.filter((turn) => turn.body === expectedPreWelcome).length, 1);

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
  const tripContextEmail = await queueOrSendCollaboratorInviteEmail(db, {
    invite: state.invites[0],
    contact: { email: 'alex@example.com', displayName: 'Alex' },
    publicUrl: state.siteUrl,
  }, process.env);
  assert.equal(tripContextEmail.status, 'already_sent');
  assert.equal(state.outboundEmails.length, 1);
  assert.equal(state.invites[0].trip_id, state.tripId);
  assert.equal(state.collaborators[0].trip_id, state.tripId);
}

async function runPostSiteFlow() {
  const state = buildState({ withTrip: true });
  const db = dbFor(state);
  useOnboardingLookup(db);
  useVacationAppDatabase(db);

  const acceptPage = await call('GET', `/accept/vacation-collaborator-${state.inviteId}`);
  assert.equal(acceptPage.statusCode, 200);

  await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-collaborator-${state.inviteId}`)}`, {
    acceptedByName: 'Alex',
    checkboxConfirmed: true,
  });

  const appGet = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  const appPayload = JSON.parse(appGet.body);
  const expectedPostWelcome = renderOnboardingWelcome({
    audience: 'collaborator',
    collabFirstName: 'Alex',
    ownerFirstName: 'Owner',
    tripTitle: 'Harbor Ridge Week',
    tripSiteUrl: state.siteUrl,
  });
  assert.equal(appPayload.turns.filter((turn) => turn.body === expectedPostWelcome).length, 1, appGet.body.slice(0, 400));
  assert.match(expectedPostWelcome, new RegExp(state.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const emailsBeforePostInvite = state.outboundEmails.length;
  const postInviteEmail = await openCollaboratorAppSeats(db, {
    ownerCustomerId: state.ownerCustomerId,
    tripId: state.tripId,
    onboardingSessionId: state.ownerSessionId,
    seats: [{ name: 'Bryn', email: 'bryn@example.com' }],
    env: process.env,
  });
  assert.equal(postInviteEmail.length, 1);
  assert.equal(state.outboundEmails.length, emailsBeforePostInvite + 1);
  const postInviteId = state.invites[state.invites.length - 1]?.id;
  const postAcceptUrl = collaboratorEulaAcceptUrl({ id: postInviteId }, process.env);
  assert.match(postAcceptUrl, /\/accept\/vacation-collaborator-/);
  const postEmail = collaboratorInviteEmail({
    contact: { firstName: 'Bryn', email: 'bryn@example.com' },
    invite: { id: postInviteId, trip_id: state.tripId, owner_display_name: 'Owner Ada', trip_title: 'Harbor Ridge Week' },
    acceptUrl: postAcceptUrl,
    publicUrl: state.siteUrl,
  });
  assert.match(postEmail.textBody, /\/accept\/vacation-collaborator-/);

  await call('POST', `/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-collaborator-${state.inviteId}`)}`, {
    acceptedByName: 'Alex',
    checkboxConfirmed: true,
  });
  const revisit = await call('GET', `/api/vacation-itinerary?app=1&session=${encodeURIComponent(state.collabToken)}`);
  const revisitPayload = JSON.parse(revisit.body);
  assert.equal(revisitPayload.eula.accepted, true);
  assert.equal(revisitPayload.turns.filter((turn) => turn.body === expectedPostWelcome).length, 1);
}

const badTurn = {
  speaker: 'customer',
  direction: 'inbound',
  authorId: 'unknown-person',
  authorName: '',
};
const missing = turnAuthorLabel(badTurn, { viewerId: 'viewer-1', customer_id: 'viewer-1' }, []);
assert.equal(missing.reason, 'author_name_missing');
assert.equal(transcriptAuthorMissingError(badTurn, { customer_id: 'viewer-1' }).event, 'transcript_author_missing');

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
  await runMissingAuthorFailure();
} finally {
  useOnboardingLookup(null);
  useVacationAppDatabase(null);
  await rm(storeDir, { recursive: true, force: true });
}

console.log('vacation collaborator accept e2e passed');
