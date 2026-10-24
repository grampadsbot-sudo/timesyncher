function text(value) {
  return String(value ?? '').trim();
}

export function parseStarRating(raw) {
  const value = text(raw, 40);
  if (!value || !/\d/.test(value)) return null;
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(5, parsed);
}

export function roundStarRatingToHalf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const clamped = Math.min(5, n);
  return Math.round(clamped * 2) / 2;
}

export function starRatingAccessibilityLabel(value) {
  const rounded = roundStarRatingToHalf(value);
  if (rounded == null) return '';
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} out of 5 stars`;
}

export function buildStarRatingStates(value) {
  const rounded = roundStarRatingToHalf(value);
  if (rounded == null) return null;
  const states = [];
  let remaining = rounded;
  for (let index = 0; index < 5; index += 1) {
    if (remaining >= 1) {
      states.push('full');
      remaining -= 1;
    } else if (remaining >= 0.5) {
      states.push('half');
      remaining -= 0.5;
    } else {
      states.push('empty');
    }
  }
  return states;
}

export function primaryPlaceStarRating(override = {}) {
  for (const key of ['googleRating', 'yelpRating', 'thirdPartyRating', 'rating']) {
    const parsed = parseStarRating(override[key]);
    if (parsed != null) return parsed;
  }
  return null;
}
