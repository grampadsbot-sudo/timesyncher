import { searchTavily } from './poi-search.mjs';
import { extractDetailFromSearchResults } from './place-detail-extract.mjs';
import { searchProductCategoryFromPlace } from './xai-grok-place-ratings-helpers.mjs';
import { logoUrlFromSearchPlace } from './trip-thing-enrichment.mjs';
import { isPlaceholderLogoUrl } from './thing-logo-capture.mjs';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicUrl(value = '') {
  try {
    const parsed = new URL(text(value, 1000));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function hostname(value = '') {
  try {
    return new URL(text(value, 500)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceRecordOn(place = {}) {
  return place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
}

function addMissingFields(record, keys = []) {
  const set = new Set(Array.isArray(record.missingFields) ? record.missingFields : []);
  for (const key of keys) set.add(key);
  record.missingFields = [...set];
}

function resolvedLogoOnPlace(place = {}) {
  const sourceRecord = sourceRecordOn(place);
  const direct = text(
    place.logoUrl
    || sourceRecord.logoUrl
    || sourceRecord.logo
    || sourceRecord.faviconUrl,
  );
  if (direct && !isPlaceholderLogoUrl(direct)) return direct;
  const derived = logoUrlFromSearchPlace(place, sourceRecord);
  if (derived && !isPlaceholderLogoUrl(derived)) return derived;
  return '';
}

export function placeNeedsEventLogoSearch(place = {}) {
  const category = searchProductCategoryFromPlace(place);
  if (category !== 'event') return false;
  return !resolvedLogoOnPlace(place);
}

export function eventLogoSearchQuery(title = '', destination = '') {
  const name = text(title, 200);
  const dest = text(destination, 160);
  const base = [name, dest].filter(Boolean).join(' ');
  return text(`${base} official website`, 320);
}

function pickOfficialWebsite(extracted = {}, place = {}) {
  const sourceRecord = sourceRecordOn(place);
  return text(
    extracted.website
    || extracted.url
    || place.url
    || sourceRecord.website
    || sourceRecord.url,
    500,
  );
}

function logoFromWebsite(website = '') {
  const site = text(website, 500);
  if (!site) return '';
  try {
    const parsed = new URL(site);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function eventLogoMatchesWebsite({ logoUrl = '', website = '' } = {}) {
  const ddg = text(logoUrl, 500).match(/^https:\/\/icons\.duckduckgo\.com\/ip3\/([^/]+)\.ico$/i);
  const logoHost = ddg ? ddg[1].replace(/^www\./i, '').toLowerCase() : hostname(logoUrl);
  const siteHost = hostname(website);
  if (!logoHost || !siteHost) return false;
  if (logoHost === siteHost) return true;
  if (logoHost.endsWith(`.${siteHost}`)) return true;
  if (siteHost.endsWith(`.${logoHost}`)) return true;
  return false;
}

function markEventLogoSearchBlocked(place = {}, reason = 'no_official_website_found') {
  const sourceRecord = { ...sourceRecordOn(place) };
  sourceRecord.logoSearchBlocked = text(reason, 160);
  addMissingFields(sourceRecord, ['logoUrl']);
  return {
    ...place,
    sourceRecord,
  };
}

export async function enrichSearchPlaceEventLogo(place = {}, {
  destination = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchTavily,
} = {}) {
  if (!placeNeedsEventLogoSearch(place)) return place;
  const title = text(place.title, 240);
  const query = eventLogoSearchQuery(title, destination);
  let mergedResults = [];
  try {
    const tavily = await searchImpl(query, { env, fetchImpl, maxResults: 6 });
    mergedResults = Array.isArray(tavily?.results) ? tavily.results : [];
  } catch (error) {
    console.error(`event logo search failed for "${title}": ${String(error?.message || error)}`);
    return markEventLogoSearchBlocked(place, 'logo_search_failed');
  }
  const sourceRecord = sourceRecordOn(place);
  const extracted = extractDetailFromSearchResults({
    results: mergedResults,
    title,
    category: 'event',
    website: pickOfficialWebsite({}, place),
  });
  const firstResultWebsite = text(
    mergedResults.map((row) => publicUrl(row?.url)).find(Boolean),
    500,
  );
  const website = pickOfficialWebsite(extracted, place) || firstResultWebsite;
  const logoUrl = logoUrlFromSearchPlace(
    {
      ...place,
      ...extracted,
      title,
      category: 'event',
      url: website || place.url,
    },
    { ...sourceRecord, ...extracted, url: website, website },
  ) || logoFromWebsite(website);
  if (!logoUrl || !eventLogoMatchesWebsite({ logoUrl, website })) {
    return markEventLogoSearchBlocked(place, website ? 'logo_not_attributed_to_website' : 'no_official_website_found');
  }
  const nextRecord = {
    ...sourceRecord,
    ...extracted,
    ...(website ? { website, url: website } : {}),
    logoUrl,
    logoSearchEvidence: {
      query,
      website,
      logoUrl,
      provider: 'tavily',
    },
  };
  delete nextRecord.logoSearchBlocked;
  const missing = new Set(Array.isArray(nextRecord.missingFields) ? nextRecord.missingFields : []);
  missing.delete('logoUrl');
  if (missing.size) nextRecord.missingFields = [...missing];
  else delete nextRecord.missingFields;
  return {
    ...place,
    ...(website ? { url: website } : {}),
    logoUrl,
    sourceRecord: nextRecord,
  };
}

export async function enrichSearchPlacesWithEventLogos(places = [], options = {}) {
  const list = Array.isArray(places) ? places : [];
  const enriched = [];
  for (const place of list) {
    enriched.push(await enrichSearchPlaceEventLogo(place, options));
  }
  return { places: enriched };
}

export function sharedUnrelatedEventLogoFailures(places = []) {
  const byLogo = new Map();
  for (const place of places) {
    if (searchProductCategoryFromPlace(place) !== 'event') continue;
    const sourceRecord = sourceRecordOn(place);
    const logoUrl = text(place.logoUrl || sourceRecord.logoUrl);
    if (!logoUrl || isPlaceholderLogoUrl(logoUrl)) continue;
    const website = text(
      sourceRecord.logoSearchEvidence?.website
      || place.url
      || sourceRecord.url
      || sourceRecord.website,
    );
    const title = text(place.title, 160) || '(untitled)';
    if (!byLogo.has(logoUrl)) byLogo.set(logoUrl, []);
    byLogo.get(logoUrl).push({ title, website });
  }
  const failures = [];
  for (const [logoUrl, rows] of byLogo) {
    if (rows.length < 2) continue;
    const hosts = new Set(rows.map((row) => hostname(row.website)).filter(Boolean));
    const titles = new Set(rows.map((row) => row.title));
    if (hosts.size > 1 && titles.size > 1) {
      failures.push({
        logoUrl,
        places: rows.map((row) => row.title),
        websites: [...hosts],
      });
    }
  }
  return failures;
}
