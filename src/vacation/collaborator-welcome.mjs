import { ensureCollaboratorAppSeatForInvite } from './collaborator-eula-accept.mjs';
import { seatFromSession } from './collaborator-app-seat.mjs';
import { onboardingWelcomeTranscriptCustomerId, onboardingWelcomeTurnExists } from './onboarding-welcome-turn.mjs';
import { collaboratorInviteIdFromEulaSession, isCollaboratorEulaSessionId, loadCollaboratorInviteForEmail } from './collaborators.mjs';
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
  const customerId = onboardingWelcomeTranscriptCustomerId(session, seat);
  if (!customerId) return false;
  const tripId = trip?.id || session?.trip_id || seat.ownerTripId || null;
  return onboardingWelcomeTurnExists(db, { customerId, tripId, welcomeAudience: 'collaborator' });
}

export async function ensureCollaboratorWelcomeAfterTripBind(db, invite, ensureOpener, env = process.env) {
  if (!invite?.trip_id) return { ok: true, skipped: true };
  const metadata = invite?.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const token = clean(metadata.collaboratorOnboardingToken, 120);
  if (!token) return { ok: true, skipped: true };
  const session = await loadCollaboratorAppSessionForInvite(db, invite);
  if (!session?.id) return { ok: true, skipped: true };
  const trips = await db`
    select id, title, destination, start_date, end_date, status, metadata
    from trips
    where id = ${invite.trip_id}
    limit 1
  `;
  const trip = tripForWelcome(trips[0]);
  await ensureOpener(db, session, trip, env);
  const exists = await collaboratorWelcomeTurnExists(db, session, trip);
  if (!exists) {
    throw onboardingWelcomeFailure('collaborator onboarding welcome missing after trip bind', invite.trip_id);
  }
  return { ok: true, skipped: false, tripId: invite.trip_id };
}

export async function ensureCollaboratorWelcomeAfterEulaAccept(db, sessionId, ensureOpener, env = process.env) {
  if (!isCollaboratorEulaSessionId(sessionId)) return { ok: true, skipped: true };
  const inviteId = collaboratorInviteIdFromEulaSession(sessionId);
  if (!inviteId) {
    throw onboardingWelcomeFailure('collaborator invite id missing from eula session', null);
  }
  const invite = await loadCollaboratorInviteForEmail(db, inviteId);
  if (!invite) {
    throw onboardingWelcomeFailure('collaborator invite not found for welcome', null);
  }
  await ensureCollaboratorAppSeatForInvite(db, invite, env);
  const refreshedInvite = await loadCollaboratorInviteForEmail(db, inviteId);
  const session = await loadCollaboratorAppSessionForInvite(db, refreshedInvite);
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
