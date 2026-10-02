const WEEKDAY_INDEX = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function weekdayDates(label, tripDates) {
  const found = [];
  const re = /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/gi;
  for (const match of String(label || '').matchAll(re)) {
    const target = WEEKDAY_INDEX[String(match[1] || '').toLowerCase()];
    if (target === undefined) continue;
    for (const date of tripDates) {
      if (new Date(`${date}T12:00:00.000Z`).getUTCDay() === target) found.push(date);
    }
  }
  return [...new Set(found)];
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
  const soleWeekday = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)$/i.exec(whenText.trim())?.[1]?.toLowerCase() || '';
  let weekdays = weekdayDates(whenText, tripDates);
  let weekdayAmbiguous = false;
  let candidateDates = [];
  if (soleWeekday) {
    candidateDates = tripDatesForWeekday(soleWeekday, tripDates);
    weekdayAmbiguous = candidateDates.length > 1;
    weekdays = candidateDates.length === 1 ? candidateDates : [];
  }
  const dates = [...new Set([...named, ...weekdays])].filter((date) => tripDates.includes(date));
  return { dates, weekdayAmbiguous, candidateDates: weekdayAmbiguous ? candidateDates : [] };
}
