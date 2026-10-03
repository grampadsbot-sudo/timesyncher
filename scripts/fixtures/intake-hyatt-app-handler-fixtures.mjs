import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BRAVE_DUMMY,
  BRAVE_HOST,
  NOMINATIM_HOST,
  OPENROUTER_DUMMY,
  OPENROUTER_HOST,
  OVERPASS_HOST,
  TAVILY_DUMMY,
  TAVILY_HOST,
} from './place-intent-brave-fallback-fixtures.mjs';

export {
  BRAVE_DUMMY,
  BRAVE_HOST,
  NOMINATIM_HOST,
  OPENROUTER_DUMMY,
  OPENROUTER_HOST,
  OVERPASS_HOST,
  TAVILY_DUMMY,
  TAVILY_HOST,
};

const HYATT_BRAVE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/intake-lodging-brave/hyatt-live-h.json', import.meta.url)), 'utf8'),
);

export const MAUI_INTAKE = 'Maui March 10-17 2027 with my wife';
export const HYATT_INTAKE = "We're staying at the Hyatt Regency Maui in Kaanapali.";
export const MAUI_TITLE = 'March Maui week';

export function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

export function createHyattHandlerDb(state) {
  return async function db(strings, ...values) {
    const text = sqlText(strings);
    if (/create table if not exists eula_store_objects/i.test(text)) return [];
    if (/insert into eula_store_objects/i.test(text)) {
      const key = values.find((v) => typeof v === 'string' && v.includes('timesyncher-eula'));
      const doc = values.find((v) => v && typeof v === 'object' && !Array.isArray(v));
      if (key) state.eulaStore[key] = doc;
      return [];
    }
    if (/select document from eula_store_objects/i.test(text)) {
      return state.eulaStore[values[0]] ? [{ document: state.eulaStore[values[0]] }] : [];
    }
    if (/from entitlements e/i.test(text) && /e\.customer_id = t\.customer_id/i.test(text)) {
      return [{
        plan: state.entitlement.plan,
        status: state.entitlement.status,
        metadata: state.entitlement.metadata,
        trip_id: state.entitlement.trip_id,
      }];
    }
    if (/join entitlements e on e\.customer_id = t\.customer_id/i.test(text) && /e\.trip_id = t\.id/i.test(text)) {
      return state.entitlement.trip_id === state.trip.id
        ? [{ plan: state.entitlement.plan, status: state.entitlement.status, metadata: state.entitlement.metadata, trip_id: state.entitlement.trip_id }]
        : [];
    }
    if (/from entitlements e/i.test(text) && /paid_orders/i.test(text)) {
      return [{ ...state.entitlement, trip_id: state.entitlement.trip_id || null }];
    }
    if (/update entitlements/i.test(text) && /set trip_id/i.test(text)) {
      state.entitlement.trip_id = values.find((v) => v === state.tripId) || state.tripId;
      return [{ id: state.entitlement.id || 'ent-hyatt-test' }];
    }
    if (/insert into entitlements/i.test(text)) return [{ id: 'ent-hyatt-test' }];
    if (/insert into paid_orders/i.test(text)) return [{ id: state.session.order_id }];
    if (/insert into trips/i.test(text)) {
      if (!state.trip) {
        state.trip = {
          id: state.tripId,
          customer_id: state.customerId,
          title: '',
          destination: '',
          start_date: null,
          end_date: null,
          status: 'onboarding',
          metadata: { placeholderTrip: true },
        };
      }
      return [{ id: state.trip.id }];
    }
    if (/update trips/i.test(text)) {
      const metaPatch = values.find((v) => v && typeof v === 'object' && !Array.isArray(v) && ('dialogParty' in v || 'titleSource' in v || 'titleError' in v || 'publicSlug' in v || 'publicUrl' in v));
      if (metaPatch) state.trip.metadata = { ...state.trip.metadata, ...metaPatch };
      const titleVal = values.find((v) => typeof v === 'string' && v.length > 0 && v !== state.trip.id && !/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== 'yes' && v !== 'planning' && v !== 'onboarding');
      if (text.includes('set title = case') || (text.includes('set title =') && !text.includes('case'))) {
        const explicitTitle = values.find((v) => v === MAUI_TITLE || (typeof v === 'string' && /Maui|March/i.test(v)));
        if (explicitTitle) state.trip.title = explicitTitle;
      }
      if (text.includes('destination =')) {
        const dest = values.find((v) => typeof v === 'string' && /Maui|Kaanapali/i.test(v));
        if (dest) state.trip.destination = dest;
      }
      if (text.includes('publicSlug') || text.includes('publicUrl')) {
        state.trip.metadata = {
          ...state.trip.metadata,
          publicSlug: state.trip.metadata.publicSlug || `intake-${state.tripId.replace(/-/g, '').slice(0, 12)}`,
          intakeShare: true,
          publicUrl: state.trip.metadata.publicUrl || `https://vacation-staging.timesyncher.com/shared/intake-test/`,
          shareToken: state.trip.metadata.shareToken || `intake-${state.tripId.replace(/-/g, '').slice(0, 12)}`,
        };
      }
      return text.includes('returning') ? [{ public_slug: state.trip.metadata.publicSlug || 'intake-test' }] : [];
    }
    if (/select metadata->>'publicSlug'/i.test(text)) {
      return [{ public_slug: state.trip?.metadata?.publicSlug || '' }];
    }
    if (/select title, destination, metadata from trips/i.test(text)) {
      return state.trip ? [{ title: state.trip.title, destination: state.trip.destination, metadata: state.trip.metadata }] : [];
    }
    if (/select destination, metadata from trips/i.test(text)) {
      return state.trip ? [{ destination: state.trip.destination, metadata: state.trip.metadata }] : [];
    }
    if (/update onboarding_sessions/i.test(text) && /trip_id/i.test(text)) {
      state.session.trip_id = state.tripId;
      return [];
    }
    if (/from onboarding_sessions/i.test(text) && /token/i.test(text)) {
      return state.session ? [{
        ...state.session,
        email: 'buyer@example.com',
        first_name: 'Shepherd',
        last_name: 'Smoke',
        display_name: 'Shepherd Smoke',
      }] : [];
    }
    if (/from trips/i.test(text) && /customer_id/i.test(text)) {
      return state.trip ? [{
        id: state.trip.id,
        title: state.trip.title,
        destination: state.trip.destination,
        start_date: state.trip.start_date || '2027-03-10',
        end_date: state.trip.end_date || '2027-03-17',
        status: state.trip.status,
        metadata: state.trip.metadata,
        current: state.session.trip_id === state.trip.id,
      }] : [];
    }
    if (/insert into vacation_onboarding_welcomes/i.test(text)) {
      const key = `${values[0]}|${values[1]}`;
      if (state.welcomeClaims.has(key)) return [];
      state.welcomeClaims.add(key);
      state.welcomeClaimTripId = values[2] ?? null;
      return [{ id: 'welcome-claim-hyatt-test' }];
    }
    if (/from vacation_onboarding_welcomes/i.test(text) && /onboarding_session_id/i.test(text)) {
      const key = `${values[0]}|${values[1]}`;
      return state.welcomeClaims.has(key) ? [{ id: 'welcome-claim-hyatt-test', trip_id: state.welcomeClaimTripId }] : [];
    }
    if (/update vacation_onboarding_welcomes/i.test(text) && /set trip_id/i.test(text)) {
      state.welcomeClaimTripId = values[0];
      return [];
    }
    if (/insert into transcript_turns/i.test(text)) {
      const payload = values.find((v) => v && typeof v === 'object' && !Array.isArray(v));
      const tripVal = values.find((v) => v === state.tripId || v === null);
      const speaker = values.find((v) => v === 'app' || v === 'customer') || 'customer';
      const row = {
        id: `turn-${state.transcriptTurns.length + 1}`,
        trip_id: tripVal ?? null,
        payload: payload || {},
        speaker,
      };
      state.transcriptTurns.push(row);
      if (payload?.welcomeAudience) state.welcomeTurns.push(row);
      if (/returning id/i.test(text)) return [{ id: row.id }];
      return [];
    }
    if (/update transcript_turns/i.test(text) && /set trip_id/i.test(text)) {
      const tripVal = values[0];
      for (const row of state.welcomeTurns) {
        if (row.trip_id == null) row.trip_id = tripVal;
        if (row.payload) row.payload.selectedTripId = tripVal;
      }
      return [];
    }
    if (/update transcript_turns/i.test(text)) return [];
    if (/from transcript_turns/i.test(text) && /welcomeAudience/i.test(text)) {
      const audience = values.find((v) => v === 'owner' || v === 'collaborator' || v === 'owner_no_site');
      const boundTripId = values.find((v) => typeof v === 'string' && v === state.tripId);
      const rows = state.welcomeTurns.filter((row) => {
        const payloadAudience = row.payload?.welcomeAudience || '';
        const audienceOk = audience === 'owner'
          ? (payloadAudience === 'owner' || payloadAudience === 'owner_no_site')
          : payloadAudience === audience;
        if (!audienceOk) return false;
        if (boundTripId) return row.trip_id === boundTripId || row.trip_id == null;
        return row.trip_id == null;
      });
      return rows.length ? [{ id: rows[0].id }] : [];
    }
    if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) {
      const scopedTrip = values.find((v) => v === state.tripId || v === null);
      const n = state.transcriptTurns.filter((row) => row.speaker === 'customer' && (scopedTrip == null ? row.trip_id == null : row.trip_id === scopedTrip)).length;
      return [{ n: Math.max(n, 1), started_at: new Date(Date.now() - 60000) }];
    }
    if (/from transcript_turns/i.test(text) && /order by/i.test(text)) {
      if (/payload->'liveTranscript' is not null/i.test(text)) {
        return [{
          speaker: 'customer',
          body: MAUI_INTAKE,
          payload: { liveTranscript: { turnIndex: 4, intake: true, role: 'customer' } },
        }];
      }
      return [];
    }
    if (/insert into vacation_requests/i.test(text)) return [{ id: `req-${state.requests.length + 1}`, received_at: new Date(), queued_at: new Date() }];
    if (/insert into worker_jobs/i.test(text)) return [{ id: `job-${state.requests.length}` }];
    if (/insert into vacation_request_events/i.test(text)) return [];
    if (/update worker_jobs/i.test(text)) return [];
    if (/insert into trip_things/i.test(text)) {
      const title = values.find((v) => typeof v === 'string' && /Hyatt|hotel/i.test(v))
        || values.find((v) => typeof v === 'string' && v.length > 8 && v !== tripId && v !== 'hotel' && v !== 'activity');
      state.tripThings.push({
        id: `thing-${state.tripThings.length + 1}`,
        category: values.find((v) => v === 'hotel' || v === 'activity') || 'hotel',
        title: title || 'untitled',
        metadata: {},
        location: {},
      });
      return [{ id: state.tripThings[state.tripThings.length - 1].id }];
    }
    if (/select count\(\*\)::int as n from trip_things/i.test(text)) return [{ n: state.tripThings.length }];
    if (/from trip_things/i.test(text)) {
      return state.tripThings.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        description: '',
        metadata: row.metadata,
        location: row.location,
      }));
    }
    if (/select 1/i.test(text) && /transcript_turns/i.test(text)) return [{ ok: 1 }];
    if (/update vacation_collaborator_invites/i.test(text)) return [];
    if (/from vacation_collaborator_invites/i.test(text)) return [];
    if (/from customers/i.test(text)) return [{ first_name: 'Shepherd', display_name: 'Shepherd Smoke' }];
    if (/^\s*select\b/i.test(text)) return [];
    state.lastUnexpectedSql = text.slice(0, 240);
    throw new Error(`unexpected sql: ${text.slice(0, 240)}`);
  };
}

