import { intakeJobFieldsFromSavedTrip } from './trip-intake-job-saved-trip.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoDay(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function tripIntakeJobFields({
  requestText,
  receivedAt,
  classification,
  firstIntake,
  jobKind,
  savedTripTitle = '',
  savedTripDestination = '',
} = {}) {
  const ok = classification?.ok === true;
  const intake = ok && classification.intake === true;
  const wantedThings = ok ? classification.things : [];
  const roster = ok && Array.isArray(classification.roster) ? classification.roster : [];
  let destination = ok ? clean(classification.destination, 180) : '';
  let title = ok ? clean(classification.title, 180) : '';
  ({ title, destination } = intakeJobFieldsFromSavedTrip({
    ok,
    title,
    destination,
    savedTripTitle,
    savedTripDestination,
  }));
  const hasDates = ok && classification.hasDates === true;
  const startDate = ok ? isoDay(classification.startDate) : '';
  const endDate = ok ? isoDay(classification.endDate) : '';
  return {
    intakeEvent: intake ? {
      kind: jobKind,
      at: receivedAt || null,
      requestText: String(requestText || ''),
      firstIntake: firstIntake === true,
    } : null,
    wantedThings,
    roster,
    rosterError: ok ? null : clean(classification?.error || 'trip intake classification failed', 300),
    destination,
    hasDates,
    startDate,
    endDate,
    title,
    destinationError: ok ? (destination ? null : 'trip place was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    titleError: ok ? (title ? null : 'trip title was not in the extraction') : clean(classification?.error || 'trip intake classification failed', 300),
    intakeError: ok ? null : clean(classification?.error || 'trip intake classification failed', 300),
  };
}