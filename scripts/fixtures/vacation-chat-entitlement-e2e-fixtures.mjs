import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { couponHash } from '../../src/vacation/coupons.mjs';

export const TRIP_TITLE = 'Harbor Ridge Week';
export const DESTINATION = 'Neutral Bay';
export const TRIP_ID = '01234567-89ab-4cde-8f01-23456789abcd';
export const TRIP_ID_B = '01234567-89ab-4cde-8f02-23456789abcd';
export const BRAVE_HOST = ['api', 'search', 'brave', 'com'].join('.');
export const TAVILY_HOST = ['api', 'tavily', 'com'].join('.');
const OPENROUTER_HOST = ['openrouter', 'ai'].join('.');
const NOMINATIM_HOST = ['nominatim', 'openstreetmap', 'org'].join('.');
const OVERPASS_HOST = ['overpass-api', 'de'].join('.');

export function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

export function buildState(plan) {
  const customerId = crypto.randomUUID();
  const entitlementId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const couponCode = `TS-E2E-${plan}`;
  return {
    plan,
    customerId,
    entitlementId,
    orderId,
    sessionId,
    couponCode,
    tripCount: 0,
    trips: [],
    tripThings: [],
    entitlement: {
      id: entitlementId,
      customer_id: customerId,
      trip_id: null,
      plan,
      status: 'active',
      metadata: plan === 'unlimited'
        ? { product: 'timesyncher_vacation_unlimited' }
        : { product: 'timesyncher_vacation_single' },
      stripe_customer_id: null,
      stripe_subscription_id: null,
      stripe_payment_intent_id: null,
    },
    siblings: [],
    session: null,
    fetchCalls: [],
    tripOwnerPlanLoads: [],
    coupon: {
      id: crypto.randomUUID(),
      code_hash: couponHash(couponCode, {}),
      metadata: { plan },
      max_redemptions: 5,
      redemption_count: 0,
      status: 'active',
    },
    redemptionId: crypto.randomUUID(),
    eulaStore: {},
  };
}

