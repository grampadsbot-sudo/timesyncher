const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

export function tripIsoDay(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const localMidnight = value.getHours() === 0 && value.getMinutes() === 0
      && value.getSeconds() === 0 && value.getMilliseconds() === 0;
    const year = localMidnight ? value.getFullYear() : value.getUTCFullYear();
    const month = (localMidnight ? value.getMonth() : value.getUTCMonth()) + 1;
    const day = localMidnight ? value.getDate() : value.getUTCDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function tripDateWindow(tripRow = {}) {
  const start = tripIsoDay(tripRow.start_date ?? tripRow.startDate ?? tripRow.start);
  const end = tripIsoDay(tripRow.end_date ?? tripRow.endDate ?? tripRow.end) || start;
  const year = start ? Number(start.slice(0, 4)) : null;
  const tripDates = [];
  if (start) {
    const last = end && end >= start ? end : start;
    for (let cursor = start; cursor <= last && tripDates.length < 21; cursor = addIsoDay(cursor)) tripDates.push(cursor);
  }
  return { start, end, year, tripDates };
}

function addIsoDay(iso) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function weekdayMentions(label) {
  const keys = new Set();
  const re = /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi;
  for (const match of String(label || '').matchAll(re)) {
    const key = String(match[1] || '').toLowerCase();
    if (key) keys.add(key);
  }
  return [...keys];
}

function tripDatesForWeekday(weekdayKey, tripDates) {
  const target = WEEKDAY_INDEX[weekdayKey];
  if (target === undefined) return [];
  return tripDates.filter((date) => new Date(`${date}T12:00:00.000Z`).getUTCDay() === target);
}

export function assignDatesScheduling(thing, year, tripDates, namedDates) {
  const whenText = [thing.customerWhen, thing.whenLabel].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
  if (!whenText) return { dates: [], weekdayAmbiguous: false, candidateDates: [] };
  const named = [...namedDates(thing.customerWhen, year), ...namedDates(thing.whenLabel, year)];
  const mentions = weekdayMentions(whenText);
  let weekdayAmbiguous = false;
  let candidateDates = [];
  let weekdays = [];
  for (const weekdayKey of mentions) {
    const candidates = tripDatesForWeekday(weekdayKey, tripDates);
    if (candidates.length > 1) {
      weekdayAmbiguous = true;
      candidateDates = [...new Set([...candidateDates, ...candidates])].sort();
    } else if (candidates.length === 1) {
      weekdays.push(candidates[0]);
    }
  }
  if (weekdayAmbiguous) weekdays = [];
  else weekdays = [...new Set(weekdays)];
  const dates = [...new Set([...named, ...weekdays])].filter((date) => tripDates.includes(date));
  return {
    dates,
    weekdayAmbiguous,
    candidateDates: weekdayAmbiguous ? candidateDates : [],
  };
}
