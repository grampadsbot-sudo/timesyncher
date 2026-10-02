function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointFrom(value) {
  const lat = finite(value?.lat ?? value?.latitude);
  const lng = finite(value?.lng ?? value?.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng, label: String(value.label || value.address || '') };
}

export function providerFailureMessage(providerLog = []) {
  return providerLog
    .map((row) => `${row.provider}: ${row.reason || row.status}`)
    .join('; ');
}

export function resolvedAreaText(hit, fallback = '') {
  const address = hit?.address && typeof hit.address === 'object' ? hit.address : null;
  if (address) {
    const place = ['city', 'town', 'village', 'hamlet', 'municipality']
      .map((key) => String(address[key] || '').trim())
      .find(Boolean) || '';
    const county = String(address.county || '').trim();
    const state = String(address.state || address.region || '').trim();
    const country = String(address.country_code || '').trim().toUpperCase();
    const parts = [place, county, state, country].filter((part, index, all) => part && all.indexOf(part) === index);
    if (parts.length) return parts.join(', ');
  }
  const display = String(hit?.display_name || '').trim();
  return display || String(fallback || '').trim();
}

export async function nominatimForwardSearch(fetchImpl, query, readJson, { limit = 5 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(Math.max(limit, 1), 10)}&q=${encodeURIComponent(q)}`;
  const payload = await readJson(fetchImpl, url, { label: 'Nominatim forward' });
  return (Array.isArray(payload) ? payload : []).slice(0, limit);
}

export async function nominatimReverseGeocode(fetchImpl, lat, lng, readJson) {
  const pointLat = finite(lat);
  const pointLng = finite(lng);
  if (pointLat === null || pointLng === null) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pointLat}&lon=${pointLng}`;
  const payload = await readJson(fetchImpl, url, { label: 'Nominatim reverse' });
  if (!payload || typeof payload !== 'object') return null;
  const address = String(payload.display_name || '').trim();
  if (!address) return null;
  return {
    address,
    hit: payload,
    lat: finite(payload.lat) ?? pointLat,
    lng: finite(payload.lon ?? payload.lng) ?? pointLng,
  };
}

async function geocodeLabel(fetchImpl, label, readJson) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(label)}`;
  const payload = await readJson(fetchImpl, url, { label: 'Nominatim geocode' });
  const hit = Array.isArray(payload) ? payload[0] : null;
  const lat = finite(hit?.lat);
  const lng = finite(hit?.lon ?? hit?.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng, label: resolvedAreaText(hit, label) };
}

async function tryGeocodeLabel(fetchImpl, label, providerLog, readJson) {
  const trimmed = String(label || '').trim();
  if (!trimmed) {
    providerLog.push({ provider: 'nominatim', status: 'skipped', reason: 'no_label', resultCount: 0 });
    return null;
  }
  try {
    const found = await geocodeLabel(fetchImpl, trimmed, readJson);
    if (!found) {
      providerLog.push({
        provider: 'nominatim',
        status: 'empty',
        reason: `no coordinates for ${trimmed}`,
        resultCount: 0,
      });
      return null;
    }
    providerLog.push({ provider: 'nominatim', status: 'ok', resultCount: 1 });
    return found;
  } catch (error) {
    providerLog.push({
      provider: 'nominatim',
      status: 'error',
      reason: String(error?.message || error || 'geocode failed').trim(),
      resultCount: 0,
    });
    return null;
  }
}

export async function resolveSearchContext(fetchImpl, { lodging, lodgingPoint, destination, keepAreaText = false }, providerLog, readJson, fail) {
  const given = pointFrom(lodgingPoint);
  const lodgingLabel = String(lodging || '').trim();
  const destinationLabel = String(destination || '').trim();
  if (given) {
    providerLog.push({ provider: 'nominatim', status: 'skipped', reason: 'lodging_coordinates', resultCount: 0 });
    return {
      center: { ...given, geocoded: 'lodging' },
      locationText: lodgingLabel || destinationLabel || given.label || '',
    };
  }
  if (lodgingLabel) {
    const found = await tryGeocodeLabel(fetchImpl, lodgingLabel, providerLog, readJson);
    if (found) {
      return { center: { ...found, geocoded: 'lodging' }, locationText: lodgingLabel };
    }
    console.error(`Nominatim returned no coordinates for lodging "${lodgingLabel}".`);
  }
  if (!destinationLabel && !lodgingLabel) {
    fail('Place search needs a destination.', 'missing_destination');
  }
  if (destinationLabel) {
    const found = await tryGeocodeLabel(fetchImpl, destinationLabel, providerLog, readJson);
    if (found) {
      const locationText = keepAreaText ? destinationLabel : (found.label || destinationLabel);
      return { center: { ...found, geocoded: 'destination' }, locationText };
    }
  }
  const locationText = lodgingLabel || destinationLabel;
  if (!locationText) fail('Place search needs a destination.', 'missing_destination');
  return { center: null, locationText };
}
