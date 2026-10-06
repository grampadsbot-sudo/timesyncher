function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function capRejections(rejections = []) {
  return (Array.isArray(rejections) ? rejections : []).slice(0, 10).map((row) => ({
    title: String(row?.title || '').trim(),
    address: String(row?.address || '').trim(),
    source: String(row?.source || '').trim(),
    ...(Number.isFinite(Number(row?.score)) ? { score: Number(row.score) } : {}),
    reason: String(row?.reason || '').trim(),
  })).filter((row) => row.title || row.reason);
}

export function buildPlaceSearchFailureDiagnostics({
  center = null,
  judgeTarget = '',
  judgeArea = '',
  anchor = null,
  anchorRadiusRejected = 0,
  relevanceRejections = [],
  survivingPriorDbTitles = [],
  dedupeMerges = [],
  providerErrors = [],
  braveLookups = [],
  anchorRadiusPolicy = null,
  anchorRadiusRejections = [],
  providerTimings = null,
} = {}) {
  const lat = finite(center?.lat);
  const lng = finite(center?.lng);
  const anchorText = String(anchor?.text || '').trim();
  const anchorSource = String(anchor?.source || '').trim();
  const diagnostics = {
    judgeInput: {
      target: String(judgeTarget || '').trim(),
      area: String(judgeArea || '').trim(),
    },
    relevanceRejections: capRejections(relevanceRejections),
    survivingPriorDbTitles: (Array.isArray(survivingPriorDbTitles) ? survivingPriorDbTitles : [])
      .map((title) => String(title || '').trim())
      .filter(Boolean)
      .slice(0, 20),
  };
  if (lat !== null && lng !== null) diagnostics.searchCenter = { lat, lng };
  if (anchorText) diagnostics.anchor = { text: anchorText, source: anchorSource || 'unknown' };
  const rejected = Number(anchorRadiusRejected);
  if (Number.isFinite(rejected) && rejected > 0) diagnostics.anchorRadiusRejected = rejected;
  const merges = (Array.isArray(dedupeMerges) ? dedupeMerges : []).slice(0, 20);
  if (merges.length) diagnostics.dedupeMerges = merges;
  const errors = (Array.isArray(providerErrors) ? providerErrors : []).slice(0, 10).map((row) => ({
    provider: String(row?.provider || '').trim(),
    ...(Number.isFinite(Number(row?.httpStatus)) ? { httpStatus: Number(row.httpStatus) } : {}),
    message: String(row?.message || row?.reason || '').trim(),
  })).filter((row) => row.provider && row.message);
  if (errors.length) diagnostics.providerErrors = errors;
  const lookups = (Array.isArray(braveLookups) ? braveLookups : []).map((row) => ({
    query: String(row?.query || '').trim().slice(0, 500),
    endpoint: String(row?.endpoint || '').trim().slice(0, 40),
  })).filter((row) => row.query && row.endpoint);
  if (lookups.length) diagnostics.braveLookups = lookups;
  if (anchorRadiusPolicy && typeof anchorRadiusPolicy === 'object') {
    const policyLat = finite(anchorRadiusPolicy?.center?.lat);
    const policyLng = finite(anchorRadiusPolicy?.center?.lng);
    diagnostics.anchorRadiusPolicy = {
      scope: String(anchorRadiusPolicy.scope || '').trim(),
      ...(Number.isFinite(Number(anchorRadiusPolicy.radiusMeters))
        ? { radiusMeters: Number(anchorRadiusPolicy.radiusMeters) }
        : {}),
      ...(policyLat !== null && policyLng !== null
        ? {
          center: {
            lat: policyLat,
            lng: policyLng,
            ...(anchorRadiusPolicy.center?.label
              ? { label: String(anchorRadiusPolicy.center.label).trim() }
              : {}),
          },
        }
        : {}),
    };
  }
  const radiusRejections = (Array.isArray(anchorRadiusRejections) ? anchorRadiusRejections : [])
    .slice(0, 20)
    .map((row) => ({
      title: String(row?.title || '').trim(),
      source: String(row?.source || '').trim(),
      ...(Number.isFinite(Number(row?.lat)) ? { lat: Number(row.lat) } : {}),
      ...(Number.isFinite(Number(row?.lng)) ? { lng: Number(row.lng) } : {}),
      ...(Number.isFinite(Number(row?.meters)) ? { meters: Number(row.meters) } : {}),
      ...(Number.isFinite(Number(row?.limitMeters)) ? { limitMeters: Number(row.limitMeters) } : {}),
      scope: String(row?.scope || '').trim(),
      reason: String(row?.reason || '').trim(),
    }))
    .filter((row) => row.title || row.reason);
  if (radiusRejections.length) diagnostics.anchorRadiusRejections = radiusRejections;
  if (providerTimings && typeof providerTimings === 'object') {
    const timings = {};
    for (const [key, value] of Object.entries(providerTimings)) {
      const ms = Number(value);
      if (Number.isFinite(ms) && ms >= 0) timings[key] = Math.round(ms);
    }
    if (Object.keys(timings).length) diagnostics.providerTimings = timings;
  }
  return diagnostics;
}

export function placeSearchDiagnosticsFromError(error) {
  if (!error || typeof error !== 'object') return {};
  const picked = {};
  for (const key of [
    'relevanceRejections',
    'judgeInput',
    'searchCenter',
    'anchor',
    'survivingPriorDbTitles',
    'dedupeMerges',
    'anchorRadiusRejected',
    'judgeHttpStatus',
    'judgeBodySnippet',
    'judgeTimedOut',
    'judgeTimeoutMs',
    'providerErrors',
    'braveLookups',
    'anchorRadiusPolicy',
    'anchorRadiusRejections',
    'providerTimings',
  ]) {
    if (error[key] !== undefined) picked[key] = error[key];
  }
  return picked;
}
