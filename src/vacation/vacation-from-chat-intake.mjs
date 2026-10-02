import { cleanText } from './http.mjs';
import { ensureTrip } from './onboarding.mjs';
import { firstMarkedIntake } from './live-app-turn.mjs';
import { classifyVacationAppCustomerTurn } from './chat-place-search.mjs';
import { classifyTripIntake, tripIntakeJobFields } from './trip-intake-classify.mjs';
import { seatFromSession } from './collaborator-app-seat.mjs';

export async function createVacationFromChatMessage(db, session, body, loadTrips, env = process.env) {
  if (seatFromSession(session)) {
    return { ok: false, statusCode: 409, error: 'No vacation is available for this session yet.' };
  }
  const requestText = cleanText(body.text || body.message, 12000);
  if (!requestText) {
    return { ok: false, statusCode: 409, error: 'No vacation is available for this session yet.' };
  }
  const { classification } = await classifyVacationAppCustomerTurn(requestText, env, classifyTripIntake);
  const jobFields = tripIntakeJobFields({
    requestText,
    receivedAt: new Date().toISOString(),
    classification,
    firstIntake: firstMarkedIntake({
      text: requestText,
      intake: classification.ok === true && classification.intake === true,
    }, []),
    jobKind: 'trip_intake',
  });
  const tripTitle = cleanText(jobFields.title, 180);
  if (!tripTitle) {
    return { ok: false, statusCode: 409, error: 'No vacation is available for this session yet.' };
  }
  const tripId = await ensureTrip(db, session.customer_id, {
    trip_title: tripTitle,
    source: 'vacation_app_chat',
    onboarding_session_id: session.id,
  });
  await db`
    update onboarding_sessions
    set trip_id = ${tripId}, updated_at = now()
    where id = ${session.id}
  `;
  session.trip_id = tripId;
  const vacations = await loadTrips(db, session);
  const selected = vacations.find((trip) => trip.id === tripId) || vacations[0] || null;
  if (!selected) {
    return { ok: false, statusCode: 500, error: 'Unable to load the new vacation.' };
  }
  return { ok: true, vacations, selected, tripId };
}
