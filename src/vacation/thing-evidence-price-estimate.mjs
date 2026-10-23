import {
  claimsSupported,
  dossierPageId,
} from './thing-dossier-fields.mjs';

export const PRICE_ESTIMATE_UNAVAILABLE = 'Price estimate unavailable';
export const PRICE_ESTIMATE_PREFIX = 'Estimated price';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const DOLLAR_AMOUNT = String.raw`\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?!\d|[.,]\d)`;

function parseAmount(raw) {
  const amount = Number(raw.replace(/[$,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function tierFromText(body = '') {
  const explicit = body.match(/\b(?:price\s*(?:level|range)|cost)[:\s]*(\${1,4})(?!\$|\s*\d)/i);
  const standalone = body.match(/(?:^|\s)(\${2,4})(?!\$|\s*\d)(?=\s|$|[;,.])/);
  return explicit?.[1] || standalone?.[1] || null;
}

function priceContext(body, start, end) {
  const before = body.slice(Math.max(0, start - 90), start);
  const after = body.slice(end, end + 60);
  const suffix = after.match(/^\s*(?:(?:per[\s-]+|\/\s*)(person|night)\b|(?:tickets?|admission|entr[ée]es?|cover)\b)/i);
  const prefix = /\b(?:entr[ée]es?|tickets?|admission|cover(?:\s+charges?)?)\b[^\d$;.!?]{0,60}$/i.test(before);
  if (!suffix && !prefix) return null;
  return {
    unit: suffix?.[1]?.toLowerCase() === 'night' ? 'per night' : 'per person',
    typical: /\b(?:typical|average)\b[^\d$;.!?]{0,60}$/i.test(before),
  };
}

function pricesFromText(body) {
  const prices = [];
  const ranges = [];
  for (const match of body.matchAll(new RegExp(`(${DOLLAR_AMOUNT})\\s*[-–]\\s*(${DOLLAR_AMOUNT})`, 'g'))) {
    const end = match.index + match[0].length;
    ranges.push([match.index, end]);
    const context = priceContext(body, match.index, end);
    const low = parseAmount(match[1]);
    const high = parseAmount(match[2]);
    if (!context || low == null || high == null || high < low) continue;
    prices.push({
      ...context,
      amount: (low + high) / 2,
      range: true,
      text: `${match[1]}–${match[2]} ${context.unit}`,
    });
  }
  for (const match of body.matchAll(new RegExp(DOLLAR_AMOUNT, 'g'))) {
    if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const context = priceContext(body, match.index, match.index + match[0].length);
    const amount = parseAmount(match[0]);
    if (!context || amount == null) continue;
    prices.push({ ...context, amount, range: false, text: `${match[0]} ${context.unit}` });
  }
  return prices;
}

export function buildPriceEstimateFromEvidence(dossier = {}) {
  const priceField = dossier.fields?.price;
  const supportedPrice = claimsSupported(dossier, priceField);
  const claimedPages = new Set((priceField?.claims || []).flatMap((claim) => claim.pages || []));
  const prices = [];
  let bestTier = null;

  for (const [index, page] of (dossier.pages || []).entries()) {
    const pageId = dossierPageId(index);
    const body = String(page?.text || '');
    const tier = tierFromText(body);
    if (tier && !bestTier) bestTier = { tier, pageId };
    for (const price of pricesFromText(body)) {
      prices.push({
        ...price,
        pageId,
        tier,
        claimed: supportedPrice && claimedPages.has(pageId) && !price.range
          && price.amount === Number(priceField.value),
      });
    }
  }

  prices.sort((a, b) => Number(b.typical) - Number(a.typical)
    || Number(b.claimed) - Number(a.claimed) || Number(b.range) - Number(a.range));
  const best = prices[0];
  if (best) {
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${best.text} (${best.pageId})`,
      amount: best.amount,
      unit: best.unit,
      tier: best.tier,
      citations: [{ pageId: best.pageId, signal: text(best.text, 240) }],
    };
  }

  if (bestTier) {
    return {
      available: true,
      label: `${PRICE_ESTIMATE_PREFIX}: ${bestTier.tier} (${bestTier.pageId})`,
      amount: null,
      unit: null,
      tier: bestTier.tier,
      citations: [{ pageId: bestTier.pageId, signal: `price tier ${bestTier.tier}` }],
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
