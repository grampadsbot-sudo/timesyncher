import { normalizePlaceSearchCategory, placeSearchTurnClassificationError } from './place-search-category-keys.mjs';
import { placeSearchTurnKindError } from './place-search-target-kind.mjs';

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
    if (Number.isFinite(Number(row.httpStatus))) entry.httpStatus = Number(row.httpStatus);
    if (Number.isFinite(Number(row.calledAtMs))) entry.calledAtMs = Number(row.calledAtMs);
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
  const turnKind = classification?.ok === true ? classification.turnKind : (classification?.turnKind || null);
  const normalizedCategory = normalizePlaceSearchCategory(classification?.category);
  const turnClassifier = {
    turnKind,
    targetKind: classification?.ok === true
      ? (classification.targetKind || null)
      : (classification?.targetKind || classification?.targetKindRaw || null),
    classifierModel: classification?.routerModel || null,
    ...(String(turnKind || '').trim().toLowerCase() === 'place_search'
      ? { category: normalizedCategory || null }
      : {}),
    ...(classification?.categoryRaw ? { categoryRaw: String(classification.categoryRaw).trim() } : {}),
    ...(classification?.targetKindRaw && !classification?.targetKind
      ? { targetKindRaw: String(classification.targetKindRaw).trim() }
      : {}),
  };
  if (!String(turnKind || '').trim()) {
    turnClassifier.error = 'turn_classifier_failed';
    turnClassifier.reason = String(
      classification?.error
      || placeSearchTurnKindError(classification)
      || 'trip intake classification turnKind missing',
    ).trim();
  }
  payload.turnClassifier = turnClassifier;
  customerLive.turnClassifier = turnClassifier;
  return turnClassifier;
}

function turnClassifierStampError(classification = {}, stamped = null) {
  if (classification?.ok !== true) {
    return String(classification?.error || 'trip intake classification failed').trim();
  }
  return placeSearchTurnClassificationError(classification)
    || placeSearchTurnKindError(classification)
    || (!String(stamped?.turnKind || '').trim() ? 'trip intake classification turnKind missing' : '');
}

export async function failTurnClassifierCategoryGate({
  db,
  turnId,
  payload,
  customerLive,
  classification,
} = {}) {
  const stamped = payload?.turnClassifier || customerLive?.turnClassifier || null;
  const error = turnClassifierStampError(classification, stamped);
  if (!error) return null;
  const failedTelemetry = turnClassifierFailedTelemetry(error, classification);
  payload.placeSearch = failedTelemetry;
  payload.webSearch = failedTelemetry;
  customerLive.placeSearch = failedTelemetry;
  customerLive.webSearch = failedTelemetry;
  if (db && turnId) {
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnId}
    `;
  }
  return {
    ok: false,
    status: 'turn_classifier_failed',
    error,
    placeSearch: failedTelemetry,
    webSearch: failedTelemetry,
  };
}

export function turnClassifierFailedTelemetry(reason, classification = null) {
  const detail = String(reason || 'trip intake classification failed').trim();
  const turnKind = classification?.turnKind || null;
  const normalizedCategory = normalizePlaceSearchCategory(classification?.category);
  return {
    turnKind,
    targetKind: classification?.targetKind || classification?.targetKindRaw || null,
    ...(String(turnKind || '').trim().toLowerCase() === 'place_search'
      ? { category: normalizedCategory || null }
      : {}),
    ...(classification?.categoryRaw ? { categoryRaw: String(classification.categoryRaw).trim() } : {}),
    ...(classification?.targetKindRaw && !classification?.targetKind
      ? { targetKindRaw: String(classification.targetKindRaw).trim() }
      : {}),
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
  anchorRadiusPolicy = null,
  anchorRadiusRejections = null,
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
  if (anchorRadiusPolicy && typeof anchorRadiusPolicy === 'object') {
    const lat = Number(anchorRadiusPolicy?.center?.lat);
    const lng = Number(anchorRadiusPolicy?.center?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      telemetry.anchorRadiusPolicy = {
        scope: String(anchorRadiusPolicy.scope || '').trim(),
        ...(Number.isFinite(Number(anchorRadiusPolicy.radiusMeters))
          ? { radiusMeters: Number(anchorRadiusPolicy.radiusMeters) }
          : {}),
        center: {
          lat,
          lng,
          ...(anchorRadiusPolicy.center?.label
            ? { label: String(anchorRadiusPolicy.center.label).trim() }
            : {}),
        },
      };
    }
  }
  if (Array.isArray(anchorRadiusRejections) && anchorRadiusRejections.length) {
    telemetry.anchorRadiusRejections = anchorRadiusRejections.slice(0, 20);
  }
  return telemetry;
}
