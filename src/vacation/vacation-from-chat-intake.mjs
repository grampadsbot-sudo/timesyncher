import { cleanText } from './http.mjs';
import { ensureTrip } from './onboarding.mjs';
import { firstMarkedIntake } from './live-app-turn.mjs';
import { classifyVacationAppCustomerTurn } from './chat-place-search.mjs';
import { classifyTripIntake, tripIntakeJobFields } from './trip-intake-classify.mjs';
import { seatFromSession } from './collaborator-app-seat.mjs';
import {
  attachPurchasedEntitlementToChatTrip,
  preflightAttachOwnerEntitlementForChatTrip,
} from './chat-trip-entitlement-attach.mjs';

export function tripIntakeJobKind() {
  return ['trip', 'intake'].join('_');
}

export function intakeTripReadyForCreation(jobFields = {}) {
  const title = cleanText(jobFields.title, 180);
  const destination = cleanText(jobFields.destination, 180);
  const hasDates = jobFields.hasDates === true;
  return Boolean(title && destination && hasDates);
}

export async function classifyVacationChatIntake(requestText, env = process.env) {
  const { classification } = await classifyVacationAppCustomerTurn(requestText, env, (opts) => classifyTripIntake({
    ...opts,
    requireExtractedTripDates: true,
  }));
  const jobFields = tripIntakeJobFields({
    requestText,
    receivedAt: new Date().toISOString(),
    classification,
    firstIntake: firstMarkedIntake({
      text: requestText,
      intake: classification.ok === true && classification.intake === true,
    }, []),
    jobKind: tripIntakeJobKind(),
  });
  return { classification, jobFields };
}

export async function createVacationFromChatMessage(db, session, body, loadTrips, env = process.env) {
  if (seatFromSession(session)) {
    return {
      ok: false,
      statusCode: 409,
      error: 'No vacation is available for this session yet.',
      code: 'vacation_app_collaborator_seat_without_trip',
    };
  }
  const requestText = cleanText(body.text || body.message, 12000);
  if (!requestText) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Message text is required.',
      code: 'vacation_app_message_required',
    };
  }
  const { classification, jobFields } = await classifyVacationChatIntake(requestText, env);
  if (classification.ok !== true) {
    return {
      ok: false,
      statusCode: 502,
      error: jobFields.intakeError || 'trip intake classification failed',
      code: 'trip_intake_classification_failed',
    };
  }
  if (session.trip_id) {
    const vacations = await loadTrips(db, session);
    const selected = vacations.find((trip) => trip.id === session.trip_id) || vacations[0] || null;
    if (!selected) {
      return {
        ok: false,
        statusCode: 500,
        error: 'Unable to load the linked vacation.',
        code: 'vacation_app_trip_load_failed',
      };
    }
    return {
      ok: true,
      action: 'existing',
      vacations,
      selected,
      tripId: session.trip_id,
    };
  }
  if (!intakeTripReadyForCreation(jobFields)) {
    return { ok: true, action: 'queue_without_trip', jobFields, classification };
  }
  const preflight = await preflightAttachOwnerEntitlementForChatTrip(db, session);
  if (!preflight.ok) {
    return {
      ok: false,
      statusCode: preflight.statusCode || 502,
      error: preflight.error,
      code: preflight.code || 'vacation_app_owner_entitlement_missing',
    };
  }
  const tripId = await ensureTrip(db, session.customer_id, {
    trip_title: cleanText(jobFields.title, 180),
    destination: cleanText(jobFields.destination, 180),
    start_date: cleanText(jobFields.startDate, 40) || null,
    end_date: cleanText(jobFields.endDate, 40) || null,
    source: 'vacation_app_chat',
    onboarding_session_id: session.id,
  });
  const attached = await attachPurchasedEntitlementToChatTrip(db, session, tripId);
  if (!attached.ok) {
    await db`delete from trips where id = ${tripId}`;
    return {
      ok: false,
      statusCode: attached.statusCode || 502,
      error: attached.error,
      code: attached.code || 'vacation_app_owner_entitlement_attach_failed',
    };
  }
  await db`
    update onboarding_sessions
    set trip_id = ${tripId}, updated_at = now()
    where id = ${session.id}
      and trip_id is null
  `;
  session.trip_id = tripId;
  const vacations = await loadTrips(db, session);
  const selected = vacations.find((trip) => trip.id === tripId) || vacations[0] || null;
  if (!selected) {
    return {
      ok: false,
      statusCode: 500,
      error: 'Unable to load the new vacation.',
      code: 'vacation_app_trip_load_failed',
    };
  }
  return {
    ok: true,
    action: 'created',
    vacations,
    selected,
    tripId,
    jobFields,
    classification,
  };
}
