import { searchTavily } from './poi-search.mjs';
import {
  detailFieldsFromPlace,
  mergeThingDetailMetadata,
  missingDetailFieldsForCategory,
  text,
} from './thing-detail-fields.mjs';

function snippetsFromTavily(results = []) {
  return results.map((row) => text(row.content, 1800)).filter(Boolean);
}

function heuristicFieldsFromSnippets(snippets = [], title = '') {
  const blob = snippets.join('\n');
  const fields = {};
  const phone = blob.match(/(?:\+1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}/);
  if (phone) fields.phone = phone[0];
  const google = blob.match(/Google[^0-9]*([0-5](?:\.\d)?)\s*(?:\/|\s*out of\s*5)?(?:\s*\(([\d,]+)\s*reviews?\))?/i);
  if (google) {
    fields.googleRating = google[1];
    if (google[2]) fields.googleReviewCount = google[2].replace(/,/g, '');
  }
  const yelp = blob.match(/Yelp[^0-9]*([0-5](?:\.\d)?)/i);
  if (yelp) fields.yelpRating = yelp[1];
  const hours = blob.match(/(?:hours|open)[^:\n]{0,20}[:\s-]+([^\n.]{8,120})/i);
  if (hours) fields.hours = text(hours[1], 240);
  const happyHour = blob.match(/happy hour[^.\n]{0,40}[:\s-]+([^\n.]{8,240})/i);
  if (happyHour) {
    fields.happyHour = true;
    fields.happyHourDetails = text(happyHour[0], 1200);
  }
  const quotes = [...blob.matchAll(/“([^”]{20,220})”|"([^"]{20,220})"/g)]
    .map((match) => text(match[1] || match[2], 1000))
    .filter(Boolean)
    .slice(0, 3);
  quotes.forEach((quote, index) => {
    fields[`review${index + 1}`] = quote;
    fields[`review${index + 1}Source`] = 'Web search';
  });
  const paragraphs = snippets.filter((row) => row.split(/\s+/).length >= 30);
  if (paragraphs.length) fields.longDetails = text(paragraphs[0], 3000);
  if (!fields.longDetails && blob.split(/\s+/).length >= 30) fields.longDetails = text(blob, 3000);
  if (fields.longDetails && title) {
    fields.itineraryNote = text(`${title} — ${fields.longDetails.split(/\s+/).slice(0, 12).join(' ')}`, 280);
  }
  return fields;
}

export async function enrichPlaceDetail({
  place = {},
  destination = '',
  category = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const title = text(place.title || place.name, 240);
  const cat = text(category || place.category, 80).toLowerCase() || 'activity';
  const base = detailFieldsFromPlace(place, { category: cat, title });
  base.title = title;
  base.category = cat;
  let sourceRecord = {
    ...(place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {}),
    ...base,
    source: place.source || place.sourceRecord?.source || 'search',
    url: text(place.url || base.website, 500),
  };
  const query = text(`${title} ${destination} ${place.address || ''} reviews rating hours phone happy hour`, 320);
  let extracted = {};
  try {
    const tavily = await searchTavily(query, { env, fetchImpl, maxResults: 5 });
    extracted = heuristicFieldsFromSnippets(snippetsFromTavily(tavily.results || []), title);
    sourceRecord = { ...sourceRecord, ...extracted };
  } catch (error) {
    console.error(`place detail enrichment skipped for "${title}": ${String(error?.message || error)}`);
  }
  const mergedPlace = { ...place, ...sourceRecord, category: cat, title };
  const detail = detailFieldsFromPlace(mergedPlace, { category: cat, title });
  detail.title = title;
  detail.category = cat;
  const missing = missingDetailFieldsForCategory(detail, cat);
  return {
    detail,
    sourceRecord,
    missingDetailFields: missing,
    detailEnriched: missing.length === 0,
  };
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
    description: text(detail.longDetails || thing.description, 4000) || thing.description,
    metadata,
  };
}
