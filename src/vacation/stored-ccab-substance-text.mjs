function defaultText(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function defaultWordCount(value = '') {
  return defaultText(value).split(/\s+/).filter(Boolean).length;
}

export function bestStoredCcabSubstanceDescription(record = {}, helpers = {}) {
  const text = helpers.text || defaultText;
  const narrativeWordCount = helpers.narrativeWordCount || defaultWordCount;
  const candidates = [
    record.longDetails,
    record.description,
    record.websiteFlavour,
    record.review1,
    record.review2,
    record.review3,
    record.summary,
  ].map((value) => text(value)).filter(Boolean);
  if (!candidates.length) return '';
  const ranked = [...candidates].sort((a, b) => narrativeWordCount(b) - narrativeWordCount(a));
  const rich = ranked.find((row) => narrativeWordCount(row) >= 25);
  return text(rich || ranked[0]);
}
