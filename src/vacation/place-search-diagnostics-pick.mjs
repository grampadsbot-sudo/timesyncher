export function pickPlaceSearchDiagnostics(search = {}) {
  if (!search || typeof search !== 'object') return {};
  const picked = {};
  for (const key of [
    'judgeInput',
    'searchCenter',
    'providerTimings',
    'anchor',
    'anchorRadiusRejected',
    'anchorRadiusPolicy',
    'anchorRadiusRejections',
    'relevanceRejections',
    'survivingPriorDbTitles',
    'dedupeMerges',
    'providerErrors',
    'braveLookups',
    'judgeHttpStatus',
    'judgeBodySnippet',
  ]) {
    if (search[key] !== undefined) picked[key] = search[key];
  }
  return picked;
}
