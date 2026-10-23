import {
  claimsSupported,
  dossierPageId,
} from './thing-dossier-fields.mjs';

export const PRICE_ESTIMATE_UNAVAILABLE = 'Price estimate unavailable';
export const PRICE_ESTIMATE_PREFIX = 'Estimated price';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseAmount(raw) {
  const match = String(raw || '').match(/([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const TIER_TYPICAL = {
  $: 15,
  $$: 42,
  $$$: 78,
  $$$$: 140,
};

function tierFromText(body = '') {
  const row = text(body, 8000);
  const explicit = row.match(/(?:price\s*(?:level|range)|cost)[:\s]*(\${1,4})\b/i);
  if (explicit && TIER_TYPICAL[explicit[1]]) return explicit[1];
  const moderate = row.match(/\b(moderate|mid[- ]range|inexpensive|expensive|very expensive)\b/i);
  if (moderate) {
    const word = moderate[1].toLowerCase();
    if (word.includes('very expensive')) return '$$$$';
    if (word.includes('expensive')) return '$$$';
    if (word.includes('moderate') || word.includes('mid')) return '$$';
    if (word.includes('inexpensive')) return '$';
  }
  const standalone = row.match(/\b(\${2,4})\b(?!\s*(?:per|\/|night|person))/);
  if (standalone && TIER_TYPICAL[standalone[1]]) return standalone[1];
  return null;
}

function rangeFromText(body = '') {
  const row = text(body, 8000);
  const range = row.match(/\$\s*([\d,]+)\s*[-–]\s*\$?\s*([\d,]+)(?:\s*(?:per person|\/person|each|per night|\/night))?/i);
  if (!range) return null;
  const low = parseAmount(range[1]);
  const high = parseAmount(range[2]);
  if (low == null || high == null || high < low) return null;
  const unit = /\bnight\b/i.test(range[0]) ? 'per night' : 'per person';
  return { low, high, unit, text: `$${low}–$${high} ${unit}` };
}

function singleFromText(body = '') {
  const row = text(body, 8000);
  const from = row.match(/\b(?:from|starting at|average|typical|entrees?|tickets?|admission)\s*(?:at|from|around|about)?\s*\$?\s*([\d,]+)(?:\s*(?:per person|\/person|each|per night|\/night))?/i);
  if (!from) return null;
  const amount = parseAmount(from[1]);
  if (amount == null) return null;
  const unit = /\bnight\b/i.test(from[0]) ? 'per night' : 'per person';
  return { amount, unit, text: `$${amount} ${unit}` };
}

function citePages(citations, pageId, signal) {
  if (!pageId) return;
  citations.push({ pageId, signal: text(signal, 240) });
}

function uniquePageIds(ids = []) {
  return [...new Set(ids.map((id) => text(id, 8)).filter(Boolean))];
}

export function buildPriceEstimateFromEvidence(dossier = {}) {
  const citations = [];
  const priceField = dossier.fields?.price;
  if (priceField && claimsSupported(dossier, priceField) && Number(priceField.value) > 0) {
    const pageIds = uniquePageIds((priceField.claims || []).flatMap((claim) => claim.pages || []));
    pageIds.forEach((pageId) => citePages(citations, pageId, 'evidence price claim'));
    const unit = text(priceField.unit || 'per person', 80);
    const amount = Math.round(Number(priceField.value));
    const cite = pageIds.length ? ` (${pageIds.join(', ')})` : '';
    const body = `$${amount} ${unit}${cite}`;
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${body}`,
      amount,
      unit,
      tier: null,
      citations,
    };
  }

  let bestTier = null;
  let bestRange = null;
  let bestSingle = null;

  for (let index = 0; index < (dossier.pages || []).length; index += 1) {
    const page = dossier.pages[index];
    const pageId = dossierPageId(index);
    const body = page?.text || '';
    const tier = tierFromText(body);
    if (tier && (!bestTier || tier.length > bestTier.tier.length)) {
      bestTier = { tier, pageId };
      citePages(citations, pageId, `price tier ${tier}`);
    }
    const range = rangeFromText(body);
    if (range && (!bestRange || range.high - range.low > bestRange.high - bestRange.low)) {
      bestRange = { ...range, pageId };
      citePages(citations, pageId, 'price range on page');
    }
    const single = singleFromText(body);
    if (single && (!bestSingle || single.amount > bestSingle.amount)) {
      bestSingle = { ...single, pageId };
      citePages(citations, pageId, 'listed price on page');
    }
  }

  if (bestRange) {
    const cite = ` (${bestRange.pageId})`;
    const body = `${bestRange.text}${cite}`;
    const amount = Math.round((bestRange.low + bestRange.high) / 2);
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${body}`,
      amount,
      unit: bestRange.unit,
      tier: bestTier?.tier || null,
      citations,
    };
  }

  if (bestSingle) {
    const cite = ` (${bestSingle.pageId})`;
    const body = `${bestSingle.text}${cite}`;
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${body}`,
      amount: bestSingle.amount,
      unit: bestSingle.unit,
      tier: bestTier?.tier || null,
      citations,
    };
  }

  if (bestTier) {
    const typical = TIER_TYPICAL[bestTier.tier];
    const cite = ` (${bestTier.pageId})`;
    const body = `${bestTier.tier} (typical ~$${typical} per person)${cite}`;
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${body}`,
      amount: typical,
      unit: 'per person',
      tier: bestTier.tier,
      citations,
    };
  }

  return {
    available: false,
    label: PRICE_ESTIMATE_UNAVAILABLE,
    amount: null,
    unit: null,
    tier: null,
    citations: [],
  };
}

export function priceEstimateAcknowledged(place = {}) {
  const record = place.sourceRecord && typeof place.sourceRecord === 'object' ? place.sourceRecord : {};
  const label = text(place.priceEstimateLabel || record.priceEstimateLabel);
  return label.length > 0;
}
