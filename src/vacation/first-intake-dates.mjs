const MONTH_BY_NAME = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9], ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11], ['dec', 12], ['december', 12],
]);

function daysInMonth(year, month) {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] || 0;
}

function monthFromName(token) {
  const key = String(token || '').toLowerCase().replace(/\./g, '').trim();
  return MONTH_BY_NAME.get(key) || MONTH_BY_NAME.get(key.slice(0, 3)) || 0;
}

function isoFromParts(year, month, day) {
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function intakeDatesFromCustomerSaid(said) {
  const text = String(said || '');
  const range = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(\d{1,2})(?:,?\s*(20\d{2}))?\b/);
  if (!range) return { start: '', end: '' };
  const month = monthFromName(range[1]);
  const year = Number(range[4] || (text.match(/\b(20\d{2})\b/) || [])[1]);
  if (!month || !Number.isFinite(year)) return { start: '', end: '' };
  const start = isoFromParts(year, month, Number(range[2]));
  const end = isoFromParts(year, month, Number(range[3]));
  if (!start || !end) return { start: '', end: '' };
  return { start, end };
}
