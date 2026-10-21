import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  bindPr336GateBCanonicalIdentity,
  enrichListRowFromStoredCcab,
  mergeStoredCcabNarrativeIntoOverride,
  resolveStoredCcabKey,
  shouldMergeStoredCcabOnFixtureReplay,
} from '../../scripts/fixtures/pr336-vk-search-trip-sources.mjs';
import { applyLiveAppListRowFields } from './shared-trip-live-app-fields.mjs';

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

function bindStoredCcabLogo(place = {}, override = {}) {
  const hit = resolveStoredCcabKey(place, override);
  if (!hit) return override;
  const enriched = enrichListRowFromStoredCcab(
    place,
    override,
    override.category || place.category_name,
  );
  if (!enriched?.logoUrl) return override;
  const next = { ...override, logoUrl: enriched.logoUrl };
  place.logoUrl = enriched.logoUrl;
  if (!text(place.website) && enriched.sourceRecord?.website) {
    place.website = enriched.sourceRecord.website;
  }
  return next;
}

function text(value) {
  return String(value || '').trim();
}

function enrichFixtureReplayServedTrip(shared = {}) {
  const places = Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [];
  const thingOverrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? { ...shared.thingOverrides }
    : {};
  for (const place of places) {
    const key = `place:${place.id}`;
    let override = { ...(thingOverrides[key] || {}) };
    override = bindPr336GateBCanonicalIdentity(place.id, place, override);
    override = shouldMergeStoredCcabOnFixtureReplay(place, override)
      ? mergeStoredCcabNarrativeIntoOverride(place, override)
      : override;
    override = bindStoredCcabLogo(place, override);
    thingOverrides[key] = override;
  }
  return applyLiveAppListRowFields({ ...shared, places, thingOverrides });
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
