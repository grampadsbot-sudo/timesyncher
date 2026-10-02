const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

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
