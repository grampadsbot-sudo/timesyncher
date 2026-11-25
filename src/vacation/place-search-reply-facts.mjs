import { sayVacationNotTrip } from './customer-visible-copy.mjs';
import { vkBotUsageCost } from './turn-cost.mjs';

export const REPLY_PLACE_SEARCH_PROVIDER_LEAK = 'reply_place_search_provider_leak';

const PROVIDER_TOKEN = /\b(?:nominatim|openstreetmap|prior_db|osm|brave|tavily)\b/i;
const PLACE_SEARCH_FAILED = /(?:place|web)\s+(?:search|research)\s+failed|\b(?:place_search_failed|web_search_failed|tavili_api_key|tavily_[a-z_]+)\b|\bHTTP\s*[45]\d{2}\b/i;
const OFF_TOPIC_PREFIX_RE = /^\s*(?:unrelated|off[\s-]?topic)\s*[:\-–—]/i;
const OFF_TOPIC_PLANET_RE = /\b(?:weather|forecast|temperature|hotels?|restaurants?|flights?|vacation|trip)\b[^.?!]{0,80}\bon\s+(?:mars|the\s+moon|jupiter|saturn|venus|mercury|pluto|neptune|uranus)\b|\b(?:mars|the\s+moon|jupiter|saturn|venus|mercury|pluto|neptune|uranus)\b[^.?!]{0,50}\b(?:weather|forecast|temperature)\b/i;

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
  outcome = 'no_results',
} = {}) {
  const query = clean(target || area || destination || 'that search');
  const normalizedCode = String(code || 'all_providers_failed').trim();
  const detail = outcome === 'search_unavailable'
    ? (query
      ? `could not look up ${query} right now; briefly say you could not look that up right now and continue planning the vacation without naming any search provider or error`
      : 'could not look that up right now; briefly say you could not look that up right now and continue planning the vacation without naming any search provider or error')
    : normalizedCode === 'relevance_rejected_all'
      ? (query ? `providers returned candidates but none passed relevance for ${query}` : 'providers returned candidates but none passed relevance')
      : (query ? `nothing found nearby for ${query}` : 'nothing found nearby for that search');
  return {
    placeSearch: {
      outcome,
      code: normalizedCode,
      query,
      detail,
    },
  };
}

export function isOffTopicVacationSearch(customerTurn = '', classification = null) {
  const text = `${String(customerTurn || '')}\n${String(classification?.question || '')}\n${String(classification?.target || '')}`;
  return OFF_TOPIC_PREFIX_RE.test(String(customerTurn || '')) || OFF_TOPIC_PLANET_RE.test(text);
}

function webResearchReplyFacts({
  question = '',
  destination = '',
  offTopic = false,
} = {}) {
  const query = clean(question || destination || 'that question');
  const outcome = offTopic ? 'off_topic' : 'search_unavailable';
  const detail = offTopic
    ? 'this ask is outside the vacation plan; briefly decline or redirect back to planning the vacation without naming any search provider or error'
    : 'could not look that up right now; briefly say you could not look that up right now and continue planning the vacation without naming any search provider or error';
  return {
    webSearch: {
      outcome,
      query,
      detail,
    },
  };
}

export function placeSearchClientError(messageSource = {}, fallback = 'place_search_failed') {
  const reason = String(messageSource?.reason || messageSource?.code || '').trim();
  if (reason === 'relevance_judge_failed') return 'relevance_judge_failed';
  const msg = String(messageSource?.error || messageSource?.internalError || fallback || '').trim();
  if (/missing_key|refused to run|Missing [A-Z0-9_]+/i.test(msg)) return msg;
  if (/relevance_judge_failed|jev relevance judge/i.test(msg)) return 'relevance_judge_failed';
  return 'place_search_failed';
}