export function dbFor(state) {
  return (strings, ...values) => {
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
    if (/from checkout_coupons/i.test(text) && /code_hash/i.test(text)) {
      return state.coupon.code_hash === values.find((v) => typeof v === 'string' && v.length === 64)
        ? [{ metadata: state.coupon.metadata }]
        : [];
    }
    if (/update checkout_coupons/i.test(text) && /redemption_count/i.test(text)) {
      state.coupon.redemption_count += 1;
      return [{ ...state.coupon, id: state.coupon.id }];
    }
    if (/insert into checkout_coupon_redemptions/i.test(text)) return [{ id: state.redemptionId, status: 'processing' }];
    if (/insert into customers/i.test(text)) return [{ id: state.customerId }];
    if (/insert into trips/i.test(text)) {
      state.tripCount += 1;
      const id = state.tripCount === 1 ? TRIP_ID : TRIP_ID_B;
      const row = {
        id,
        customer_id: state.customerId,
        title: TRIP_TITLE,
        destination: DESTINATION,
        start_date: '2026-10-07',
        end_date: '2026-10-09',
        status: 'onboarding',
        metadata: {},
      };
      state.trips.push(row);
      return [{ id }];
    }
    if (/delete from trips/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
      state.trips = state.trips.filter((trip) => trip.id !== tripId);
      state.tripCount = state.trips.length;
      return [];
    }
    if (/insert into entitlements/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
      if (tripId) {
        const row = {
          id: `ent-sibling-${state.siblings.length + 1}`,
          customer_id: state.customerId,
          trip_id: tripId,
          plan: state.entitlement.plan,
          status: 'active',
          metadata: state.entitlement.metadata,
        };
        state.siblings.push(row);
        return [{ id: row.id }];
      }
      return [{ id: state.entitlementId }];
    }
    if (/update entitlements/i.test(text) && /trip_id/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
      if (tripId) state.entitlement.trip_id = tripId;
      return [{ id: state.entitlement.id }];
    }
    if (/from entitlements e/i.test(text) && /paid_orders/i.test(text)) return [{ ...state.entitlement }];
    if (/from entitlements e/i.test(text) && /trip_id is null/i.test(text)) {
      return state.entitlement.trip_id ? [] : [{ ...state.entitlement }];
    }
    if (/from entitlements e/i.test(text) && /e\.customer_id =/i.test(text) && /e\.trip_id =/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
      const rows = [];
      if (state.entitlement.trip_id === tripId) rows.push({ id: state.entitlement.id });
      rows.push(...state.siblings.filter((row) => row.trip_id === tripId).map((row) => ({ id: row.id })));
      return rows;
    }
    if (/join entitlements e on e\.customer_id = t\.customer_id/i.test(text) && /e\.trip_id = t\.id/i.test(text)) {
      const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
      if (tripId) state.tripOwnerPlanLoads.push(tripId);
      const row = state.entitlement.trip_id === tripId
        ? state.entitlement
        : state.siblings.find((sibling) => sibling.trip_id === tripId);
      return row ? [{ plan: row.plan, status: row.status, metadata: row.metadata }] : [];
    }
    if (/insert into paid_orders/i.test(text)) return [{ id: state.orderId }];
    if (/from onboarding_sessions/i.test(text) && /where order_id/i.test(text) && !/customers/i.test(text)) return [];
    if (/insert into onboarding_sessions/i.test(text)) {
      const token = values.find((value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,}$/.test(value) && !value.includes('@'));
      state.session = {
        id: state.sessionId,
        token,
        customer_id: state.customerId,
        trip_id: null,
        order_id: state.orderId,
        status: 'purchase_confirmed',
        current_step: 'post_purchase',
        first_name: 'Buyer',
        last_name: 'Example',
        display_name: 'Buyer Example',
        email: 'buyer@example.com',
        metadata: {},
      };
      return [{ ...state.session }];
    }
    if (/update onboarding_sessions/i.test(text)) {
      if (/trip_id/i.test(text)) {
        const tripId = values.find((v) => v === TRIP_ID || v === TRIP_ID_B);
        if (tripId && state.session) state.session.trip_id = tripId;
      }
      return [];
    }
    if (/from onboarding_sessions/i.test(text) && /token/i.test(text)) {
      const token = values.find((v) => typeof v === 'string' && v.length > 8);
      return state.session?.token === token
        ? [{
          ...state.session,
          email: 'buyer@example.com',
          first_name: 'Buyer',
          last_name: 'Example',
          display_name: 'Buyer Example',
          plan: state.plan,
          amount_cents: 0,
          currency: 'usd',
        }]
        : [];
    }
    if (/from trips/i.test(text) && /customer_id/i.test(text)) {
      return state.trips.map((trip) => ({
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
        status: trip.status,
        metadata: trip.metadata,
        current: trip.id === state.session?.trip_id,
      }));
    }
    if (/insert into vacation_requests/i.test(text)) {
      return [{ id: 'req-e2e', received_at: new Date(), queued_at: new Date() }];
    }
    if (/insert into transcript_turns/i.test(text) && /where not exists/i.test(text)) return [];
    if (/insert into transcript_turns/i.test(text) && /returning id/i.test(text)) {
      return [{ id: `turn-${crypto.randomUUID()}` }];
    }
    if (/insert into transcript_turns/i.test(text)) return [];
    if (/update transcript_turns/i.test(text)) return [];
    if (/insert into worker_jobs/i.test(text)) return [{ id: 'job-e2e' }];
    if (/insert into trip_things/i.test(text)) {
      const source = values.find((v) => v === 'brave' || v === 'tavily') || 'brave';
      state.tripThings.push({ source });
      return [{ id: `trip-thing-${state.tripThings.length}` }];
    }
    if (/insert into vacation_request_events/i.test(text)) return [];
    if (/update worker_jobs/i.test(text)) return [];
    if (/update trips/i.test(text)) return [];
    if (/from transcript_turns/i.test(text) && /count\(\*\)/i.test(text)) return [{ n: 0, started_at: new Date() }];
    if (/from transcript_turns/i.test(text) && /order by/i.test(text)) return [];
    if (/from trip_things/i.test(text)) return [];
    if (/from vacation_collaborators/i.test(text)) return [];
    if (/insert into outbound_emails/i.test(text)) return [{ id: 'email-1' }];
    if (/update outbound_emails/i.test(text)) return [{ id: 'email-1' }];
    if (/update checkout_coupon_redemptions/i.test(text)) return [{ id: state.redemptionId, status: 'redeemed' }];
    if (/count\(\*\)::int as n from trip_things/i.test(text)) return [{ n: state.tripThings.length }];
    if (/^\s*select\b/i.test(text)) return [];
    throw new Error(`unexpected sql: ${text.slice(0, 220)}`);
  };
}

const CLASSIFIER_TRIP_INTAKE = ['trip', 'intake'].join('_');

