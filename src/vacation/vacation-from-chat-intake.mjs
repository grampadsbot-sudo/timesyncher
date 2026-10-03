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
import { isPlaceholderTripRecord } from './owner-shell-trip.mjs';
import { attachSessionCollaboratorInvitesToTrip, loadCollaboratorInviteForEmail } from './collaborators.mjs';
import { queueOrSendCollaboratorInviteEmail } from './email.mjs';
import { publicTripUrl } from './web-access.mjs';

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
  const classifyStarted = Date.now();
  const { classification, jobFields } = await classifyVacationChatIntake(requestText, env);
  const classifierMs = Date.now() - classifyStarted;
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
    if (isPlaceholderTripRecord(selected) && intakeTripReadyForCreation(jobFields)) {
      const tripTitle = cleanText(jobFields.title, 180);
      const tripDestination = cleanText(jobFields.destination, 180);
      await db`
        update trips
        set title = ${tripTitle},
          destination = ${tripDestination || null},
          start_date = coalesce(start_date, ${cleanText(jobFields.startDate, 40) || null}::date),
          end_date = coalesce(end_date, ${cleanText(jobFields.endDate, 40) || null}::date),
          status = case when status = 'onboarding' then 'planning' else status end,
          metadata = coalesce(metadata, '{}'::jsonb) || ${{ placeholderTrip: false, upgradedFromShell: true, source: 'vacation_app_chat' }},
          updated_at = now()
        where id = ${session.trip_id}
      `;
      const upgraded = await loadTrips(db, session);
      const upgradedSelected = upgraded.find((trip) => trip.id === session.trip_id) || upgraded[0] || null;
      return {
        ok: true,
        action: 'upgraded',
        vacations: upgraded,
        selected: upgradedSelected,
        tripId: session.trip_id,
        jobFields,
        classification,
        classifierMs,
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
    return { ok: true, action: 'queue_without_trip', jobFields, classification, classifierMs };
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
  const tripCreateStarted = Date.now();
  const tripId = await ensureTrip(db, session.customer_id, {
    trip_title: cleanText(jobFields.title, 180),
    destination: cleanText(jobFields.destination, 180),
    start_date: cleanText(jobFields.startDate, 40) || null,
    end_date: cleanText(jobFields.endDate, 40) || null,
    source: 'vacation_app_chat',
    onboarding_session_id: session.id,
  });
  const tripCreateMs = Date.now() - tripCreateStarted;
  const entitlementStarted = Date.now();
  const attached = await attachPurchasedEntitlementToChatTrip(db, session, tripId);
  const entitlementMs = Date.now() - entitlementStarted;
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
  const attachedInvites = await attachSessionCollaboratorInvitesToTrip(db, {
    ownerCustomerId: session.customer_id,
    tripId,
    onboardingSessionId: session.id,
  });
  if (attachedInvites.length) {
    const { ensureCollaboratorWelcomeAfterTripBind } = await import('./collaborator-welcome.mjs');
    const { ensureOnboardingOpener } = await import('../../routes/vacation-itinerary.mjs');
    for (const invite of attachedInvites) {
      await ensureCollaboratorWelcomeAfterTripBind(db, invite, ensureOnboardingOpener, env);
    }
  }
  const vacationsAfterAttach = await loadTrips(db, session);
  const tripForInvites = vacationsAfterAttach.find((trip) => trip.id === tripId) || null;
  let tripPublicUrl = '';
  if (tripForInvites) {
    try {
      tripPublicUrl = publicTripUrl(tripForInvites, env);
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'collaborator_invite_trip_public_url_skipped',
        tripId: String(tripId || ''),
        message: String(error?.message || error || ''),
      }));
    }
  }
  for (const invite of attachedInvites) {
    const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
    const email = String(metadata.email || '').trim().toLowerCase();
    const displayName = String(metadata.displayName || invite.requested_for || '').trim();
    if (!email) continue;
    try {
      const inviteForEmail = await loadCollaboratorInviteForEmail(db, invite.id);
      if (!inviteForEmail) continue;
      const emailResult = await queueOrSendCollaboratorInviteEmail(db, {
        invite: inviteForEmail,
        contact: { email, displayName },
        publicUrl: tripPublicUrl,
      }, env);
      if (emailResult.status === 'already_sent') {
        console.log(JSON.stringify({
          event: 'collaborator_invite_email_skipped',
          reason: 'already_sent',
          inviteId: String(invite.id || ''),
          tripId: String(tripId || ''),
        }));
      }
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'collaborator_invite_trip_attach_email_skipped',
        tripId: String(tripId || ''),
        inviteId: String(invite.id || ''),
        message: String(error?.message || error || ''),
      }));
    }
  }
  const vacations = vacationsAfterAttach;
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
    classifierMs,
    tripCreateTimings: { classifierMs, tripCreateMs, entitlementMs },
  };
}
