import { estimateSearchPlacePrice } from './search-place-price-estimate.mjs';
import {
  buildCategoryDescription,
  isGenericDescription,
  logoUrlFromSearchPlace,
} from './trip-thing-enrichment.mjs';

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

function firstPrice(...values) {
  for (const value of values) {
    const parsed = parsePriceValue(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

export function enrichTripThing(thing = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' ? { ...thing.metadata } : {};
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object'
    ? { ...meta.sourceRecord }
    : {};
  const category = text(thing.category, 80).toLowerCase();
  const location = thing.location && typeof thing.location === 'object' ? thing.location : {};
  const description = buildCategoryDescription({
    category,
    title: thing.title,
    sourceRecord,
    address: location.address || '',
    rawDescription: thing.description,
  });
  let price = firstPrice(
    thing.price,
    meta.price,
    sourceRecord.price,
    thing.description,
    description,
  );
  if (price == null && thing.price !== 0) {
    price = estimateSearchPlacePrice({
      category,
      title: thing.title,
      description,
      summary: sourceRecord.summary || thing.summary,
      sourceRecord,
    });
  }
  const logoUrl = logoUrlFromSearchPlace(
    {
      title: thing.title,
      category,
      url: sourceRecord.url || sourceRecord.website,
      sourceRecord,
    },
    sourceRecord,
  );
  const nextMeta = {
    ...meta,
    ...(price != null ? { price } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    sourceRecord: {
      ...sourceRecord,
      ...(description ? { summary: description, description } : {}),
      ...(price != null ? { price } : {}),
      ...(logoUrl ? { logoUrl } : {}),
    },
  };
  return {
    ...thing,
    description,
    metadata: nextMeta,
    ...(price != null ? { price } : {}),
  };
}

export function rowNeedsProductEnrichment(row = {}) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (isGenericDescription(row?.description)) return true;
  const sourceRecord = meta.sourceRecord && typeof meta.sourceRecord === 'object' ? meta.sourceRecord : {};
  if (!text(meta.logoUrl || sourceRecord.logoUrl || row.logoUrl)) return true;
  const price = firstPrice(row?.price, meta.price, sourceRecord.price);
  const category = text(row?.category, 80).toLowerCase();
  if (['flight', 'hotel', 'car'].includes(category) && price == null) {
    const blob = `${row?.description || ''} ${sourceRecord.summary || ''}`;
    if (/\$\s*\d/.test(blob)) return true;
  }
  return false;
}
