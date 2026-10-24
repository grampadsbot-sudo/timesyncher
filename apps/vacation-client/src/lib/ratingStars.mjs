export function parseRatingNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw).replace(/,/g, '').trim();
  if (!text || !/\d/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(5, value);
}

function roundRatingToHalf(value) {
  return Math.round(value * 2) / 2;
}

export function ratingStarFillStates(value) {
  const rounded = roundRatingToHalf(value);
  const states = [];
  for (let index = 1; index <= 5; index += 1) {
    if (rounded >= index) states.push('full');
    else if (rounded >= index - 0.5) states.push('half');
    else states.push('empty');
  }
  return states;
}

export function ratingStarsAriaLabel(value) {
  const rounded = roundRatingToHalf(value);
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} out of 5 stars`;
}

export function primaryListRatingValue(override = {}) {
  const google = parseRatingNumber(override.googleRating);
  if (google != null) return google;
  const yelp = parseRatingNumber(override.yelpRating);
  if (yelp != null) return yelp;
  const third = parseRatingNumber(override.thirdPartyRating);
  if (third != null) return third;
  return parseRatingNumber(override.rating);
}
