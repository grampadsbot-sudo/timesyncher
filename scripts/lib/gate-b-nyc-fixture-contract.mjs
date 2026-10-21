import { createHash } from 'node:crypto';

import { listRowSubstanceDescription } from '../../apps/vacation-client/src/lib/listTabModel.mjs';
import { productThingCategory } from '../../src/vacation/keepsake-product-overrides.mjs';

const MIN_SUMMARY_WORDS = 30;

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function haFields(shared = {}, place = {}) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  return { ...place, ...override };
}

export function renderedSummary(shared = {}, place = {}) {
  return listRowSubstanceDescription(place, shared);
}

export function renderedPrice(shared = {}, place = {}) {
  const row = haFields(shared, place);
  const raw = row.price ?? place.price;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const nums = [...String(raw).matchAll(/\$?([0-9][0-9,]*(?:\.\d+)?)/g)]
    .map((match) => Number(String(match[1]).replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  return nums[0];
}

function scheduleTime(shared = {}, place = {}) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || {};
  const slot = override.perDaySchedule && typeof override.perDaySchedule === 'object'
    ? Object.values(override.perDaySchedule)[0]
    : null;
  return text(slot?.startTime || place.place_time);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

export function gateBNycFixturePayloadSha256(shared = {}) {
  const body = stableValue({
    trip: {
      id: shared.trip?.id,
      title: shared.trip?.title,
      metadata: shared.trip?.metadata,
    },
    places: (shared.places || []).map((place) => ({
      id: place.id,
      name: place.name,
      place_time: place.place_time,
      lat: place.lat,
      lng: place.lng,
      category_id: place.category_id,
    })),
    thingOverrides: shared.thingOverrides,
    budget: shared.budget,
    days: shared.days,
    assignments: shared.assignments,
  });
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function assessGateBNycFixtureContract(shared = {}, options = {}) {
  const { profile = 'positive' } = options;
  const violations = [];
  const places = Array.isArray(shared.places) ? shared.places : [];
  if (places.length !== 22) {
    violations.push(`expected 22 places, got ${places.length}`);
  }

  for (const place of places) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    const summary = renderedSummary(shared, place);
    const price = renderedPrice(shared, place);
    const label = `${place.id}:${place.name}`;

    if (wordCount(summary) < MIN_SUMMARY_WORDS) {
      violations.push(`${label} summary under ${MIN_SUMMARY_WORDS} words (${wordCount(summary)})`);
    }
    if (price === null) {
      violations.push(`${label} missing price after finalization`);
    }

    if (override.timeline) {
      const row = haFields(shared, place);
      const lat = Number(row.lat ?? place.lat);
      const lng = Number(row.lng ?? place.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        violations.push(`${label} missing coordinates on selected timeline row`);
      }
      if (!scheduleTime(shared, place)) {
        violations.push(`${label} missing schedule time on selected timeline row`);
      }
    }

    if (category === 'car' || Number(place.id) === 609) {
      const row = haFields(shared, place);
      for (const key of ['rentalCompany', 'pickupLocation', 'returnLocation', 'startTime', 'endTime']) {
        if (!text(row[key])) violations.push(`${label} car row missing ${key}`);
      }
    }
  }

  const version = text(shared.trip?.metadata?.gateBNycFixtureVersion);
  if (profile === 'positive' && version !== 'gate-b-nyc-positive-v1') {
    violations.push(`positive profile requires gateBNycFixtureVersion gate-b-nyc-positive-v1 (got ${version || 'empty'})`);
  }
  if (profile === 'negative' && version) {
    violations.push(`negative profile must not set gateBNycFixtureVersion (got ${version})`);
  }

  return { pass: violations.length === 0, violations, payloadSha256: gateBNycFixturePayloadSha256(shared) };
}
