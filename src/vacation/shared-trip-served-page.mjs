import { prepareSharedTripForLiveApp } from './shared-trip-live-tab-lists.mjs';
import { repairExplicitLogoUrl, repairServedBoundaryLogoUrl } from './thing-logo-fallback-url.mjs';
import { stripFillInternalsFromServedSharedTrip } from './shared-trip-fill-internal-strip.mjs';

function text(value) {
  return String(value || '').trim();
}

function pageUrlForServedLogo(place = {}, override = {}) {
  return text(
    override.url
    || override.website
    || override.sourceUrl
    || place.url
    || place.website
    || place.sourceUrl
    || place.source_url,
  );
}

export function projectServedBoundaryLogosForHttp(shared = {}) {
  const next = structuredClone(shared);
  const overrides = next.thingOverrides && typeof next.thingOverrides === 'object'
    ? next.thingOverrides
    : {};
  const placeById = new Map((next.places || []).map((place) => [place.id, place]));
  for (const place of next.places || []) {
    if (!place?.logoUrl) continue;
    const override = overrides[`place:${place.id}`] || {};
    place.logoUrl = repairServedBoundaryLogoUrl(place.logoUrl, pageUrlForServedLogo(place, override));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!value?.logoUrl) continue;
    const id = Number(String(key).replace(/^place:/, ''));
    const place = placeById.get(id) || {};
    value.logoUrl = repairServedBoundaryLogoUrl(value.logoUrl, pageUrlForServedLogo(place, value));
  }
  return next;
}

function repairServedLogoUrls(shared = {}) {
  const places = Array.isArray(shared.places)
    ? shared.places.map((place) => (place && place.logoUrl ? { ...place, logoUrl: repairExplicitLogoUrl(place.logoUrl) } : place))
    : shared.places;
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? Object.fromEntries(Object.entries(shared.thingOverrides).map(([key, value]) => [
      key,
      value && value.logoUrl ? { ...value, logoUrl: repairExplicitLogoUrl(value.logoUrl) } : value,
    ]))
    : shared.thingOverrides;
  return { ...shared, places, thingOverrides: overrides };
}

export function finalizeServedSharedTripPayload(shared = {}, options = {}) {
  void options;
  const prepared = prepareSharedTripForLiveApp(repairServedLogoUrls(shared));
  return stripFillInternalsFromServedSharedTrip(prepared);
}
