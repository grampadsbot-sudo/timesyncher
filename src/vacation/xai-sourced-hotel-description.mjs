import { isGenericDescription } from './trip-thing-enrichment.mjs';
import { searchProductCategoryFromPlace } from './xai-grok-place-ratings-helpers.mjs';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function wordCount(value = '') {
  return text(value).split(/\s+/).filter(Boolean).length;
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

function themeSnippet(record = {}) {
  const themes = record.reviewThemes && typeof record.reviewThemes === 'object'
    ? record.reviewThemes
    : {};
  const praise = Array.isArray(themes.praise) ? themes.praise : [];
  const rows = praise.map((row) => text(row, 240)).filter(Boolean);
  return rows.slice(0, 2).join('; ');
}

function ratingLine(record = {}) {
  const bits = [];
  if (text(record.googleRating)) {
    bits.push(`Google ${record.googleRating}${text(record.googleReviewCount) ? ` (${record.googleReviewCount} reviews)` : ''}`);
  }
  if (text(record.yelpRating)) {
    bits.push(`Yelp ${record.yelpRating}${text(record.yelpReviewCount) ? ` (${record.yelpReviewCount} reviews)` : ''}`);
  }
  if (text(record.thirdPartyRating)) {
    const label = text(record.thirdPartySource, 40) || 'Booking';
    bits.push(`${label} ${record.thirdPartyRating}${text(record.thirdPartyReviewCount) ? ` (${record.thirdPartyReviewCount} reviews)` : ''}`);
  }
  return bits.join('; ');
}

function neighborhoodFromRecord(record = {}, address = '') {
  const fromDesc = text(record.description || record.summary, 4000);
  const neighborhoodMatch = fromDesc.match(/Neighborhood:\s*([^;]+)/i);
  if (neighborhoodMatch) return text(neighborhoodMatch[1], 160);
  return text(record.neighborhood || record.area || address, 160);
}

export function composeSourcedHotelDescriptionFromRecord(record = {}, {
  title = '',
  address = '',
} = {}) {
  const existing = text(
    record.longDetails || record.details || record.description || record.summary,
  );
  if (existing && !isGenericDescription(existing) && wordCount(existing) >= 10) {
    return existing;
  }
  const parts = [];
  const neighborhood = neighborhoodFromRecord(record, address);
  if (neighborhood) parts.push(`Neighborhood: ${neighborhood}`);
  const flavour = text(record.websiteFlavour, 800);
  if (flavour) parts.push(flavour);
  const themes = themeSnippet(record);
  if (themes) parts.push(`Guest feedback themes: ${themes}`);
  const ratings = ratingLine(record);
  if (ratings) parts.push(ratings);
  const price = parsePriceValue(record.price ?? record.nightlyRate ?? record.rate);
  if (price != null && price > 0) parts.push(`Price: about $${price.toLocaleString('en-US')}/night`);
  if (!parts.length) return '';
  const composed = text(parts.join('; '), 4000);
  if (wordCount(composed) < 6) return '';
  return composed;
}

export function applySourcedHotelDescriptionToRecord(record = {}, context = {}) {
  const category = searchProductCategoryFromPlace({ category: context.category || record.category });
  if (category !== 'hotel') return record;
  const next = { ...record };
  const composed = composeSourcedHotelDescriptionFromRecord(next, {
    title: context.title || '',
    address: context.address || next.address || '',
  });
  if (!composed) return next;
  const prior = text(next.description || next.longDetails || next.summary);
  if (!prior || isGenericDescription(prior) || wordCount(prior) < 10) {
    next.description = composed;
    next.longDetails = composed;
    if (!text(next.summary) || isGenericDescription(next.summary)) {
      next.summary = text(composed.split(/[.!?;]/)[0] || composed, 280);
    }
  }
  return next;
}
