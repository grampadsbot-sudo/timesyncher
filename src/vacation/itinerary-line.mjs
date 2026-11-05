function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lineFromField(field) {
  if (field == null || field === '') return '';
  if (typeof field === 'string') return clean(field);
  const fromValue = clean(field.value);
  if (fromValue) return fromValue;
  const claims = Array.isArray(field.claims) ? field.claims : [];
  for (const claim of claims) {
    const row = clean(claim?.text);
    if (row) return row;
  }
  return '';
}

export function itineraryLineText(bag = {}, place = {}) {
  const stored = clean(bag.description ?? place.description);
  if (stored) return stored;
  return '';
}

export const ITINERARY_LINE_BUNDLE =
  'G=>{const bag=ha(G)||{};return String(bag.description??(G&&G.description)??"").replace(/\\s+/g," ").trim()}';
