import { cleanText } from './http.mjs';

export function isPlaceholderTripRecord(trip = {}) {
  const destination = cleanText(trip.destination, 180);
  const title = cleanText(trip.title, 180);
  const start = trip.start_date || trip.startDate;
  const end = trip.end_date || trip.endDate;
  const displayTitle = /^(shell|intake)-[a-z0-9]+$/i.test(title) ? '' : title;
  const displayDestination = /^(shell|intake)-[a-z0-9]+$/i.test(destination) ? '' : destination;
  if (displayDestination || start || end) return false;
  if (displayTitle) return false;
  return true;
}
