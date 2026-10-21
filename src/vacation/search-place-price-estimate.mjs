function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parsePriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const direct = Number(value);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  const match = String(value).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

const PRICE_LEVEL_DOLLAR_ESTIMATES = {
  $: 15,
  $$: 42,
  $$$: 78,
  $$$$: 140,
};

function priceLevelEstimate(sourceRecord = {}) {
  const level = text(sourceRecord.priceLevel || sourceRecord.price_level, 40).toLowerCase();
  if (!level) return null;
  const dollars = level.match(/^(\$+)/);
  if (dollars && PRICE_LEVEL_DOLLAR_ESTIMATES[dollars[1]]) {
    return PRICE_LEVEL_DOLLAR_ESTIMATES[dollars[1]];
  }
  if (level.includes('very expensive')) return 120;
  if (level.includes('expensive')) return 78;
  if (level.includes('moderate')) return 42;
  if (level.includes('inexpensive')) return 15;
  return null;
}

function rangePriceFromText(...values) {
  for (const value of values) {
    const row = text(value, 4000);
    if (!row) continue;
    const range = row.match(/\$\s*([\d,]+)\s*[-–]\s*\$?\s*([\d,]+)(?:\s*\/\s*night|\s+per\s+night)?/i);
    if (!range) continue;
    const low = parsePriceValue(range[1]);
    const high = parsePriceValue(range[2]);
    if (low == null || high == null || low <= 0 || high <= 0) continue;
    if (/\bnight\b/i.test(row)) return `$${low}-$${high}/night`;
    return Math.round((low + high) / 2);
  }
  return null;
}

function categoryDefaultEstimate(category = '') {
  const cat = text(category, 40).toLowerCase();
  if (cat === 'hotel' || cat === 'lodging' || cat === 'accommodation') return '$250-$350/night';
  if (cat === 'flight') return 348;
  if (cat === 'car') return 72;
  if (cat === 'restaurant') return 58;
  if (cat === 'store' || cat === 'grocery' || cat === 'market' || cat === 'shopping') return 24;
  if (cat === 'music' || cat === 'theatre') return 72;
  if (cat === 'event' || cat === 'activity' || cat === 'tour' || cat === 'attraction') return 65;
  return null;
}

export function estimateSearchPlacePrice({
  category = '',
  title = '',
  description = '',
  summary = '',
  sourceRecord = {},
} = {}) {
  const fromLevel = priceLevelEstimate(sourceRecord);
  if (fromLevel != null && fromLevel > 0) return fromLevel;
  const fromRange = rangePriceFromText(
    description,
    summary,
    sourceRecord.description,
    sourceRecord.summary,
    sourceRecord.longDetails,
    sourceRecord.details,
    title,
  );
  if (fromRange != null && fromRange !== '') return fromRange;
  const fromCategory = categoryDefaultEstimate(category);
  if (fromCategory != null && fromCategory !== '') return fromCategory;
  return null;
}