export function classifierPayloadForText(text, state) {
  const lower = String(text || '').toLowerCase();
  if (/hyatt|kaanapali/.test(lower) && /staying|stay/.test(lower)) {
    return {
      turnKind: 'trip_intake',
      target: '',
      anchor: '',
      anchorIsLodging: false,
      question: '',
      things: [{ name: 'Hyatt Regency Maui', kind: 'hotel', who: '', when: '' }],
      roster: [],
      destination: 'Kaanapali',
      hasDates: false,
      startDate: '',
      endDate: '',
      title: '',
    };
  }
  if (/maui/.test(lower) && /march/.test(lower)) {
    return {
      turnKind: 'trip_intake',
      target: '',
      anchor: '',
      anchorIsLodging: false,
      question: '',
      things: [],
      roster: [{ name: 'wife', role: 'Companion' }],
      destination: 'Maui',
      hasDates: true,
      startDate: '2027-03-10',
      endDate: '2027-03-17',
      title: MAUI_TITLE,
    };
  }
  if (/^hi\b/i.test(lower)) {
    return {
      turnKind: 'other',
      target: '',
      anchor: '',
      anchorIsLodging: false,
      question: '',
      things: [],
      roster: [],
      destination: '',
      hasDates: false,
      title: '',
    };
  }
  return {
    turnKind: 'other',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    question: '',
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
  };
}

export function createHyattHandlerFetch(state, envKeys) {
  return async function fetchImpl(url, options = {}) {
    const href = String(url);
    state.fetchCalls.push(href);
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ lat: '20.912971', lon: '-156.6921667', display_name: 'Hyatt Regency Maui, Kaanapali' }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      return { ok: true, json: async () => HYATT_BRAVE };
    }
    if (href.includes(TAVILY_HOST)) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const questions = raw?.questions || raw?.input?.questions || {};
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.92 } } }) };
      }
      if (questions.relevance) {
        return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
      }
      return { ok: true, json: async () => ({ ok: true, answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } } }) };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = options.body ? JSON.parse(String(options.body)) : {};
      const user = raw.messages?.find((row) => row.role === 'user')?.content || '';
      if (String(raw.messages?.[0]?.content || '').includes('turnKind')) {
        const payload = classifierPayloadForText(user, state);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
      }
      if (String(user).includes('score')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
      }
      if (/Starter facts/i.test(String(raw.messages?.[1]?.content || raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Got it — I saved Hyatt Regency Maui for your stay.' } }] }) };
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Got it — I saved Hyatt Regency Maui for your stay.' } }] }) };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
}