const HARD_PLACE_SEARCH_CODES = new Set(['relevance_judge_failed', 'prior_db_sole_source', 'geocode_failed']);

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
  if (HARD_PLACE_SEARCH_CODES.has(failureCode)) return null;
  const softNoResults = placeSearchNoResultsOutcome({
    code: failureCode || 'all_providers_failed',
    providerAttempts,
    placesCount: 0,
  });
  const recoverableProviderFailure = !softNoResults
    && (providerAttempts.some(providerAttemptHardFailure)
      || /http\s*\d{3}|failed|timeout|refused|503|502|500|433|no results/i.test(failureError)
      || failureCode === 'all_providers_failed');
  if (!softNoResults && !recoverableProviderFailure) return null;
  return {
    inTurnProviderResults: [],
    enforceInTurnSearch: false,
    webResearchTurn: false,
    placeSearchReplyFacts: placeSearchReplyFacts({
      target: clean(classification?.target),
      area: clean(classification?.area || tripDestination),
      destination: tripDestination,
      code: failureCode || 'all_providers_failed',
      outcome: softNoResults ? 'no_results' : 'search_unavailable',
    }),
    placeSearch,
  };
}

export function inTurnWebResearchSoftFail({
  customerTurn = '',
  classification = null,
  tripDestination = '',
  webSearch = {},
  offTopic = false,
} = {}) {
  const isOffTopic = offTopic === true || isOffTopicVacationSearch(customerTurn, classification);
  return {
    inTurnProviderResults: [],
    enforceInTurnSearch: false,
    webResearchTurn: false,
    placeSearchReplyFacts: webResearchReplyFacts({
      question: clean(classification?.question || customerTurn),
      destination: tripDestination,
      offTopic: isOffTopic,
    }),
    webSearch,
  };
}

function softSearchOutcome(facts = null) {
  const webOutcome = String(facts?.webSearch?.outcome || '').trim();
  if (webOutcome === 'off_topic' || webOutcome === 'search_unavailable') return webOutcome;
  const placeOutcome = String(facts?.placeSearch?.outcome || '').trim();
  if (placeOutcome === 'search_unavailable') return placeOutcome;
  return '';
}

function softSearchFallbackReply(outcome, destination = '') {
  const where = clean(destination, 80);
  const target = where ? `${where} vacation` : 'vacation';
  const line = outcome === 'off_topic'
    ? `That is outside this vacation plan, so I cannot help with that one. Tell me what you want to add or change for your ${target} and we will keep building your days.`
    : `I could not look that up right now, so let us keep building your ${target}. Tell me which days or ideas you want to plan next.`;
  return sayVacationNotTrip(line);
}

export function recoverSoftSearchReply(produced, facts, { backend = '', destination = '' } = {}) {
  const outcome = softSearchOutcome(facts);
  if (!outcome) return null;
  const source = produced && typeof produced === 'object' ? produced : {};
  const existing = String(source.reply || '').trim();
  if (existing && !replyPlaceSearchProviderLeakReason(existing)) return null;
  const reply = softSearchFallbackReply(outcome, destination);
  const quality = {
    judged: true,
    score: 4,
    disposition: outcome === 'off_topic' ? 'off_topic_redirect_stored' : 'search_unavailable_stored',
    comment: outcome === 'off_topic' ? 'off-topic redirect stored' : 'search unavailable fallback stored',
  };
  const resolvedBackend = backend || source.model?.backend || null;
  const model = {
    ...(source.model && typeof source.model === 'object' ? source.model : {}),
    called: Boolean(source.model?.called),
    via: source.model?.via || (resolvedBackend === 'vk_bot_mcp' ? 'vk_bot_mcp' : 'search_soft_fallback'),
    backend: resolvedBackend,
    quality,
  };
  if (resolvedBackend === 'vk_bot_mcp' && !model.cost) {
    model.cost = vkBotUsageCost({});
  }
  return {
    ...source,
    reply,
    reason: null,
    quality,
    model,
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
