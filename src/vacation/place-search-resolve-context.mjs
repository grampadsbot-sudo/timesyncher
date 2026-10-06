import { nominatimLabelsEquivalent } from './nominatim-label-equivalent.mjs';
import { persistTripDestinationCenter } from './trip-destination-center.mjs';
import { compactLocalityText, tryGeocodeLabel } from './place-search-geocode.mjs';

function pointFrom(value) {
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: String(value.label || value.address || '') };
}

export async function resolveSearchContext(
  fetchImpl,
  { lodging, lodgingPoint, destination, keepAreaText = false, tripDestinationCenter = null },
  providerLog,
  readJson,
  fail,
  options = {},
) {
  const given = pointFrom(lodgingPoint);
  const storedCenter = pointFrom(tripDestinationCenter);
  const lodgingLabel = String(lodging || '').trim();
  const destinationLabel = String(destination || '').trim();
  if (given) {
    providerLog.push({ provider: 'nominatim', status: 'skipped', reason: 'lodging_coordinates', resultCount: 0 });
    const lodgingIdentity = lodgingLabel || String(given.label || '').trim();
    return {
      center: { ...given, geocoded: 'lodging', geocodeIdentity: lodgingIdentity },
      locationText: lodgingLabel || destinationLabel || given.label || '',
      compactLocality: compactLocalityText(null, lodgingLabel || destinationLabel || given.label || ''),
    };
  }
  if (lodgingLabel) {
    const found = await tryGeocodeLabel(fetchImpl, lodgingLabel, providerLog, readJson, options);
    if (found) {
      return {
        center: { ...found, geocoded: 'lodging', geocodeIdentity: lodgingLabel },
        locationText: lodgingLabel,
        compactLocality: found.compactLocality || compactLocalityText(null, lodgingLabel),
      };
    }
    console.error(`Nominatim returned no coordinates for lodging "${lodgingLabel}".`);
  }
  const stated = String(options.statedLodgingArea || '').trim();
  if (stated && stated !== lodgingLabel) {
    const found = await tryGeocodeLabel(fetchImpl, stated, providerLog, readJson, options);
    if (found) {
      return {
        center: { ...found, geocoded: 'lodging', geocodeIdentity: stated },
        locationText: stated,
        compactLocality: found.compactLocality || compactLocalityText(null, stated),
      };
    }
    console.error(`Nominatim returned no coordinates for stated lodging area "${stated}".`);
  }
  if (!destinationLabel && !lodgingLabel) {
    fail('Place search needs a destination.', 'missing_destination');
  }
  const tripDestinationLabel = String(options.tripDestinationLabel || destinationLabel).trim();
  const turnNamedAnchor = String(options.turnNamedAnchor || '').trim();
  const namedAnchorOverridesStoredCenter = turnNamedAnchor
    && !nominatimLabelsEquivalent(turnNamedAnchor, tripDestinationLabel);
  if (
    destinationLabel
    && storedCenter
    && !lodgingLabel
    && !namedAnchorOverridesStoredCenter
    && nominatimLabelsEquivalent(destinationLabel, tripDestinationLabel)
  ) {
    providerLog.push({
      provider: 'nominatim',
      status: 'skipped',
      reason: 'trip_destination_center',
      resultCount: 0,
    });
    const locationText = keepAreaText ? destinationLabel : (storedCenter.label || destinationLabel);
    return {
      center: {
        ...storedCenter,
        geocoded: 'stored',
        geocodeIdentity: tripDestinationLabel,
      },
      locationText,
      compactLocality: compactLocalityText(null, destinationLabel),
    };
  }
  if (destinationLabel) {
    const found = await tryGeocodeLabel(fetchImpl, destinationLabel, providerLog, readJson, options);
    if (found) {
      const tripId = String(options.tripId || '').trim();
      const db = options.db;
      if (db && tripId && nominatimLabelsEquivalent(destinationLabel, tripDestinationLabel)) {
        await persistTripDestinationCenter(db, tripId, found);
      }
      const locationText = keepAreaText ? destinationLabel : (found.label || destinationLabel);
      return {
        center: { ...found, geocoded: 'destination', geocodeIdentity: destinationLabel },
        locationText,
        compactLocality: found.compactLocality || compactLocalityText(null, destinationLabel),
      };
    }
  }
  const locationText = lodgingLabel || destinationLabel;
  if (!locationText) fail('Place search needs a destination.', 'missing_destination');
  return {
    center: null,
    locationText,
    compactLocality: compactLocalityText(null, locationText),
  };
}
