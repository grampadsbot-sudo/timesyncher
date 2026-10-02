import crypto from 'node:crypto';

export function sqlText(strings) {
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

export function createHttpCaller(handler) {
  return async function call(method, url, json) {
    const res = mockRes();
    await handler(request(method, url, json), res);
    return res;
  };
}

export function buildState({ withTrip = false } = {}) {
  const ownerCustomerId = crypto.randomUUID();
  const ownerSessionId = crypto.randomUUID();
  const ownerToken = 'owner-session-token';
  const tripId = withTrip ? crypto.randomUUID() : null;
  const inviteId = crypto.randomUUID();
  const collabCustomerId = crypto.randomUUID();
  const collabSessionId = crypto.randomUUID();
  const collabToken = 'collab-session-token';
  return {
    ownerCustomerId,
    ownerSessionId,
    ownerToken,
    tripId,
    inviteId,
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
  };
}

export function dbFor(state) {
  const db = async (strings, ...values) => {
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
      return state.invites.filter((row) => row.id === id);
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'paid'/i.test(text)) {
      state.invites[0].status = 'paid';
      return [state.invites[0]];
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'accepted'/i.test(text)) {
      state.invites[0].status = 'accepted';
      const metaPatch = values.find((v) => v && typeof v === 'object' && !Array.isArray(v) && ('collaboratorOnboardingToken' in v || 'paidVia' in v));
      state.invites[0].metadata = {
        ...state.invites[0].metadata,
        ...(metaPatch || {}),
        collaboratorOnboardingToken: state.collabToken,
        collaboratorCustomerId: state.collabCustomerId,
      };
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
        if (state.transcript.some((row) => row.speaker === 'app' && row.body === body && body)) return [{ id: 'welcome-dup' }];
      } else if (/collaborator_seat_join|speaker, channel, body, payload, direction, sent_at/i.test(text) && values[2] === 'system') {
        speaker = 'system';
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
      state.transcript.push({ customer_id: values[0], trip_id: values[1], speaker, body, channel, payload, direction });
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
  db.transaction = async (fn) => fn(db);
  return db;
}
