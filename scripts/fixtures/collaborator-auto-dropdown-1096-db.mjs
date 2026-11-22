import crypto from 'node:crypto';

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

export function createRelationalMemoryDb() {
  const state = {
    customers: [],
    trips: [],
    sessions: [],
    invites: [],
    collaborators: [],
    outboundEmails: [],
    grants: [],
    transcript: [],
    welcomes: new Set(),
  };

  const seatSessionsForCustomer = (customerId) => state.sessions.filter((s) => s.customer_id === customerId);

  const activeCollabForCustomerTrip = (customerId, tripId) => {
    const custSessions = seatSessionsForCustomer(customerId);
    const matching = state.collaborators.filter((vc) => {
      if (vc.owner_customer_id === customerId) return false;
      const matchedSession = custSessions.find((s) => (
        (vc.metadata?.onboardingToken && vc.metadata.onboardingToken === s.token)
        || (vc.invite_id && s.metadata?.seat?.inviteId === vc.invite_id)
      ));
      if (!matchedSession) return false;
      const targetTripId = vc.trip_id || matchedSession.metadata?.seat?.ownerTripId || null;
      return targetTripId === tripId;
    });
    matching.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1));
    return matching[0] || null;
  };

  const db = async (strings, ...values) => {
    const text = sqlText(strings);
    if (/create table if not exists|alter table|create unique index/i.test(text)) return [];

    if (/from trips where trips\.customer_id =/i.test(text)) {
      const sessionTripId = values[0];
      const customerId = values[1];
      return state.trips
        .filter((t) => {
          if (t.customer_id === customerId) return true;
          const vc = activeCollabForCustomerTrip(customerId, t.id);
          return Boolean(vc && vc.status === 'active');
        })
        .map((t) => ({
          ...t,
          current: t.id === sessionTripId,
          role: t.customer_id === customerId ? 'owner' : 'collaborator',
        }));
    }

    if (/select id, email from customers where lower\(email\) =/i.test(text)
      || /select id from customers where lower\(email\) =/i.test(text)) {
      const email = String(values[0] || '').toLowerCase();
      return state.customers.filter((c) => String(c.email || '').toLowerCase() === email);
    }
    if (/from customers where id =/i.test(text)) {
      return state.customers.filter((c) => c.id === values[0]);
    }
    if (/insert into customers/i.test(text)) {
      const email = String(values[0] || '').toLowerCase();
      const existing = state.customers.find((c) => String(c.email || '').toLowerCase() === email);
      if (existing) return [{ id: existing.id }];
      const row = {
        id: crypto.randomUUID(),
        email,
        phone: values[1] || null,
        first_name: values[2] || null,
        last_name: values[3] || null,
        display_name: values[4] || null,
        metadata: values[5] || {},
      };
      state.customers.push(row);
      return [{ id: row.id }];
    }

    if (/from onboarding_sessions\s+left join customers/i.test(text) && /where onboarding_sessions\.token =/i.test(text)) {
      const s = state.sessions.find((row) => row.token === values[0]);
      if (!s) return [];
      const c = state.customers.find((row) => row.id === s.customer_id) || {};
      return [{ ...s, display_name: c.display_name || null, first_name: c.first_name || null, last_name: c.last_name || null, email: c.email || null }];
    }
    if (/select token, customer_id, metadata from onboarding_sessions where token =/i.test(text)) {
      return state.sessions.filter((s) => s.token === values[0]);
    }
    if (/select id, metadata from onboarding_sessions where customer_id =/i.test(text)) {
      return state.sessions.filter((s) => s.customer_id === values[0]);
    }
    if (/insert into onboarding_sessions/i.test(text)) {
      const row = {
        id: crypto.randomUUID(),
        customer_id: values[0],
        trip_id: values[1],
        token: values[2],
        status: 'purchase_confirmed',
        current_step: 'post_purchase',
        order_id: null,
        metadata: values[4] || {},
      };
      state.sessions.push(row);
      return [row];
    }

    if (/insert into vacation_collaborator_invites/i.test(text)) {
      const row = {
        id: crypto.randomUUID(),
        owner_customer_id: values[0],
        trip_id: values[1],
        plan_code: values[2],
        scope: values[3],
        requested_for: values[4],
        status: values[5],
        deep_link_token_hash: values[6],
        metadata: values[7] || {},
      };
      state.invites.push(row);
      return [row];
    }
    if (/from vacation_collaborator_invites i/i.test(text) && /where i\.id =/i.test(text)) {
      const inv = state.invites.find((row) => row.id === values[0]);
      if (!inv) return [];
      const owner = state.customers.find((c) => c.id === inv.owner_customer_id) || {};
      const trip = state.trips.find((t) => t.id === inv.trip_id) || {};
      return [{ ...inv, owner_email: owner.email || null, owner_display_name: owner.display_name || null, trip_title: trip.title || null }];
    }
    if (/select id from vacation_collaborator_invites where metadata->>'collaboratorCustomerId' =/i.test(text)) {
      return state.invites.filter((i) => i.metadata?.collaboratorCustomerId === values[0]).map((i) => ({ id: i.id }));
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'accepted'/i.test(text)) {
      const inv = state.invites.find((row) => row.id === values[values.length - 1]);
      if (inv) {
        inv.status = 'accepted';
        const patch = values.find((v) => v && typeof v === 'object');
        if (patch) inv.metadata = { ...(inv.metadata || {}), ...patch };
      }
      return inv ? [inv] : [];
    }
    if (/update vacation_collaborator_invites/i.test(text) && /set status = 'paid'/i.test(text)) {
      const inv = state.invites.find((row) => row.id === values[values.length - 1]);
      if (inv) inv.status = 'paid';
      return inv ? [inv] : [];
    }

    if (/insert into vacation_collaborators/i.test(text)) {
      const row = {
        id: crypto.randomUUID(),
        invite_id: values[0],
        owner_customer_id: values[1],
        trip_id: values[2],
        display_name: values[3],
        plan_code: values[4],
        scope: values[5],
        status: 'active',
        metadata: values[6] || {},
      };
      state.collaborators.push(row);
      return [row];
    }
    if (/from vacation_collaborators vc join onboarding_sessions seat_os/i.test(text)) {
      const customerId = values[0];
      const tripId = values[2];
      const vc = activeCollabForCustomerTrip(customerId, tripId);
      if (!vc) return [];
      const seatSession = seatSessionsForCustomer(customerId).find((s) => (
        (vc.metadata?.onboardingToken && vc.metadata.onboardingToken === s.token)
        || (vc.invite_id && s.metadata?.seat?.inviteId === vc.invite_id)
      ));
      return [{
        collaborator_id: vc.id,
        invite_id: vc.invite_id,
        owner_customer_id: vc.owner_customer_id,
        trip_id: vc.trip_id,
        display_name: vc.display_name,
        status: vc.status,
        collaborator_metadata: vc.metadata,
        seat_token: seatSession?.token || null,
        seat_session_metadata: seatSession?.metadata || {},
      }];
    }
    if (/from vacation_collaborators c left join vacation_collaborator_invites i/i.test(text)) {
      const ownerId = values[0];
      const tripId = values[1];
      return state.collaborators
        .filter((vc) => vc.owner_customer_id === ownerId && vc.trip_id === tripId && vc.status === 'active')
        .map((vc) => {
          const inv = state.invites.find((i) => i.id === vc.invite_id) || {};
          return { display_name: vc.display_name, metadata: vc.metadata, invite_metadata: inv.metadata || {} };
        });
    }
    if (/select status from vacation_collaborators where invite_id =/i.test(text)) {
      const matches = state.collaborators.filter((vc) => vc.invite_id === values[0] && (vc.trip_id === values[1] || vc.trip_id == null));
      matches.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1));
      return matches.slice(0, 1).map((vc) => ({ status: vc.status }));
    }
    if (/from vacation_collaborators where invite_id =/i.test(text)) {
      const matches = state.collaborators.filter((vc) => vc.invite_id === values[0] && vc.owner_customer_id === values[1] && (vc.trip_id === values[2] || vc.trip_id == null));
      matches.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1));
      return matches.slice(0, 1);
    }

    if (/from trips join customers on customers\.id = trips\.customer_id where trips\.id =/i.test(text)) {
      const trip = state.trips.find((t) => t.id === values[0] && t.customer_id === values[1]);
      if (!trip) return [];
      const owner = state.customers.find((c) => c.id === trip.customer_id) || {};
      return [{ ...trip, owner_email: owner.email || null, owner_display_name: owner.display_name || null }];
    }
    if (/select customer_id from trips where id =/i.test(text)) {
      return state.trips.filter((t) => t.id === values[0]).map((t) => ({ customer_id: t.customer_id }));
    }
    if (/from trips where id =/i.test(text)) {
      return state.trips.filter((t) => t.id === values[0]);
    }

    if (/from outbound_emails/i.test(text)) {
      return state.outboundEmails.filter((e) => e.metadata?.collaboratorInviteId === values[0]);
    }
    if (/insert into outbound_emails/i.test(text)) {
      const row = { id: crypto.randomUUID(), to_email: values[1], subject: values[2], metadata: values[8] || {} };
      state.outboundEmails.push(row);
      return [{ id: row.id }];
    }

    if (/insert into vacation_web_access_grants/i.test(text)) {
      const existing = state.grants.find((g) => g.trip_id === values[1] && g.email === values[2] && g.role === values[4] && g.status === 'accepted');
      if (existing) {
        existing.session_token_hash = values[5];
        existing.metadata = { ...(existing.metadata || {}), ...(values[6] || {}) };
        return [existing];
      }
      const row = {
        id: crypto.randomUUID(),
        owner_customer_id: values[0],
        trip_id: values[1],
        email: values[2],
        display_name: values[3],
        role: values[4],
        status: 'accepted',
        session_token_hash: values[5],
        metadata: values[6] || {},
      };
      state.grants.push(row);
      return [row];
    }
    if (/from vacation_web_access_grants g join trips/i.test(text)) {
      const hash = values[0];
      const roles = values[1];
      const share = values[2];
      return state.grants.filter((g) => {
        if (g.session_token_hash !== hash || g.status !== 'accepted' || !roles.includes(g.role)) return false;
        const trip = state.trips.find((t) => t.id === g.trip_id);
        return g.metadata?.publicSlug === share || trip?.metadata?.publicSlug === share || trip?.metadata?.shareToken === share;
      });
    }
    if (/from vacation_web_access_grants where session_token_hash =/i.test(text)) {
      const hash = values[0];
      const tripId = values[1];
      const roles = values[2];
      return state.grants.filter((g) => g.session_token_hash === hash && g.trip_id === tripId && g.status === 'accepted' && roles.includes(g.role));
    }
    if (/update vacation_web_access_grants/i.test(text)) return [];

    if (/from vacation_onboarding_welcomes/i.test(text)) {
      return state.welcomes.has(`${values[0]}:${values[1]}`) ? [{ id: 'claim' }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      const key = `${values[0]}:${values[1]}`;
      if (state.welcomes.has(key)) return [];
      state.welcomes.add(key);
      return [{ id: 'claim' }];
    }
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      const customerId = values[0];
      const found = state.transcript.filter((r) => r.customer_id === customerId && r.speaker === 'app' && r.payload?.welcomeAudience);
      return /select speaker/i.test(text) ? found : found.map((r) => ({ id: r.id }));
    }
    if (/from transcript_turns/i.test(text)) {
      const tripId = values[0];
      return state.transcript.filter((r) => r.trip_id === tripId).slice().reverse();
    }
    if (/insert into transcript_turns/i.test(text)) {
      const isWelcome = /response_latency_ms/i.test(text);
      const row = isWelcome
        ? { id: crypto.randomUUID(), customer_id: values[0], trip_id: values[1], speaker: 'app', channel: 'vacation-app', body: values[2], payload: values[3], direction: 'outbound' }
        : { id: crypto.randomUUID(), customer_id: values[0], trip_id: values[1], speaker: values[2], channel: values[3], body: values[4], payload: values[5], direction: values[6] };
      state.transcript.push(row);
      return [{ id: row.id }];
    }
    if (/from trip_things/i.test(text)) return /count\(\*\)/i.test(text) ? [{ n: 0 }] : [];
    return [];
  };
  db.transaction = async (fn) => fn(db);
  return { db, state };
}
