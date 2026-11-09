export function createStoredCcabWebsiteResolver(
  enrichment,
  {
    text,
    enrichmentHit,
    ccabRecordMatchesPlaceCategory,
    narrativeWordCount,
    bestStoredCcabSubstanceDescription,
  },
) {
  function websiteHost(url = '') {
    const row = text(url, 500);
    if (!row) return '';
    try {
      const parsed = new URL(row.includes('://') ? row : `https://${row}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  const enrichmentByWebsiteHost = (() => {
    const map = new Map();
    for (const [key, record] of Object.entries(enrichment)) {
      const host = websiteHost(record?.website);
      if (!host || map.has(host) || text(record?.category, 40).toLowerCase() === 'flight') continue;
      map.set(host, key);
    }
    return map;
  })();

  function websiteUrlsForIdentity(place = {}, override = {}) {
    const capture = place.websiteCapture && typeof place.websiteCapture === 'object'
      ? place.websiteCapture
      : null;
    return [
      place.website,
      override.website,
      override.sourceRecord?.website,
      override.sourceRecord?.url,
      capture?.website,
      place.sourceRecord?.website,
      place.sourceRecord?.url,
    ];
  }

  function enrichmentHitByWebsite(place = {}, override = {}) {
    for (const url of websiteUrlsForIdentity(place, override)) {
      const host = websiteHost(url);
      if (!host) continue;
      const key = enrichmentByWebsiteHost.get(host);
      if (key) return enrichmentHit(key);
    }
    return null;
  }

  function bestEnrichmentHitByWebsite(place = {}, override = {}) {
    const seen = new Set();
    let best = null;
    let bestWords = 0;
    for (const url of websiteUrlsForIdentity(place, override)) {
      const host = websiteHost(url);
      if (!host) continue;
      const key = enrichmentByWebsiteHost.get(host);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const hit = enrichmentHit(key);
      if (!hit || !ccabRecordMatchesPlaceCategory(hit, place, override)) continue;
      const words = narrativeWordCount(bestStoredCcabSubstanceDescription(hit.ccabRecord));
      if (!best || words > bestWords) {
        best = hit;
        bestWords = words;
      }
    }
    return best;
  }

  return { enrichmentHitByWebsite, bestEnrichmentHitByWebsite, websiteUrlsForIdentity };
}
