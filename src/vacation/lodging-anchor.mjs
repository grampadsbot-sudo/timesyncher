import { customerStatedLodgingThing } from './intake-shared-trip.mjs';

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const LODGING_AREA_NAME_RE = /\b(Ka'?anapali|Kihei|Wailea|Lahaina|Kapalua|Paia|Kula|Hana)\b/i;

function isLodgingThing(thing = {}) {
  const category = String(thing.category || '').trim().toLowerCase();
  return category === 'hotel' || category === 'lodging' || category === 'accommodation';
}

function lodgingAreaText(thing, location) {
  const locality = String(location.locality || location.city || '').trim();
  const address = String(location.address || '').trim();
  const described = String(thing.description || '').trim();
  const title = String(thing.title || '').trim();
  return locality || address || described || title;
}

export function lodgingAreaNameFromText(text = '') {
  const value = String(text || '').trim();
  if (!value) return '';
  const match = value.match(LODGING_AREA_NAME_RE);
  return match ? match[1].slice(0, 180) : '';
}

function lodgingAreaNameFromThing(thing = {}) {
  if (!thing || typeof thing !== 'object') return '';
  const meta = thing.metadata && typeof thing.metadata === 'object' ? thing.metadata : {};
  const fromMeta = String(meta.statedLodgingArea || meta.statedLodgingAreaHint || '').trim();
  if (fromMeta) return fromMeta.slice(0, 180);
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const locality = String(location.locality || location.city || '').trim();
  if (locality) return locality.slice(0, 180);
  for (const text of [
    String(thing.title || thing.name || '').trim(),
    String(location.address || thing.address || '').trim(),
    String(thing.description || '').trim(),
  ]) {
    const fromText = lodgingAreaNameFromText(text);
    if (fromText) return fromText;
  }
  return '';
}

export function tripLodgingFieldsFromThings(things = []) {
  const hotels = (Array.isArray(things) ? things : []).filter(isLodgingThing);
  const ordered = [
    ...hotels.filter((row) => customerStatedLodgingThing(row)),
    ...hotels.filter((row) => !customerStatedLodgingThing(row)),
  ];
  let lodging = '';
  let statedLodgingArea = '';
  for (const thing of ordered) {
    if (!lodging) lodging = String(thing.title || thing.name || '').trim().slice(0, 240);
    if (!statedLodgingArea) statedLodgingArea = lodgingAreaNameFromThing(thing);
  }
  return { lodging, statedLodgingArea };
}

export async function loadTripLodgingThing(db, tripId) {
  if (!db || !tripId) return null;
  const rows = await db`
    select title, category, location, description
    from trip_things
    where trip_id = ${tripId}
      and category = 'hotel'
    order by created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export function lodgingAnchorFromThing(thing) {
  if (!thing || typeof thing !== 'object') return { text: '', point: null };
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const lat = finite(location.lat ?? location.latitude);
  const lng = finite(location.lng ?? location.longitude);
  const text = lodgingAreaText(thing, location);
  const point = lat !== null && lng !== null ? { lat, lng, label: text } : null;
  return { text, point };
}
