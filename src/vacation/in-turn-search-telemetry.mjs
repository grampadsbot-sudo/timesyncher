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
    return entry;
  }).filter(Boolean);
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

export function placeSearchTelemetry({
  status = 'ok',
  error = null,
  things = [],
  providerAttempts = [],
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
  return telemetry;
}
