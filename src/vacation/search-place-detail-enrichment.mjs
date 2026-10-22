import { enrichPlaceDetail } from './place-detail-enrichment.mjs';
import { descriptionPassesDetailJudge, text } from './thing-detail-fields.mjs';
import { estimateSearchPlacePrice } from './search-place-price-estimate.mjs';

const DETAIL_CATEGORIES = new Set(['hotel', 'lodging', 'flight', 'car']);

function wordCount(value = '') {
  return text(value, 4000).split(/\s+/).filter(Boolean).length;
}

function shortLineFromLong(value = '', max = 120) {
  const row = text(value, 4000);
  if (!row) return '';
  const clauses = row.match(/[^.!?;]+[.!?;]/gy);
  if (clauses) {
    let line = '';
    for (const clause of clauses) {
      const next = text(`${line} ${clause}`, 4000);
      if (line && next.length > max) break;
      line = next;
      if (wordCount(line) >= 6) break;
    }
    return text(line, max);
  }
  return text(row.split(/\s+/).slice(0, 12).join(' '), max);
}

export function searchPlaceNeedsWebDetailEnrichment(place = {}) {
  const category = text(place.category, 40).toLowerCase();
  if (!DETAIL_CATEGORIES.has(category)) return false;
  const title = text(place.title || place.name, 240);
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  const longDetails = text(
    record.longDetails || record.details || place.longDetails || place.description || record.description,
    4000,
  );
  if (descriptionPassesDetailJudge(longDetails, title)) return false;
  return true;
}

export function mergeWebDetailIntoSearchPlace(place = {}, enrichment = {}) {
  const detail = enrichment.detail || {};
  const sourceRecord = {
    ...(place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {}),
    ...(enrichment.sourceRecord || {}),
    ...detail,
  };
  const title = text(place.title || place.name, 240);
  const longDetails = text(detail.longDetails || detail.summary || place.description, 3000);
  let summary = text(detail.summary, 500);
  if (!descriptionPassesDetailJudge(summary, title) || wordCount(summary) >= 30) {
    summary = shortLineFromLong(longDetails, 120);
  }
  const category = text(place.category || detail.category, 40).toLowerCase();
  let price = place.price ?? sourceRecord.price ?? detail.price ?? null;
  if (price == null && place.price !== 0) {
    price = estimateSearchPlacePrice({
      category,
      title,
      description: longDetails,
      summary,
      sourceRecord,
    });
  }
  return {
    ...place,
    description: longDetails || place.description,
    summary,
    longDetails,
    sourceRecord: {
      ...sourceRecord,
      ...(longDetails ? { description: longDetails, longDetails } : {}),
      ...(summary ? { summary } : {}),
      ...(Array.isArray(detail.summarySourceUrls) ? { summarySourceUrls: detail.summarySourceUrls } : {}),
      ...(price != null ? { price } : {}),
      detailEnriched: enrichment.detailEnriched === true,
    },
    ...(price != null ? { price } : {}),
  };
}

async function enrichSearchPlaceWithWebDetail(place = {}, {
  destination = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!searchPlaceNeedsWebDetailEnrichment(place)) return place;
  const dest = text(destination, 180);
  if (!dest) return place;
  const enrichment = await enrichPlaceDetail({
    place: {
      ...place,
      title: place.title || place.name,
      address: place.address || place.sourceRecord?.address || '',
      url: place.url || place.sourceRecord?.url,
    },
    destination: dest,
    category: place.category,
    env,
    fetchImpl,
  });
  return mergeWebDetailIntoSearchPlace(place, enrichment);
}

export async function enrichSearchPlacesWithWebDetails(places = [], options = {}) {
  const destination = text(options.destination, 180);
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const out = [];
  for (const place of Array.isArray(places) ? places : []) {
    try {
      out.push(await enrichSearchPlaceWithWebDetail(place, { destination, env, fetchImpl }));
    } catch (error) {
      console.error(`search place web detail enrichment failed for "${text(place.title, 240)}": ${String(error?.message || error)}`);
      out.push(place);
    }
  }
  return out;
}
