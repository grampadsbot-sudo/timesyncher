import { assignDatesScheduling } from './intake-shared-trip.mjs';
import { tripDateWindow } from './intake-weekday-dates.mjs';

export function scheduleChatThing(thing = {}, tripRow = {}) {
  const meta = thing.metadata && typeof thing.metadata === 'object' && !Array.isArray(thing.metadata) ? thing.metadata : {};
  const whenLabel = String(thing.whenLabel || thing.when || meta.whenLabel || '').trim();
  const customerWhen = String(thing.customerWhen || meta.customerWhen || '').trim();
  const { year, tripDates } = tripDateWindow(tripRow);
  const scheduling = assignDatesScheduling({
    whenLabel,
    customerWhen,
    metadata: meta,
    starts_at: thing.starts_at || thing.startsAt || null,
  }, year, tripDates);
  if (scheduling.weekdayAmbiguous) {
    return {
      starts_at: null,
      askWhichDay: true,
      candidateDates: scheduling.candidateDates,
      whenLabel,
      customerWhen,
    };
  }
  if (scheduling.dates.length === 1) {
    return {
      starts_at: `${scheduling.dates[0]}T12:00:00.000Z`,
      askWhichDay: false,
      candidateDates: [],
      whenLabel,
      customerWhen,
    };
  }
  return {
    starts_at: null,
    askWhichDay: false,
    candidateDates: [],
    whenLabel,
    customerWhen,
  };
}
