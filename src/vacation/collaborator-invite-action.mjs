import { cleanText } from './http.mjs';
import { openCollaboratorAppSeats, seatFromSession } from './collaborator-app-seat.mjs';
import { isCollaboratorInviteRequest } from './collaborators.mjs';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseCollaboratorInviteTurn(text = '') {
  const source = String(text || '');
  if (!EMAIL_RE.test(source)) return null;
  const email = (source.match(EMAIL_RE) || [])[0]?.toLowerCase() || '';
  if (!email) return null;
  const nameMatch = source.match(/\b(?:add|invite)\s+(?:my\s+)?([A-Za-z][A-Za-z'.-]{0,40})(?:\s*,|\s+at\s+|\s+—|\s+-|\s+email|\s+\(|$)/i);
  const name = cleanText(nameMatch?.[1], 180) || cleanText(email.split('@')[0], 180);
  if (!name) return null;
  return { name, email };
}

export function shouldRunCollaboratorInviteFromChat(text = '') {
  const parsed = parseCollaboratorInviteTurn(text);
  if (!parsed) return false;
  return isCollaboratorInviteRequest(text) || /\b(add|invite)\b/i.test(text);
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

export async function maybeRunCollaboratorInviteFromChat(db, session, trip, text, env = process.env) {
  if (!shouldRunCollaboratorInviteFromChat(text)) return null;
  const parsed = parseCollaboratorInviteTurn(text);
  if (!parsed) return null;
  const scope = resolveInviteScope(session, trip);
  try {
    return await runCollaboratorInviteAction(db, {
      session,
      tripId: scope.tripId,
      name: parsed.name,
      email: parsed.email,
      env,
    });
  } catch (error) {
    return {
      ok: false,
      code: error.code || 'collaborator_invite_failed',
      inviteeEmail: parsed.email,
      inviteeName: parsed.name,
      error: error.message || 'Collaborator invite failed.',
      statusCode: error.statusCode || 502,
    };
  }
}
