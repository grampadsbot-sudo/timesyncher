export const REPLY_PLACE_SEARCH_PROVIDER_LEAK = 'reply_place_search_provider_leak';

const PROVIDER_TOKEN = /\b(?:nominatim|openstreetmap|prior_db|osm|brave|tavily)\b/i;
const PLACE_SEARCH_FAILED = /Place search failed/i;

function normalizeAttempts(providerAttempts = []) {
  return (Array.isArray(providerAttempts) ? providerAttempts : []).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const provider = String(row.provider || '').trim();
    const status = String(row.status || '').trim();
    if (!provider || !status) return null;
    return {
      provider,
      status,
      reason: String(row.reason || '').trim(),
    };
  }).filter(Boolean);
}

export function replyPlaceSearchProviderLeakReason(reply) {
  const body = String(reply || '');
  if (!body.trim()) return '';
  if (PLACE_SEARCH_FAILED.test(body)) return REPLY_PLACE_SEARCH_PROVIDER_LEAK;
  if (PROVIDER_TOKEN.test(body)) return REPLY_PLACE_SEARCH_PROVIDER_LEAK;
  return '';
}

function providerAttemptHardFailure(row) {
  if (!row) return false;
  const status = String(row.status || '').trim().toLowerCase();
  const reason = String(row.reason || '').trim().toLowerCase();
  if (status === 'error' && reason && reason !== 'no_results') return true;
  if (/http\s*\d{3}|failed|timeout|refused|503|502|500/.test(reason)) return true;
  return false;
}

function placeSearchHardProviderFailure(code = '', providerAttempts = []) {
  const normalizedCode = String(code || '').trim();
  if (normalizedCode === 'relevance_judge_failed') return true;
  if (normalizedCode === 'prior_db_sole_source') return true;
  for (const row of normalizeAttempts(providerAttempts)) {
    if (providerAttemptHardFailure(row)) return true;
  }
  return false;
}

export function placeSearchNoResultsOutcome({
  code = '',
  providerAttempts = [],
  placesCount = 0,
} = {}) {
  if (Number(placesCount) > 0) return false;
  const normalizedCode = String(code || '').trim();
  if (normalizedCode === 'all_providers_failed') {
    return !placeSearchHardProviderFailure(normalizedCode, providerAttempts);
  }
  if (!normalizedCode && providerAttempts.length) {
    return !placeSearchHardProviderFailure(normalizedCode, providerAttempts);
  }
  if (!normalizedCode) return true;
  return false;
}

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function placeSearchReplyFacts({
  target = '',
  area = '',
  destination = '',
  code = 'all_providers_failed',
} = {}) {
  const query = clean(target || area || destination || 'that search');
  return {
    placeSearch: {
      outcome: 'no_results',
      code: String(code || 'all_providers_failed').trim(),
      query,
      detail: query ? `nothing found nearby for ${query}` : 'nothing found nearby for that search',
    },
  };
}

export function inTurnPlaceSearchSoftNoResults({
  classification = null,
  tripDestination = '',
  placeSearch = {},
} = {}) {
  const providerAttempts = Array.isArray(placeSearch?.providers) ? placeSearch.providers : [];
  const failureCode = String(placeSearch?.reason || placeSearch?.code || '').trim();
  if (!placeSearchNoResultsOutcome({
    code: failureCode || 'all_providers_failed',
    providerAttempts,
    placesCount: 0,
  })) return null;
  return {
    inTurnProviderResults: [],
    enforceInTurnSearch: false,
    webResearchTurn: false,
    placeSearchReplyFacts: placeSearchReplyFacts({
      target: clean(classification?.target),
      area: clean(classification?.area || tripDestination),
      destination: tripDestination,
      code: failureCode || 'all_providers_failed',
    }),
    placeSearch,
  };
}

export function applyPlaceSearchReplyFacts(tripContext, facts) {
  if (!tripContext || typeof tripContext !== 'object') return tripContext;
  if (!facts || typeof facts !== 'object') return tripContext;
  return { ...tripContext, ...facts };
}