function classifierExtractionBody({ title, destination, hasDates, intake, user = '' }) {
  const lower = String(user).toLowerCase();
  if (/weather|events/.test(lower)) {
    return {
      turnKind: 'web_research',
      target: '',
      anchor: '',
      anchorIsLodging: false,
      question: user,
      things: [],
      roster: [],
      destination: '',
      hasDates: false,
      title: '',
    };
  }
  if (/taco|pike place/i.test(lower)) {
    return {
      turnKind: 'place_search',
      target: 'taco spots',
      category: 'restaurant',
      anchor: 'Pike Place',
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
    turnKind: intake ? CLASSIFIER_TRIP_INTAKE : 'other',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    question: '',
    things: [],
    roster: [],
    destination,
    hasDates,
    startDate: hasDates ? '2026-10-07' : '',
    endDate: hasDates ? '2026-10-09' : '',
    title,
  };
}

export function intakeFetchMock({ title, destination, hasDates, intake = true }) {
  return async (url, init) => {
    const href = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (href.includes('/decisions')) {
      const questions = body?.questions || body?.input?.questions || {};
      if (questions.trip_intake) {
        return { ok: true, json: async () => ({ answers: { trip_intake: { noul: intake ? 0.92 : 0.1 } } }) };
      }
      if (questions.relevance) {
        return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    const corpus = JSON.stringify(body?.messages || []);
    if (corpus.includes('Starter facts')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Where are you headed, and what dates work for you?' } }] }) };
    }
    if (/Intake facts/i.test(corpus)) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Who is traveling with you? Do you already have lodging booked for the week?' } }],
        }),
      };
    }
    if (/tags from the allowed list/i.test(corpus)) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tags: ['activities_experiences'], ask: false }) } }] }) };
    }
    if (corpus.includes('score')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
    }
    const user = body?.messages?.find((row) => row.role === 'user')?.content || '';
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify(classifierExtractionBody({
              title,
              destination,
              hasDates,
              intake,
              user,
            })),
          },
        }],
      }),
    };
  };
}

export function providerFetchMock(state, env, originalFetch, intakeOptions = {
  title: TRIP_TITLE,
  destination: DESTINATION,
  hasDates: true,
  intake: true,
}) {
  const intakeMock = intakeFetchMock(intakeOptions);
  return async (url, init) => {
    const href = String(url);
    state.fetchCalls.push(href);
    if (href === 'https://api.resend.com/emails') {
      return { ok: true, json: async () => ({ id: 'resend-test' }) };
    }
    if (href.includes(NOMINATIM_HOST)) {
      return { ok: true, json: async () => [{ lat: '47.6097', lon: '-122.3331', display_name: DESTINATION }] };
    }
    if (href.includes(OVERPASS_HOST)) {
      return { ok: true, json: async () => ({ elements: [] }) };
    }
    if (!href.includes(OPENROUTER_HOST) && !href.includes(BRAVE_HOST) && !href.includes(TAVILY_HOST)) {
      return originalFetch(url, init);
    }
    if (href.includes(BRAVE_HOST) && href.includes('local')) {
      assert.equal(init.headers['X-Subscription-Token'], env.BRAVE_SEARCH_API_KEY);
      return {
        ok: true,
        json: async () => ({
          results: [{ id: 'brave-e2e-1', title: 'Neutral taco counter', latitude: 47.61, longitude: -122.34, url: 'https://example.com/taco' }],
        }),
      };
    }
    if (href.includes(TAVILY_HOST)) {
      return {
        ok: true,
        json: async () => ({
          results: [{ title: 'Weather notes', url: 'https://example.com/weather', content: 'Often cool in October.' }],
        }),
      };
    }
    if (href.includes(OPENROUTER_HOST) && href.includes('decisions')) {
      const raw = init?.body ? JSON.parse(String(init.body)) : {};
      const questions = raw?.questions || raw?.input?.questions || {};
      if (questions.trip_intake) {
        return {
          ok: true,
          json: async () => ({
            answers: { trip_intake: { noul: intakeOptions.intake === false ? 0.1 : 0.92 } },
          }),
        };
      }
      if (questions.relevance) {
        return { ok: true, json: async () => ({ answers: { relevance: { choice: 5 } } }) };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    if (href.includes(OPENROUTER_HOST)) {
      const raw = init?.body ? JSON.parse(String(init.body)) : {};
      const user = raw.messages?.find((row) => row.role === 'user')?.content || '';
      if (String(raw.messages?.[0]?.content || '').includes('turnKind')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                content: JSON.stringify(classifierExtractionBody({
                  title: intakeOptions.title ?? '',
                  destination: intakeOptions.destination ?? '',
                  hasDates: intakeOptions.hasDates === true,
                  intake: intakeOptions.intake !== false,
                  user,
                })),
              },
            }],
          }),
        };
      }
      if (String(user).includes('score')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 0.95 }) } }] }) };
      }
      if (/tags from the allowed list/i.test(String(raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ tags: ['activities_experiences'], ask: false }) } }] }) };
      }
      if (/Starter facts/i.test(String(raw.messages?.[1]?.content || raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Here are a few nearby options to consider.' } }] }) };
      }
      if (/Intake facts/i.test(String(raw.messages?.[1]?.content || raw.messages?.[0]?.content || ''))) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Who is traveling with you? Do you already have lodging booked for the week?' } }] }) };
      }
    }
    return intakeMock(url, init);
  };
}
