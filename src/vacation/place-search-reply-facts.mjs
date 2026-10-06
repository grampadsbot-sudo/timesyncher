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
  if (normalizedCode === 'geocode_failed') return true;
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
  const normalizedCode = String(code || 'all_providers_failed').trim();
  const detail = normalizedCode === 'relevance_rejected_all'
    ? (query ? `providers returned candidates but none passed relevance for ${query}` : 'providers returned candidates but none passed relevance')
    : (query ? `nothing found nearby for ${query}` : 'nothing found nearby for that search');
  return {
    placeSearch: {
      outcome: 'no_results',
      code: normalizedCode,
      query,
      detail,
    },
  };
}

export function placeSearchClientError(messageSource = {}, fallback = 'place_search_failed') {
  const msg = String(messageSource?.error || fallback || '').trim();
  if (/missing_key|refused to run|Missing [A-Z0-9_]+/i.test(msg)) return msg;
  return 'place_search_failed';
}

export function inTurnPlaceSearchSoftNoResults({
  classification = null,
  tripDestination = '',
  placeSearch = {},
  turnError = '',
} = {}) {
  const providerAttempts = Array.isArray(placeSearch?.providers) ? placeSearch.providers : [];
  const failureCode = String(placeSearch?.reason || placeSearch?.code || '').trim();
  const failureError = String(placeSearch?.error || placeSearch?.internalError || turnError || '').trim();
  if (/missing_key|refused to run|Missing [A-Z0-9_]+/i.test(failureError)) return null;
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

export function attachSearchArea(facts, classification) {
  const searchArea = String(classification?.anchor || '').trim();
  if (!searchArea) return facts || null;
  if (!facts) return { searchArea };
  return { ...facts, searchArea };
}

export function attachPlaceSearchTurnScope(facts, classification, searchDiagnostics = {}) {
  let next = attachSearchArea(facts, classification);
  if (!next) return next;
  const searchArea = String(next.searchArea || '').trim();
  const policy = searchDiagnostics?.anchorRadiusPolicy;
  if (searchArea && policy && typeof policy === 'object') {
    next = { ...next, placeSearchAreaScope: policy };
  }
  return next;
}

export function applyPlaceSearchReplyFacts(tripContext, facts) {
  if (!tripContext || typeof tripContext !== 'object') return tripContext;
  if (!facts || typeof facts !== 'object') return tripContext;
  return { ...tripContext, ...facts };
}
