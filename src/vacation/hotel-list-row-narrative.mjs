import { buildCategoryDescription, isGenericDescription } from './trip-thing-enrichment.mjs';

function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const HOTEL_SHORT_LINE_MIN_WORDS = 6;

function shortLineFromSourceText(value = '', max = 120) {
  const row = text(value, 4000);
  if (!row) return '';
  const clauses = row.match(/[^.!?;]+[.!?;]/gy);
  if (clauses) {
    let line = '';
    for (const clause of clauses) {
      const next = text(`${line} ${clause}`, 4000);
      if (line && next.length > max) break;
      line = next;
      if (line.split(' ').length >= HOTEL_SHORT_LINE_MIN_WORDS) break;
    }
    return text(line, max);
  }
  return text(row.split(/\s+/).slice(0, 10).join(' '), max);
}

export function isHotelPlanningNote(value = '') {
  const row = text(value, 4000);
  if (!row) return false;
  if (!/^Neighborhood:/i.test(row)) return false;
  return /Rating:/i.test(row) || /Status:\s*candidate/i.test(row) || /Price:\s*\$/i.test(row);
}

export function hotelListRowUnboundNarrative(title = '', address = '') {
  const name = text(title, 120) || 'This hotel';
  const area = text(address, 160) || 'the planned area';
  return text(
    `${name} is a planning row on the Hotels tab without a bound property identity for this trip. `
    + `Use it to compare stay options near ${area}, but verify the real hotel name, nightly rate, check-in rules, and guest reviews on an official listing before you book.`,
    4000,
  );
}

export function hotelStoredCcabListNarrative(title = '', ccabRecord = {}) {
  if (!ccabRecord || typeof ccabRecord !== 'object') return null;
  const displayTitle = text(title, 240);
  const neighborhoodMatch = text(ccabRecord.description).match(/Neighborhood:\s*([^;]+)/i);
  const neighborhood = neighborhoodMatch
    ? text(neighborhoodMatch[1], 160)
    : text(ccabRecord.neighborhood || ccabRecord.address, 160);
  const sourceRecord = { ...ccabRecord, neighborhood };
  const built = buildCategoryDescription({
    category: 'hotel',
    title: displayTitle,
    sourceRecord,
    address: ccabRecord.address,
    rawDescription: text(ccabRecord.websiteFlavour),
  });
  const longRaw = text(ccabRecord.longDetails || ccabRecord.description);
  const ratingSource = text(ccabRecord.thirdPartySource, 40)
    || (ccabRecord.googleRating ? 'Google' : '');
  const ratingLine = text(ccabRecord.thirdPartyRating || ccabRecord.googleRating)
    ? `${ratingSource || 'Guest'} rating ${text(ccabRecord.thirdPartyRating || ccabRecord.googleRating)}${text(ccabRecord.thirdPartyReviewCount || ccabRecord.googleReviewCount) ? ` (${text(ccabRecord.thirdPartyReviewCount || ccabRecord.googleReviewCount)} reviews)` : ''}`
    : '';
  const longDetails = isHotelPlanningNote(longRaw)
    ? text(
      `${built}${ratingLine ? `. ${ratingLine}` : ''}. Compare room types, fees, and cancellation rules on the official listing before you book this candidate.`,
    )
    : longRaw;
  let summary = text(ccabRecord.websiteFlavour)
    ? shortLineFromSourceText(ccabRecord.websiteFlavour, 160)
    : shortLineFromSourceText(built, 160);
  const recordSummary = text(ccabRecord.summary, 500);
  if (
    recordSummary
    && !isHotelPlanningNote(recordSummary)
    && recordSummary.split(/\s+/).filter(Boolean).length >= 8
    && !isGenericDescription(recordSummary)
  ) {
    summary = recordSummary;
  } else if (isHotelPlanningNote(recordSummary)) {
    summary = shortLineFromSourceText(built, 160) || summary;
  }
  return {
    summary,
    longDetails,
    neighborhood,
    websiteFlavour: text(ccabRecord.websiteFlavour),
  };
}
