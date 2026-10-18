function flightLikeLabel(record = {}) {
  const text = [record.name, record.title, record.description, record.whenLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!text) return false;
  if (/^flight\b/i.test(text) || /\bflight option\b/i.test(text)) return true;
  if (/\bflight\b/i.test(text)) return true;
  return /\b[A-Z]{3}\s*(?:→|->|to|-)\s*[A-Z]{3}\b/.test(text);
}

function flightFields(record = {}) {
  const meta = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const sourceRecord = record.sourceRecord && typeof record.sourceRecord === 'object' ? record.sourceRecord : {};
  const candidates = [
    record.airline,
    record.airlineName,
    record.flightNumber,
    record.flight_number,
    sourceRecord.airline,
    sourceRecord.airlineName,
    sourceRecord.flightNumber,
    sourceRecord.flight_number,
    meta.airline,
    meta.flightNumber,
    meta.flight_number,
  ];
  return candidates.some((value) => String(value || '').trim());
}

export function transportKind(record = {}) {
  const tokens = new Set();
  for (const part of [record.category, record.category_name, record.category?.name, record.type]) {
    for (const token of String(part || '').toLowerCase().split(/[^a-z]+/)) {
      if (token) tokens.add(token);
    }
  }
  const meta = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const sourceRecord = record.sourceRecord && typeof record.sourceRecord === 'object' ? record.sourceRecord : {};
  const providerCategories = Array.isArray(record.providerCategories)
    ? record.providerCategories
    : (Array.isArray(meta.providerCategories)
      ? meta.providerCategories
      : (Array.isArray(sourceRecord.providerCategories) ? sourceRecord.providerCategories : []));
  for (const label of providerCategories) {
    for (const token of String(label || '').toLowerCase().split(/[^a-z]+/)) {
      if (token) tokens.add(token);
    }
  }
  if (tokens.has('flight')) return 'flight';
  if (flightFields(record)) return 'flight';
  if (flightLikeLabel(record)) return 'flight';
  if (tokens.has('car') || tokens.has('rental')) return 'car';
  return '';
}
