function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function norm(value) {
  return text(value).toLowerCase();
}

const RATING_QUOTE_MARK = /\b(?:stars?|rated|rating|reviews?|out of|\/\s*5)\b/i;

export function ratingQuoteSupportsAggregate(quote = '', average, count) {
  const q = norm(quote);
  if (!q || q.length < 6 || !RATING_QUOTE_MARK.test(q)) return false;
  const avg = Number(average);
  const cnt = Number(count);
  if (!(avg > 0) || !(Number.isInteger(cnt) && cnt > 0)) return false;
  const avgEsc = String(avg).replace('.', '\\.');
  if (!new RegExp(`(^|[^\\d.])${avgEsc}([^\\d.]|$)`).test(q)) return false;
  const digits = String(cnt);
  const compact = q.replace(/,/g, '');
  if (!new RegExp(`(^|\\D)${digits}(\\D|$)`).test(compact)) return false;
  if (/\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/.test(q) && !/\breviews?\b/i.test(q)) return false;
  return true;
}

const RATING_PAGE_WINDOW = 80;

export function pageTextSupportsRating(pageText = '', average, count) {
  const raw = norm(pageText);
  if (!raw || !RATING_QUOTE_MARK.test(raw)) return false;
  const avg = Number(average);
  const cnt = Number(count);
  if (!(avg > 0) || !(Number.isInteger(cnt) && cnt > 0)) return false;
  const avgEsc = String(avg).replace('.', '\\.');
  const avgPart = Number.isInteger(avg) ? `${avgEsc}(?:\\.0+)?` : avgEsc;
  const digits = String(cnt);
  const avgRe = new RegExp(`(?:^|[^\\d.])(${avgPart})(?![\\d.])`, 'g');
  let match;
  while ((match = avgRe.exec(raw))) {
    const at = match.index + match[0].length - match[1].length;
    const slice = raw.slice(Math.max(0, at - RATING_PAGE_WINDOW), at + match[1].length + RATING_PAGE_WINDOW);
    if (!RATING_QUOTE_MARK.test(slice)) continue;
    if (new RegExp(`(?:^|\\D)${digits}(?:\\D|$)`).test(slice.replace(/,/g, ''))) return true;
  }
  return false;
}
