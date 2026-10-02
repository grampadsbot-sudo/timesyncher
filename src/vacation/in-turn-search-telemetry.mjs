function resultRowsFromThings(things = []) {
  return (Array.isArray(things) ? things : []).flatMap((thing) => {
    const provider = String(thing?.source || thing?.metadata?.source || '').trim();
    const providerId = String(thing?.metadata?.sourceRef?.id || thing?.metadata?.externalId || '').trim();
    if (!provider || !providerId) return [];
    return [{ provider, providerId }];
  });
}

function normalizeProviderAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((row) => {
    const provider = String(row?.provider || '').trim();
    const status = String(row?.status || '').trim();
    if (!provider || !status) return null;
    const entry = { provider, status };
    if (row.reason) entry.reason = String(row.reason).trim();
    if (Number.isFinite(Number(row.resultCount))) entry.resultCount = Number(row.resultCount);
    if (Number.isFinite(Number(row.relevanceRejected))) entry.relevanceRejected = Number(row.relevanceRejected);
    if (row.query) entry.query = String(row.query).trim().slice(0, 500);
    if (row.endpoint) entry.endpoint = String(row.endpoint).trim().slice(0, 40);
    return entry;
  }).filter(Boolean);
}

export function placeSearchStatusFromProviderAttempts(things = []) {
  return Array.isArray(things) && things.length > 0 ? 'ok' : 'failed';
}

export function placeSearchFailureRouteStatus(reason = '') {
  const value = String(reason || '').trim();
  if (value === 'relevance_rejected_all') return 'place_search_no_relevant_results';
  if (value === 'relevance_judge_failed') return 'relevance_judge_failed';
  return 'place_search_failed';
}

export function inTurnSearchTelemetry(things = [], providerAttempts = []) {
  const rows = resultRowsFromThings(things);
  const providers = normalizeProviderAttempts(providerAttempts);
  const telemetry = {
    status: 'ok',
    providers: providers.length ? providers : [...new Set(rows.map((row) => row.provider))],
    results: rows,
    resultIds: rows.map((row) => row.providerId),
    sources: rows.map((row) => row.provider),
  };
  return telemetry;
}

export function stampTurnClassifier(payload, customerLive, classification) {
  const turnClassifier = {
    turnKind: classification?.ok === true ? classification.turnKind : null,
    classifierModel: classification?.routerModel || null,
  };
  payload.turnClassifier = turnClassifier;
  customerLive.turnClassifier = turnClassifier;
  return turnClassifier;
}

export function turnClassifierFailedTelemetry(reason) {
  const detail = String(reason || 'trip intake classification failed').trim();
  return {
    turnKind: null,
    error: 'turn_classifier_failed',
    reason: detail,
    providers: [],
    results: [],
    resultIds: [],
    sources: [],
  };
}

export function placeSearchTelemetry({
  status = 'ok',
  error = null,
  things = [],
  providerAttempts = [],
  turnKind = null,
  classifierModel = null,
  reason = null,
  relevanceRejections = null,
  judgeInput = null,
  searchCenter = null,
  anchor = null,
  survivingPriorDbTitles = null,
  dedupeMerges = null,
  judgeHttpStatus = null,
  judgeBodySnippet = null,
  providerErrors = null,
  braveLookups = null,
} = {}) {
  const rows = resultRowsFromThings(things);
  const providers = normalizeProviderAttempts(providerAttempts);
  const telemetry = {
    status,
    providers,
    results: rows,
    resultIds: rows.map((row) => row.providerId),
    sources: rows.map((row) => row.provider),
  };
  if (error) telemetry.error = String(error).trim();
  if (reason) telemetry.reason = String(reason).trim();
  if (turnKind) telemetry.turnKind = String(turnKind).trim();
  if (classifierModel) telemetry.classifierModel = String(classifierModel).trim();
  if (Array.isArray(relevanceRejections) && relevanceRejections.length) {
    telemetry.relevanceRejections = relevanceRejections.slice(0, 10);
  }
  if (judgeInput && typeof judgeInput === 'object') {
    telemetry.judgeInput = {
      target: String(judgeInput.target || '').trim(),
      area: String(judgeInput.area || '').trim(),
    };
  }
  if (searchCenter && typeof searchCenter === 'object') {
    const lat = Number(searchCenter.lat);
    const lng = Number(searchCenter.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) telemetry.searchCenter = { lat, lng };
  }
  if (anchor && typeof anchor === 'object') {
    const text = String(anchor.text || '').trim();
    const source = String(anchor.source || '').trim();
    if (text) telemetry.anchor = { text, ...(source ? { source } : {}) };
  }
  if (Array.isArray(survivingPriorDbTitles) && survivingPriorDbTitles.length) {
    telemetry.survivingPriorDbTitles = survivingPriorDbTitles.slice(0, 20);
  }
  if (Array.isArray(dedupeMerges) && dedupeMerges.length) {
    telemetry.dedupeMerges = dedupeMerges.slice(0, 20);
  }
  if (Number.isFinite(Number(judgeHttpStatus))) telemetry.judgeHttpStatus = Number(judgeHttpStatus);
  if (judgeBodySnippet) telemetry.judgeBodySnippet = String(judgeBodySnippet).trim().slice(0, 240);
  if (Array.isArray(providerErrors) && providerErrors.length) {
    telemetry.providerErrors = providerErrors.slice(0, 10).map((row) => ({
      provider: String(row?.provider || '').trim(),
      ...(Number.isFinite(Number(row?.httpStatus)) ? { httpStatus: Number(row.httpStatus) } : {}),
      message: String(row?.message || row?.reason || '').trim(),
    })).filter((row) => row.provider && row.message);
  }
  if (Array.isArray(braveLookups) && braveLookups.length) {
    telemetry.braveLookups = braveLookups.slice(0, 10).map((row) => ({
      query: String(row?.query || '').trim().slice(0, 500),
      endpoint: String(row?.endpoint || '').trim().slice(0, 40),
    })).filter((row) => row.query && row.endpoint);
  }
  return telemetry;
}
