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

export function itineraryLineText(bag = {}) {
  if (!bag || typeof bag !== 'object') return '';
  const direct = clean(bag.itineraryNote ?? bag.itinerary_note);
  if (direct) return direct;
  const fields = bag.evidenceDossier?.fields;
  return lineFromField(fields?.itineraryNote ?? fields?.itinerary_note);
}

export const ITINERARY_LINE_BUNDLE =
  'G=>{const bag=ha(G)||{};const clean=v=>String(v??"").replace(/\\s+/g," ").trim();const direct=clean(bag.itineraryNote??bag.itinerary_note);if(direct)return direct;const fields=bag.evidenceDossier&&bag.evidenceDossier.fields||{};const field=fields.itineraryNote??fields.itinerary_note;if(field==null||field==="")return"";if(typeof field==="string")return clean(field);const fromValue=clean(field.value);if(fromValue)return fromValue;const claims=Array.isArray(field.claims)?field.claims:[];for(const c of claims){const row=clean(c&&c.text);if(row)return row}return""}';
