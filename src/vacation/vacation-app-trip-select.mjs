import { seatFromSession } from './collaborator-app-seat.mjs';

export function pickVacationAppTrip(vacations, session, requestedTripId = '') {
  const seat = seatFromSession(session);
  const ownerTripId = seat?.ownerTripId || null;
  return vacations.find((trip) => trip.id === requestedTripId)
    || vacations.find((trip) => trip.id === session.trip_id)
    || (ownerTripId ? vacations.find((trip) => trip.id === ownerTripId) : null)
    || vacations[0]
    || null;
}
