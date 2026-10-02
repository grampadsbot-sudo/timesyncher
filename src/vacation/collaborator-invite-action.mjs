import { cleanText } from './http.mjs';
import { openCollaboratorAppSeats, seatFromSession } from './collaborator-app-seat.mjs';

export function collaboratorInviteFromClassification(classification) {
  if (!classification || typeof classification !== 'object') return null;
  const inviteeEmail = cleanText(classification.inviteeEmail, 180).toLowerCase();
  if (!inviteeEmail || !inviteeEmail.includes('@')) return null;
  return {
    name: cleanText(classification.inviteeName, 180),
    email: inviteeEmail,
  };
}

export function shouldRunCollaboratorInviteFromChat(classification = null) {
  return Boolean(collaboratorInviteFromClassification(classification));
}

function resolveInviteScope(session, trip) {
  if (seatFromSession(session)) {
    throw Object.assign(new Error('A collaborator seat cannot send invites.'), { statusCode: 403 });
  }
  const tripId = cleanText(trip?.id, 80) || cleanText(session?.trip_id, 80) || '';
  if (tripId) return { tripId, onboardingSessionId: '' };
  if (!session?.id) {
    throw Object.assign(new Error('Owner session is missing a purchase workspace.'), { statusCode: 409 });
  }
  return { tripId: '', onboardingSessionId: String(session.id) };
}

export async function runCollaboratorInviteAction(db, {
  session,
  tripId = '',
  name = '',
  email = '',
  env = process.env,
} = {}) {
  const explicitTripId = cleanText(tripId, 80);
  const scope = explicitTripId
    ? { tripId: explicitTripId, onboardingSessionId: '' }
    : resolveInviteScope(session, null);
  const inviteeEmail = cleanText(email, 180).toLowerCase();
  const inviteeName = cleanText(name, 180);
  if (!inviteeName || !inviteeEmail || !inviteeEmail.includes('@')) {
    throw Object.assign(new Error('Name and email are required for each invite.'), { statusCode: 400, code: 'collaborator_invite_invalid' });
  }
  const seats = await openCollaboratorAppSeats(db, {
    ownerCustomerId: session.customer_id,
    tripId: scope.tripId,
    onboardingSessionId: scope.onboardingSessionId,
    seats: [{ name: inviteeName, email: inviteeEmail }],
    env,
  });
  const seat = seats[0];
  return {
    ok: true,
    code: 'collaborator_invite_sent',
    inviteeEmail,
    inviteeName,
    tripId: scope.tripId || null,
    inviteId: seat?.inviteId || null,
    emailStatus: seat?.emailStatus || null,
    seats,
  };
}
