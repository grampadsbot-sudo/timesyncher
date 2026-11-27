import { cleanText } from './http.mjs';
import { openCollaboratorAppSeats, seatFromSession } from './collaborator-app-seat.mjs';
import { tripThingNameInText } from './trip-thing-name-shape.mjs';

export function collaboratorInviteFromClassification(classification, customerText) {
  const request = classification?.understanding?.sendCollaboratorInvite;
  const span = request?.explicitSendRequestSpan;
  if (classification?.ok !== true || typeof customerText !== 'string' || typeof span !== 'string'
    || !span.trim() || !customerText.includes(span)) return null;
  const name = cleanText(request.name, 180);
  const email = cleanText(request.email, 180).toLowerCase();
  const addresses = span.toLowerCase().split(/[\s<>,();]+/).map((part) => part.replace(/[.!?]+$/, ''));
  if ((name && !tripThingNameInText(name, span)) || (email && !addresses.includes(email))) return null;
  return { name, email };
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
    code: seat?.seatStatus === 'active' ? 'collaborator_seat_activated' : 'collaborator_invite_sent',
    inviteeEmail,
    inviteeName,
    tripId: scope.tripId || seat?.tripId || null,
    inviteId: seat?.inviteId || null,
    emailStatus: seat?.emailStatus || null,
    seatStatus: seat?.seatStatus || null,
    seats,
  };
}
