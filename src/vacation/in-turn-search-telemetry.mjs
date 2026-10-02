export function inTurnSearchTelemetry(things = []) {
  const rows = (Array.isArray(things) ? things : []).flatMap((thing) => {
    const provider = String(thing?.source || thing?.metadata?.source || '').trim();
    const providerId = String(thing?.metadata?.sourceRef?.id || thing?.metadata?.externalId || '').trim();
    if (!provider || !providerId) return [];
    return [{ provider, providerId }];
  });
  return {
    status: 'ok',
    providers: [...new Set(rows.map((row) => row.provider))],
    results: rows,
    resultIds: rows.map((row) => row.providerId),
    sources: rows.map((row) => row.provider),
  };
}
