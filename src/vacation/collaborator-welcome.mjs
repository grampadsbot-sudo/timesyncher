import { seatFromSession, transcriptCustomerId } from './collaborator-app-seat.mjs';
import { collaboratorInviteIdFromEulaSession, isCollaboratorEulaSessionId } from './collaborators.mjs';
import { onboardingWelcomeFailure } from './welcome-failure.mjs';

function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function tripForWelcome(row) {
  if (!row) return null;
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    title: row.title || '',
    shareToken: metadata.sharedToken || metadata.shareToken || metadata.publicSlug || metadata.source_token || metadata.slug || '',
    publicUrl: metadata.publicUrl || metadata.public_url || metadata.webItineraryUrl || '',
  };
}

async function loadCollaboratorAppSessionForInvite(db, invite) {
  const metadata = invite?.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const token = clean(metadata.collaboratorOnboardingToken, 120);
  if (!token) return null;
  const rows = await db`
    select
      onboarding_sessions.id,
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      onboarding_sessions.status,
      onboarding_sessions.order_id,
      customers.display_name,
      customers.first_name,
      customers.last_name,
      customers.email,
      onboarding_sessions.metadata
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  return rows[0] || null;
}

export async function collaboratorWelcomeTurnExists(db, session, trip) {
  const seat = seatFromSession(session);
  if (!seat) return false;
  const customerId = transcriptCustomerId(session);
  if (!customerId) return false;
  const welcomeFor = String(session.customer_id || '');
  const tripId = trip?.id || seat.ownerTripId || null;
  const rows = tripId
    ? await db`
      select id
      from transcript_turns
      where customer_id = ${customerId}
        and trip_id = ${tripId}
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and payload->>'welcomeAudience' = 'collaborator'
      limit 1
    `
    : await db`
      select id
      from transcript_turns
      where customer_id = ${customerId}
        and trip_id is null
        and channel in ('vacation-app', 'vacation_app')
        and speaker = 'app'
        and direction = 'outbound'
        and payload->>'welcomeAudience' = 'collaborator'
      limit 1
    `;
  if (rows.length > 0) return true;
  if (session?.id && welcomeFor) {
    const claims = await db`
      select id
      from vacation_onboarding_welcomes
      where onboarding_session_id = ${session.id}
        and welcome_for = ${welcomeFor}
      limit 1
    `;
    if (claims.length) return false;
  }
  return false;
}

export async function ensureCollaboratorWelcomeAfterEulaAccept(db, sessionId, ensureOpener, env = process.env) {
  if (!isCollaboratorEulaSessionId(sessionId)) return { ok: true, skipped: true };
  const inviteId = collaboratorInviteIdFromEulaSession(sessionId);
  if (!inviteId) {
    throw onboardingWelcomeFailure('collaborator invite id missing from eula session', null);
  }
  const invites = await db`
    select id, trip_id, metadata
    from vacation_collaborator_invites
    where id = ${inviteId}
    limit 1
  `;
  const invite = invites[0];
  if (!invite) {
    throw onboardingWelcomeFailure('collaborator invite not found for welcome', null);
  }
  const session = await loadCollaboratorAppSessionForInvite(db, invite);
  if (!session?.id) {
    throw onboardingWelcomeFailure('collaborator app session missing after eula accept', invite.trip_id);
  }
  let trip = null;
  const tripId = clean(invite.trip_id, 80) || clean(seatFromSession(session)?.ownerTripId, 80) || null;
  if (tripId) {
    const trips = await db`
      select id, title, destination, start_date, end_date, status, metadata
      from trips
      where id = ${tripId}
      limit 1
    `;
    trip = tripForWelcome(trips[0]);
  }
  await ensureOpener(db, session, trip, env);
  const exists = await collaboratorWelcomeTurnExists(db, session, trip);
  if (!exists) {
    throw onboardingWelcomeFailure('collaborator onboarding welcome missing after accept', tripId);
  }
  return { ok: true, skipped: false, inviteId, tripId };
}
