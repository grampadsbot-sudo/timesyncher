const FILL_INTERNAL_OVERRIDE_KEYS = new Set([
  'evidenceDossier',
  'braveResults',
  'reviewExcerpts',
  'reviewSet',
]);

function stripRecordInternals(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const next = { ...record };
  for (const key of FILL_INTERNAL_OVERRIDE_KEYS) delete next[key];
  if (next.sourceRecord && typeof next.sourceRecord === 'object') {
    const sourceRecord = { ...next.sourceRecord };
    for (const key of FILL_INTERNAL_OVERRIDE_KEYS) delete sourceRecord[key];
    next.sourceRecord = sourceRecord;
  }
  return next;
}

export function stripFillInternalsFromServedSharedTrip(shared = {}) {
  if (!shared || typeof shared !== 'object') return shared;
  const thingOverrides = shared.thingOverrides && typeof shared.thingOverrides === 'object'
    ? Object.fromEntries(Object.entries(shared.thingOverrides).map(([key, value]) => [key, stripRecordInternals(value)]))
    : shared.thingOverrides;
  const places = Array.isArray(shared.places)
    ? shared.places.map((place) => {
      if (!place || typeof place !== 'object') return place;
      const next = { ...place };
      if (next.sourceRecord && typeof next.sourceRecord === 'object') {
        next.sourceRecord = stripRecordInternals(next.sourceRecord);
      }
      return next;
    })
    : shared.places;
  return { ...shared, places, thingOverrides };
}

export function servedSharedTripUncompressedBytes(shared = {}) {
  return Buffer.byteLength(JSON.stringify(shared ?? {}), 'utf8');
}
