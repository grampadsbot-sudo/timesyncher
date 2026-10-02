function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function braveEndpoint(center) {
  return finite(center?.lat) !== null && finite(center?.lng) !== null ? 'local' : 'web';
}

export function braveQueryString(item, resolvedArea, center) {
  const target = String(item?.target || '').trim();
  const area = String(resolvedArea || '').trim();
  const named = String(item?.q || '').trim();
  const local = braveEndpoint(center) === 'local';
  let text = named || target || area;
  if (target && area) text = `${target} near ${area}`;
  else if (!local && named && area && !named.toLowerCase().includes(area.toLowerCase())) text = `${named} near ${area}`;
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function braveResultRows(payload) {
  const localRows = Array.isArray(payload?.results) ? payload.results : [];
  if (localRows.length) return localRows;
  return Array.isArray(payload?.web?.results) ? payload.web.results : [];
}

export function bravePoint(result) {
  const coords = result?.coordinates;
  if (Array.isArray(coords) && !Array.isArray(coords[0]) && coords.length >= 2) {
    return { lat: finite(coords[0]), lng: finite(coords[1]) };
  }
  if (Array.isArray(coords?.[0]) && coords[0].length >= 2) {
    return { lat: finite(coords[0][0]), lng: finite(coords[0][1]) };
  }
  return { lat: finite(result?.latitude), lng: finite(result?.longitude) };
}

export function braveAddress(result) {
  if (typeof result?.address === 'string' && result.address.trim()) return result.address.trim();
  const postal = result?.postal_address || {};
  return [postal.streetAddress, postal.addressLocality, postal.addressRegion, postal.postalCode].filter(Boolean).join(', ');
}

export function braveCategoryName(result) {
  const direct = result?.category;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object') {
    const name = String(direct.name || direct.label || '').trim();
    if (name) return name;
  }
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  return categories.map((item) => String(item?.name || item || '').trim()).find(Boolean) || '';
}

export function braveTitle(value) {
  const raw = String(value || '').trim();
  const cut = raw.split(/\s+[|]\s+/)[0].trim();
  return cut || raw;
}
