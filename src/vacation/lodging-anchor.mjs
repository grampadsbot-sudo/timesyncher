function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lodgingAreaText(thing, location) {
  const locality = String(location.locality || location.city || '').trim();
  const address = String(location.address || '').trim();
  const described = String(thing.description || '').trim();
  const title = String(thing.title || '').trim();
  return locality || address || described || title;
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
