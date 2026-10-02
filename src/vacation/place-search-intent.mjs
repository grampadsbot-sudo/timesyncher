const PLAN_INTAKE = /\b(plan a|planning a|we(?:'re| are) going for|who is going|our trip to|week in|days in)\b/i;
const WEB_RESEARCH = /\b(weather|forecast|temperature|rain|snow|humid|events?\b|this weekend|what'?s on|happening at|usually like|climate)\b/i;
const SPATIAL = /\b(?:near|around|within(?:\s+walking\s+distance\s+of)?|close to|by)\s+(.+?)(?:[,.!?]|$)/i;
const IN_ANCHOR = /\b(?:in|at)\s+([A-Za-z][\w .,'’-]{2,90}?)(?:[,.!?]|$)/;
const POSSESSIVE_LODGING = /\b(?:our|my)\s+(?:hotel|place|lodging|accommodation|stay)\b|\bwhere\s+we(?:'re| are)\s+staying\b/i;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function lodgingAnchorFromThing(thing) {
  if (!thing || typeof thing !== 'object') return { text: '', point: null };
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const lat = finite(location.lat ?? location.latitude);
  const lng = finite(location.lng ?? location.longitude);
  const title = String(thing.title || '').trim();
  const address = String(location.address || thing.description || '').trim();
  const text = [title, address].filter(Boolean).join(', ').trim();
  const point = lat !== null && lng !== null
    ? { lat, lng, label: text || title }
    : null;
  return { text, point };
}

export function resolvePlaceSearchAnchorText(anchor = '', lodgingText = '', tripDestination = '') {
  const raw = String(anchor || '').replace(/\s+/g, ' ').trim();
  if (!raw) return String(tripDestination || '').trim().slice(0, 180);
  if (!POSSESSIVE_LODGING.test(raw)) return raw.slice(0, 180);
  const inSuffix = raw.match(/\b(?:in|at)\s+(.+)$/i);
  const placeSuffix = String(inSuffix?.[1] || '').trim();
  if (lodgingText) return lodgingText.slice(0, 180);
  if (placeSuffix) return placeSuffix.slice(0, 180);
  return String(tripDestination || '').trim().slice(0, 180);
}

export function isCustomerPlaceSearchTurn(text = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source || source.length < 8) return false;
  if (PLAN_INTAKE.test(source)) return false;
  if (/\?/.test(source) && WEB_RESEARCH.test(source)) return false;

  const spatial = SPATIAL.exec(source);
  if (spatial?.[1]) {
    const anchor = String(spatial[1] || '').trim();
    if (anchor.length >= 2) {
      const target = source.slice(0, spatial.index).replace(/[,.!?]+$/, '').trim();
      if (target.length >= 2) return true;
      if (/\b(best|top|favorite|good|great)\b/i.test(source)) return true;
    }
  }

  const inAnchor = IN_ANCHOR.exec(source);
  if (inAnchor?.[1]) {
    const place = String(inAnchor[1] || '').trim();
    const before = source.slice(0, inAnchor.index).replace(/[,.!?]+$/, '').trim();
    if (place.length >= 3 && before.length >= 3) return true;
  }

  return false;
}

export { PLAN_INTAKE, WEB_RESEARCH };
