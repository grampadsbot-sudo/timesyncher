import { cleanText } from './http.mjs';
import { isPlaceholderTripRecord } from './owner-shell-trip.mjs';

export function intakeJobFieldsFromSavedTrip({
  ok = false,
  title = '',
  destination = '',
  savedTripTitle = '',
  savedTripDestination = '',
} = {}) {
  if (ok !== true) return { title, destination };
  let nextTitle = cleanText(title, 180);
  let nextDestination = cleanText(destination, 180);
  const savedTitle = cleanText(savedTripTitle, 180);
  const savedDestination = cleanText(savedTripDestination, 180);
  if (!nextTitle && savedTitle && !isPlaceholderTripRecord({ title: savedTitle })) {
    nextTitle = savedTitle;
  }
  if (!nextDestination && savedDestination && !isPlaceholderTripRecord({ title: savedDestination })) {
    nextDestination = savedDestination;
  }
  return { title: nextTitle, destination: nextDestination };
}
