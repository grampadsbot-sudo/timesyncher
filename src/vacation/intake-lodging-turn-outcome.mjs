export function buildIntakeLodgingOutcome({ saved = [], misses = [], lookups = [] } = {}) {
  const savedRows = Array.isArray(saved) ? saved : [];
  const missRows = (Array.isArray(misses) ? misses : []).map((row) => ({
    propertyName: String(row?.propertyName || '').trim(),
    query: String(row?.query || '').trim(),
    reason: String(row?.reason || '').trim(),
    status: 'miss',
  })).filter((row) => row.propertyName || row.reason);
  const lookupRows = (Array.isArray(lookups) ? lookups : []).filter((row) => row && typeof row === 'object');
  let status = 'none';
  if (savedRows.length && missRows.length) status = 'partial';
  else if (savedRows.length) status = 'ok';
  else if (missRows.length) status = 'miss';
  return { status, lookups: lookupRows, misses: missRows };
}
