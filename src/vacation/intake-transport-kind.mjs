function flightLikeLabel(record = {}) {
  const text = [record.name, record.title, record.description, record.whenLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  if (!text) return false;
  if (/\bflight\b/i.test(text)) return true;
  return /\b[A-Z]{3}\s*(?:→|->|to|-)\s*[A-Z]{3}\b/.test(text);
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
  if (tokens.has('car') || tokens.has('rental')) return 'car';
  if (flightLikeLabel(record) && (tokens.has('transport') || tokens.has('transfer'))) return 'flight';
  return '';
}
