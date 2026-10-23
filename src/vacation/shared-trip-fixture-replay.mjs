import { createHash } from 'node:crypto';
import {
  bindPr336GateBCanonicalIdentity,
  mergeStoredCcabNarrativeIntoOverride,
  shouldMergeStoredCcabOnFixtureReplay,
} from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';
import { applyThingPresentation } from './intake-shared-trip.mjs';
import { applyLiveAppListRowFields } from './shared-trip-live-app-fields.mjs';
import { syncSharedTripApiBudget } from './shared-trip-api-budget.mjs';
import { applyThingDetailOverrides } from './thing-detail-fields.mjs';

export const GATEB_FIXTURE_REPLAY_SLUG = 'gateb-fixture-replay';

function normName(name = '') {
  return String(name || '').replace(/\u2019/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

function travelCategory(place = {}) {
  const cat = String(place.category_name || place.category?.name || place.category || '').toLowerCase();
  if (cat === 'hotel' || cat === 'flight') return cat;
  if (cat === 'car' || cat.includes('car') || cat === 'rental car') return 'car';
  if (cat === 'transport') {
    const name = String(place.name || '').toLowerCase();
    if (/\bflight\b|→|airlines|jetblue|southwest|delta|united|american|las-|jfk|lga|ewr/.test(name)) {
      return 'flight';
    }
  }
  return '';
}

function rowPrice(place = {}, override = {}) {
  for (const raw of [override.price, place.price]) {
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
    if (/\d/.test(String(raw))) return 1;
  }
  return 0;
}

function pruneDuplicateTravelPlaces(shared = {}) {
  const places = Array.isArray(shared.places) ? [...shared.places] : [];
  const thingOverrides = { ...(shared.thingOverrides || {}) };
  const winners = new Map();
  for (const place of places) {
    const cat = travelCategory(place);
    if (!cat) continue;
    const key = normName(place.name);
    const override = thingOverrides[`place:${place.id}`] || {};
    const score = rowPrice(place, override);
    const id = Number(place.id) || 0;
    const prev = winners.get(key);
    if (!prev || score > prev.score || (score === prev.score && id > prev.id)) {
      winners.set(key, { score, id, place });
    }
  }
  const keep = new Set(places.filter((p) => !travelCategory(p)).map((p) => p.id));
  for (const { place } of winners.values()) keep.add(place.id);
  const drop = new Set(places.filter((p) => !keep.has(p.id)).map((p) => p.id));
  if (!drop.size) return shared;
  for (const id of drop) {
    delete thingOverrides[`place:${id}`];
  }
  return {
    ...shared,
    places: places.filter((p) => !drop.has(p.id)).map((p) => ({
      ...p,
      name: String(p.name || '').replace(/\u2019/g, "'"),
    })),
    thingOverrides,
  };
}

function normalizeTimelineSelections(trip = {}) {
  if (!Array.isArray(trip.places)) throw new TypeError('places must be an array');
  const overrides = { ...(trip.thingOverrides || {}) };
  const selected = [];
  for (const place of trip.places) {
    const key = `place:${place.id}`;
    const prior = { ...(overrides[key] || {}) };
    if (prior.timeline != null && typeof prior.timeline !== 'boolean') {
      throw new TypeError(`non-boolean Timeline selection: ${key}`);
    }
    prior.timeline = prior.timeline === true;
    if (prior.timeline) selected.push(key);
    overrides[key] = prior;
  }
  return {
    trip: { ...trip, thingOverrides: overrides },
    selectedPlaceKeys: selected.sort(),
  };
}

function enrichFixtureReplayServedTrip(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? { ...shared.thingOverrides }
    : {};
  for (const place of places) {
    const key = `place:${place.id}`;
    const override = { ...(thingOverrides[key] || {}) };
    const withIdentity = bindPr336GateBCanonicalIdentity(place.id, place, override);
    thingOverrides[key] = shouldMergeStoredCcabOnFixtureReplay(place, withIdentity)
      ? mergeStoredCcabNarrativeIntoOverride(place, withIdentity)
      : withIdentity;
  }
  const bound = { ...shared, places, thingOverrides };
  const deduped = pruneDuplicateTravelPlaces(bound);
  let served = applyThingPresentation(deduped);
  served = applyThingDetailOverrides(served);
  served = applyProductKeepsakeOverrides(served);
  served = applyLiveAppListRowFields(served);
  return syncSharedTripApiBudget(served);
}

export function prepareFixtureReplaySharedTrip(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const parsed = JSON.parse(source.toString('utf8'));
  const { trip, selectedPlaceKeys } = normalizeTimelineSelections(parsed);
  const served = enrichFixtureReplayServedTrip(trip);
  const payload = Buffer.from(JSON.stringify(served));
  return {
    served,
    payload,
    timelineReplay: {
      policy: 'timeline-explicit-v1',
      source_fixture_sha256: createHash('sha256').update(source).digest('hex'),
      served_payload_sha256: createHash('sha256').update(payload).digest('hex'),
      selected_place_keys: selectedPlaceKeys,
    },
  };
}

