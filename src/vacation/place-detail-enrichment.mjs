import { fetchXaiPlaceRatings, enrichPlaceRecordWithXaiRatings } from './xai-grok-place-ratings.mjs';
import {
  mergeThingDetailMetadata,
  missingDetailFieldsForCategory,
  text,
} from './thing-detail-fields.mjs';

export async function enrichPlaceDetail({
  place = {}, destination = '', category = '', env = process.env,
  fetchImpl = globalThis.fetch, searchImpl,
} = {}) {
  const title = text(place.title || place.name, 240);
  const cat = text(category || place.category, 80).toLowerCase() || 'activity';
  const { parsed } = await fetchXaiPlaceRatings({ ...place, title, category: cat }, {
    destination, env, fetchImpl, searchImpl,
  });
  const sourceRecord = enrichPlaceRecordWithXaiRatings(place.sourceRecord || {}, parsed);
  const detail = { ...sourceRecord, title, category: cat };
  const missing = missingDetailFieldsForCategory(detail, cat);
  return { detail, sourceRecord, missingDetailFields: missing, detailEnriched: missing.length === 0 };
}

export function applyEnrichedDetailToTripThing(thing = {}, enrichment = {}) {
  const detail = enrichment.detail || {};
  const sourceRecord = {
    ...(enrichment.sourceRecord || {}),
    ...detail,
  };
  const metadata = mergeThingDetailMetadata(thing.metadata || {}, {
    ...detail,
    sourceRecord,
    missingDetailFields: enrichment.missingDetailFields || [],
    detailEnriched: enrichment.detailEnriched === true,
    needsDetails: (enrichment.missingDetailFields || []).length > 0,
  });
  return {
    ...thing,
    description: text(detail.longDetails || detail.summary || thing.description, 4000) || thing.description,
    metadata,
  };
}
