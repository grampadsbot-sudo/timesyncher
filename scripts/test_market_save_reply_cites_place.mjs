#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { blockInTurnPlaceReply } from '../src/vacation/chat-place-search.mjs';
import { attachSearchArea } from '../src/vacation/place-search-reply-facts.mjs';
import { insertStampedChatPlaceThings } from '../src/vacation/chat-place-search-when.mjs';
import { produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { placesFromOsmPayload } from '../src/vacation/place-search-osm.mjs';
import { placeToTripThing } from '../src/vacation/place-search.mjs';
import { MARKET_OSM_PAYLOAD, MARKET_SEARCH_ANCHOR } from './fixtures/place-search-osm-market.mjs';

const center = { lat: 20.764, lng: -156.446 };
const places = placesFromOsmPayload(MARKET_OSM_PAYLOAD, center, {
  finite: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
  metersInsideCategory: () => 100,
  ratingFromRecord: () => ({}),
});
assert.equal(places.length, 1);
assert.equal(places[0].category, 'market');
const title = places[0].title;
assert.equal(title.includes(MARKET_SEARCH_ANCHOR), false);

const thing = placeToTripThing(places[0]);
assert.equal(thing.category, 'market');

const tripId = crypto.randomUUID();
const savedEnv = {
  TIMESYNCHER_SITE_BASE_URL: process.env.TIMESYNCHER_SITE_BASE_URL,
  TIMESYNCHER_TRAVEL_BASE_URL: process.env.TIMESYNCHER_TRAVEL_BASE_URL,
};
process.env.TIMESYNCHER_SITE_BASE_URL = 'https://vacation.example';
process.env.TIMESYNCHER_TRAVEL_BASE_URL = 'https://travel.example';

const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (/from trip_things/i.test(text) && /source in/i.test(text)) return [];
  if (/insert into trip_things/i.test(text)) return [{ id: crypto.randomUUID() }];
  if (/count\(\*\)/i.test(text) && /trip_things/i.test(text)) return [{ n: 1 }];
  if (/select\s+start_date,\s*end_date/i.test(text)) {
    return [{ start_date: '2027-03-10', end_date: '2027-03-17' }];
  }
  if (/update trips/i.test(text)) {
    const patch = values.find((value) => value?.publicSlug)
      || values.map((value) => {
        if (typeof value !== 'string' || !value.startsWith('{')) return null;
        try { return JSON.parse(value); } catch { return null; }
      }).find((value) => value?.publicSlug);
    return [{ public_slug: patch?.publicSlug || `intake-${tripId.replace(/-/g, '').slice(0, 12)}` }];
  }
  if (/select metadata->>'publicSlug'/i.test(text)) return [{ public_slug: '' }];
  if (/select metadata/i.test(text) && /from trips/i.test(text)) return [{ metadata: {} }];
  return [];
};

const classification = {
  ok: true,
  turnKind: 'place_search',
  category: 'market',
  target: 'farmers market',
  anchor: MARKET_SEARCH_ANCHOR,
  things: [],
};
const saved = await insertStampedChatPlaceThings(db, {
  tripId,
  requestId: crypto.randomUUID(),
  things: [thing],
  classification,
});
assert.equal(saved.placeResults[0].name, title);
assert.equal(saved.placeResults[0].name, thing.title);

const citing = `${title} is the market for this stop, near ${MARKET_SEARCH_ANCHOR}.`;
const areaDropped = blockInTurnPlaceReply(citing, true, saved.placeResults, {
  tripContext: { destination: 'Maui', tripReplyGate: [{ name: 'Maui' }] },
});
assert.equal(areaDropped?.status, 'unsourced_place');
assert.deepEqual(areaDropped?.invented, [MARKET_SEARCH_ANCHOR]);
assert.match(areaDropped?.reason || '', /not from in-turn provider results/);

const placeSearchReplyFacts = attachSearchArea(saved.placeSearchReplyFacts, classification);
assert.equal(placeSearchReplyFacts.searchArea, MARKET_SEARCH_ANCHOR);
const HOLDING_MODEL = 'deepseek/deepseek-v4-flash';
const env = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://jev.example/api/alpha/decisions',
};
function json(payload, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  if (href.includes('/api/alpha/decisions')) {
    if (body.questions?.model_tier) {
      return json({ answers: { model_tier: { score: 2 }, route_type: { choice: 'general' } } });
    }
    return json({
      answers: {
        overall_quality: { score: 5 },
        disposition: { choice: 'ship' },
        fix_focus: { choice: 'keep' },
      },
    });
  }
  if (href.includes('/chat/completions')) {
    const model = body.model;
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    if (system.includes('Do not write a customer reply')) {
      return json({ model, choices: [{ message: { content: '{"asksPrice":false,"asksAccess":false,"pullsAccess":false,"seats":[],"ask":false}' } }] });
    }
    if (model === HOLDING_MODEL && /"template"/.test(system) && /canShip/.test(system)) {
      return json({ model, choices: [{ message: { content: '{"template":false,"canShip":true}' } }] });
    }
    return json({ model, choices: [{ message: { content: citing } }] });
  }
  return json({ error: 'unexpected url' }, 404);
};

let produced;
try {
  produced = await produceLiveAppReply({
    customerTurn: 'farmers market near Kihei',
    session: { token: 'sess', display_name: 'Ada', trip_id: tripId },
    priorTurns: [
      { role: 'customer', text: 'hi' },
      { role: 'customer', text: 'Maui March 10-17 2027 with my wife' },
    ],
    tripTitle: 'Maui',
    placeResults: saved.placeResults,
    placeSearchTurn: true,
    placeSearchReplyFacts,
    savedStart: '2027-03-10',
    savedEnd: '2027-03-17',
    env,
  });
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

assert.equal(produced.status, undefined);
assert.equal(produced.reply, citing);
assert.match(produced.reply, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.equal(blockInTurnPlaceReply(produced.reply, true, saved.placeResults, {
  tripContext: { tripReplyGate: [{ name: 'Maui' }, { name: MARKET_SEARCH_ANCHOR }] },
  tripPlaceAllowRows: [{ name: 'Maui' }, { name: MARKET_SEARCH_ANCHOR }],
}), null);
console.log('test_market_save_reply_cites_place: ok');
console.log(JSON.stringify({
  verdictBeforeArea: { status: areaDropped.status, reason: areaDropped.reason, invented: areaDropped.invented },
  reply: produced.reply,
}));
