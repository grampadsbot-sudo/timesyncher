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
  ]) {
    if (error[key] !== undefined) picked[key] = error[key];
  }
  return picked;
}
