import { prepareSharedTripForLiveApp } from './shared-trip-live-tab-lists.mjs';
import { repairExplicitLogoUrl } from './thing-logo-fallback-url.mjs';

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
  return prepareSharedTripForLiveApp(repairServedLogoUrls(shared));
}
