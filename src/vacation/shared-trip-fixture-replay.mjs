import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  bindPr336GateBCanonicalIdentity,
  mergeStoredCcabNarrativeIntoOverride,
  shouldMergeStoredCcabOnFixtureReplay,
} from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import { finalizeServedSharedTripPayload } from './shared-trip-served-page.mjs';

export const GATEB_FIXTURE_REPLAY_SLUG = 'gateb-fixture-replay';

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
  return finalizeServedSharedTripPayload({ ...shared, places, thingOverrides });
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

export function loadFixtureReplaySharedTripFromPath(fixturePath = '') {
  const path = String(fixturePath || '').trim();
  if (!path) return null;
  return prepareFixtureReplaySharedTrip(readFileSync(path));
}
