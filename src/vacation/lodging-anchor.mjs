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
