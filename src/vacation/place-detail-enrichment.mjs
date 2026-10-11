import { searchTavily } from './poi-search.mjs';
import { extractDetailFromSearchResults } from './place-detail-extract.mjs';
import {
  detailFieldsFromPlace,
  mergeThingDetailMetadata,
  missingDetailFieldsForCategory,
  text,
} from './thing-detail-fields.mjs';
import { logoUrlFromSearchPlace } from './trip-thing-enrichment.mjs';

function mergeRecords(...rows) {
  const out = {};
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value) && !value.length) continue;
      out[key] = value;
    }
  }
  return out;
}

function detailSearchQueries({ title, destination, category }) {
  const name = text(title, 200);
  const dest = text(destination, 160);
  const base = [name, dest].filter(Boolean).join(' ');
  const cat = text(category, 40).toLowerCase();
  const queries = [
    `${base} Google Yelp TripAdvisor reviews ratings`,
    `${base} official website hours phone address menu`,
    `${base} price cost reputation dishes highlights`,
  ];
  if (cat === 'restaurant' || cat === 'bar') {
    queries.push(`${base} happy hour days times deals`);
  }
  if (cat === 'flight') queries.push(`${base} airline flight number schedule layover duration fare`);
  if (cat === 'car') queries.push(`${base} rental car pickup return vehicle class price`);
  if (cat === 'hotel') queries.push(`${base} hotel check-in check-out nightly rate amenities`);
  return queries.map((row) => text(row, 320)).filter(Boolean);
}

export async function enrichPlaceDetail({
  place = {},
  destination = '',
  category = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchTavily,
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
  const mergedResults = [];
  const seenUrls = new Set();
  for (const query of detailSearchQueries({ title, destination, category: cat })) {
    try {
      const tavily = await searchImpl(query, { env, fetchImpl, maxResults: 6 });
      for (const row of tavily.results || []) {
        const url = text(row.url, 500);
        if (url && seenUrls.has(url)) continue;
        if (url) seenUrls.add(url);
        mergedResults.push(row);
      }
    } catch (error) {
      console.error(`place detail enrichment query failed for "${title}": ${String(error?.message || error)}`);
    }
  }
  const extracted = extractDetailFromSearchResults({
    results: mergedResults,
    title,
    category: cat,
    website: sourceRecord.url || sourceRecord.website,
  });
  const logoUrl = logoUrlFromSearchPlace(
    { ...place, ...extracted, title, category: cat, url: extracted.website || sourceRecord.url },
    { ...sourceRecord, ...extracted },
  );
  if (logoUrl) extracted.logoUrl = logoUrl;
  if (place.lat != null && place.lng != null) {
    extracted.lat = place.lat;
    extracted.lng = place.lng;
  }
  sourceRecord = mergeRecords(sourceRecord, extracted);
  const mergedPlace = { ...place, ...sourceRecord, category: cat, title };
  const detail = detailFieldsFromPlace(mergedPlace, { category: cat, title });
  detail.title = title;
  detail.category = cat;
  if (Array.isArray(sourceRecord.summarySourceUrls)) detail.summarySourceUrls = sourceRecord.summarySourceUrls;
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
    description: text(detail.longDetails || detail.summary || thing.description, 4000) || thing.description,
    metadata,
  };
}
