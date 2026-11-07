import { stripPipelineItineraryStub } from './thing-title-normalize.mjs';

function clean(value) {
  return String(value ?? '');
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
  const directRaw = clean(bag.itineraryNote ?? bag.itinerary_note);
  const direct = stripPipelineItineraryStub(directRaw);
  if (direct) return direct;
  const fields = bag.evidenceDossier?.fields;
  return stripPipelineItineraryStub(lineFromField(fields?.itineraryNote ?? fields?.itinerary_note));
}

export const ITINERARY_LINE_BUNDLE =
  '(G,notes)=>{const bag=ha(G)||{};const clean=v=>String(v??"");const strip=v=>{const s=clean(v);const t=s.trim();if(!t)return"";return/^Documented .+ option\\b/i.test(t)?"":s};const direct=strip(clean(bag.itineraryNote??bag.itinerary_note));if(direct)return direct;const fields=bag.evidenceDossier&&bag.evidenceDossier.fields||{};const field=fields.itineraryNote??fields.itinerary_note;if(field==null||field==="")return strip(clean(notes||bag.notes));if(typeof field==="string")return strip(clean(field));const fromValue=strip(clean(field.value));if(fromValue)return fromValue;const claims=Array.isArray(field.claims)?field.claims:[];for(const c of claims){const row=strip(clean(c&&c.text));if(row)return row}return strip(clean(notes||bag.notes))}';
