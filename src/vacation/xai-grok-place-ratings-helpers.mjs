function text(value, max = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function ratingScaleMax(block = {}, rawAverage = null) {
  const explicit = Number(block?.scaleMax);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const parsed = Number(rawAverage ?? block?.average);
  if (Number.isFinite(parsed) && parsed > 5 && parsed <= 10) return 10;
  return 5;
}

function normalizeAverageToFive(value, block = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const scale = ratingScaleMax(block, parsed);
  const onFive = (parsed / scale) * 5;
  if (!Number.isFinite(onFive) || onFive <= 0 || onFive > 5) return null;
  return Math.round(onFive * 10) / 10;
}

function numericRating(value, block = {}) {
  return normalizeAverageToFive(value, block);
}

function numericCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function parseJsonObject(raw = '') {
  const source = text(raw, 200000);
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = source.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeSiteBlock(block = {}) {
  if (!block || typeof block !== 'object') {
    return { average: null, reviewCount: null, sourceUrl: '', notPublished: true };
  }
  if (block.notPublished === true) {
    return { average: null, reviewCount: null, sourceUrl: text(block.sourceUrl, 500), notPublished: true };
  }
  const average = normalizeAverageToFive(block.average, block);
  const reviewCount = numericCount(block.reviewCount);
  if (average == null || reviewCount == null) {
    return { average: null, reviewCount: null, sourceUrl: text(block.sourceUrl, 500), notPublished: true };
  }
  return {
    average,
    reviewCount,
    sourceUrl: text(block.sourceUrl, 500),
    notPublished: false,
  };
}

function isGoogleOrYelpUrl(url = '') {
  const row = text(url, 500).toLowerCase();
  if (!row) return false;
  return /google\.(?:com|[a-z]{2})\/maps|g\.page|yelp\.com/i.test(row);
}

export function parseXaiStructuredPayload(raw = '') {
  const parsed = parseJsonObject(raw) || {};
  const google = normalizeSiteBlock(parsed.google);
  const yelp = normalizeSiteBlock(parsed.yelp);
  const otherSites = (Array.isArray(parsed.otherSites) ? parsed.otherSites : [])
    .map((row) => ({
      average: normalizeAverageToFive(row?.average, row),
      reviewCount: numericCount(row?.reviewCount),
      sourceUrl: text(row?.sourceUrl, 500),
    }))
    .filter((row) => row.average != null && row.reviewCount != null && row.sourceUrl)
    .filter((row) => !isGoogleOrYelpUrl(row.sourceUrl))
    .slice(0, 3);
  const themes = parsed.reviewThemes && typeof parsed.reviewThemes === 'object' ? parsed.reviewThemes : {};
  const praise = (Array.isArray(themes.praise) ? themes.praise : []).map((row) => text(row, 500)).filter(Boolean);
  const complaints = (Array.isArray(themes.complaints) ? themes.complaints : []).map((row) => text(row, 500)).filter(Boolean);
  return {
    google,
    yelp,
    otherSites,
    reviewThemes: { praise, complaints },
    websiteFlavour: text(parsed.websiteFlavour, 1200),
  };
}

export function formatOtherRatingsLine(sites = []) {
  return sites
    .slice(0, 3)
    .map((row) => {
      const rating = numericRating(row.average);
      const count = numericCount(row.reviewCount);
      if (rating == null) return '';
      return count != null ? `${rating} (${count.toLocaleString('en-US')})` : String(rating);
    })
    .filter(Boolean)
    .join(' · ');
}

function primaryRatingCount(parsed = {}) {
  if (parsed.google?.reviewCount != null) return parsed.google.reviewCount;
  if (parsed.yelp?.reviewCount != null) return parsed.yelp.reviewCount;
  const firstOther = parsed.otherSites?.[0];
  if (firstOther?.reviewCount != null) return firstOther.reviewCount;
  return null;
}

function primaryAverage(parsed = {}) {
  if (parsed.google?.average != null) return parsed.google.average;
  if (parsed.yelp?.average != null) return parsed.yelp.average;
  if (parsed.otherSites?.[0]?.average != null) return parsed.otherSites[0].average;
  return null;
}

export function applyXaiPlaceRatingsToRecord(record = {}, parsed = {}) {
  if (parsed.google?.average != null) {
    record.googleRating = String(parsed.google.average);
    record.googleReviewCount = String(parsed.google.reviewCount);
    if (parsed.google.sourceUrl) record.googleRatingSourceUrl = parsed.google.sourceUrl;
  }
  if (parsed.yelp?.average != null) {
    record.yelpRating = String(parsed.yelp.average);
    record.yelpReviewCount = String(parsed.yelp.reviewCount);
    if (parsed.yelp.sourceUrl) record.yelpRatingSourceUrl = parsed.yelp.sourceUrl;
  }
  if (Array.isArray(parsed.otherSites) && parsed.otherSites.length) {
    record.otherRatingSites = parsed.otherSites.map((row) => ({
      rating: String(row.average),
      reviewCount: String(row.reviewCount),
      sourceUrl: row.sourceUrl,
    }));
    const line = formatOtherRatingsLine(parsed.otherSites);
    if (line) {
      record.thirdPartyRating = line;
      const counts = parsed.otherSites.map((row) => numericCount(row.reviewCount)).filter((value) => value != null);
      if (counts.length) record.thirdPartyReviewCount = String(Math.max(...counts));
    }
  }
  const count = primaryRatingCount(parsed);
  if (count != null) record.ratingCount = count;
  const average = primaryAverage(parsed);
  if (average != null && !record.googleRating && !record.yelpRating && !record.thirdPartyRating) {
    record.thirdPartyRating = String(average);
  }
  if (parsed.reviewThemes) record.reviewThemes = parsed.reviewThemes;
  if (parsed.websiteFlavour) record.websiteFlavour = parsed.websiteFlavour;
  delete record.ratingMix;
}

function distinctThemes(parsed = {}) {
  const praise = Array.isArray(parsed.reviewThemes?.praise) ? parsed.reviewThemes.praise : [];
  const complaints = Array.isArray(parsed.reviewThemes?.complaints) ? parsed.reviewThemes.complaints : [];
  const seen = new Set();
  const rows = [];
  for (const theme of [...praise, ...complaints]) {
    const key = text(theme, 500).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(text(theme, 500));
  }
  return rows;
}

function reviewStarsForAverage(average, slot) {
  const avg = numericRating(average);
  if (avg == null) return '4';
  const rounded = [Math.ceil(avg), Math.floor(avg), Math.round(avg), Math.min(5, Math.round(avg + 0.2))];
  const star = rounded[(slot - 1) % rounded.length] ?? Math.round(avg);
  return String(Math.min(5, Math.max(1, star)));
}

function buildReviewBody(theme, flavour) {
  const themeText = text(theme, 1500);
  const flavourText = text(flavour, 800);
  if (themeText && flavourText) return text(`${themeText}. ${flavourText}`, 2000);
  return text(themeText || flavourText, 2000);
}

export function writeRepresentativeReviews(record = {}, parsed = {}, { title = '' } = {}) {
  const themes = distinctThemes(parsed);
  if (themes.length < 4) return;
  const average = primaryAverage(parsed);
  const flavour = text(parsed.websiteFlavour, 800);
  for (let index = 1; index <= 4; index += 1) {
    const theme = themes[index - 1];
    record[`review${index}`] = buildReviewBody(theme, flavour);
    record[`review${index}Rating`] = reviewStarsForAverage(average, index);
    delete record[`review${index}Source`];
    delete record[`review${index}Url`];
  }
}

export function searchProductCategoryFromPlace(place = {}) {
  const cat = text(place.category, 80).toLowerCase();
  if (cat === 'lodging' || cat === 'accommodation') return 'hotel';
  if (cat === 'grocery' || cat === 'market' || cat === 'shopping' || cat === 'shop') return 'store';
  if (['activity', 'attraction', 'tour', 'music', 'theatre', 'bar'].includes(cat)) return 'event';
  return cat;
}

export function xaiThemesReviewPath(record = {}) {
  return record?.xaiRatingsFetched === true
    && record?.reviewThemes
    && typeof record.reviewThemes === 'object';
}

export function reviewThemesDistinctCount(record = {}) {
  const themes = record.reviewThemes && typeof record.reviewThemes === 'object' ? record.reviewThemes : {};
  const praise = Array.isArray(themes.praise) ? themes.praise : [];
  const complaints = Array.isArray(themes.complaints) ? themes.complaints : [];
  const seen = new Set();
  for (const row of [...praise, ...complaints]) {
    const key = text(row, 500).toLowerCase();
    if (key) seen.add(key);
  }
  return seen.size;
}
