import { openCollaboratorAppSeats, seatFromSession } from './collaborator-app-seat.mjs';
import {
  parseCollaboratorInviteTurn,
  shouldRunCollaboratorInviteFromChat,
} from './collaborator-invite-action.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function inviteRow(ok, code, inviteeEmail) {
  return { ok: Boolean(ok), code: String(code || ''), inviteeEmail: inviteeEmail ? String(inviteeEmail).toLowerCase() : null };
}

function emailSendSucceeded(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'sent' || normalized === 'already_sent';
}

function mapInviteError(error, inviteeEmail) {
  const status = Number(error?.statusCode || 0);
  const message = String(error?.message || error || '').toLowerCase();
  if (status === 409 || /\balready\b/.test(message)) {
    return inviteRow(false, 'already_collaborator', inviteeEmail);
  }
  if (status === 400 && /email|name/.test(message)) {
    return inviteRow(false, 'invalid_email', inviteeEmail);
  }
  return inviteRow(false, 'send_failed', inviteeEmail);
}

export async function runVacationAppTurnActions({
  db,
  session,
  tripId,
  requestText,
  roster = [],
  env = process.env,
  openSeats = openCollaboratorAppSeats,
} = {}) {
  const results = {};
  if (!db || !session?.customer_id || seatFromSession(session)) return results;
  if (!shouldRunCollaboratorInviteFromChat(requestText)) return results;

  const parsed = parseCollaboratorInviteTurn(requestText);
  const inviteeEmail = parsed?.email ? String(parsed.email).toLowerCase() : null;
  if (!inviteeEmail) {
    results.invite = inviteRow(false, 'missing_email', null);
    return results;
  }
  if (!EMAIL_RE.test(inviteeEmail)) {
    results.invite = inviteRow(false, 'invalid_email', inviteeEmail);
    return results;
  }
  const inviteeName = parsed?.name || '';
  if (!inviteeName) {
    results.invite = inviteRow(false, 'missing_email', inviteeEmail);
    return results;
  }

  const resolvedTripId = String(tripId || '').trim();
  const onboardingSessionId = resolvedTripId ? '' : String(session.id || '').trim();
  if (!resolvedTripId && !onboardingSessionId) {
    results.invite = inviteRow(false, 'send_failed', inviteeEmail);
    return results;
  }

  try {
    const opened = await openSeats(db, {
      ownerCustomerId: session.customer_id,
      tripId: resolvedTripId,
      onboardingSessionId,
      seats: [{ name: inviteeName, email: inviteeEmail }],
      env,
    });
    const row = Array.isArray(opened) ? opened[0] : null;
    if (!row || !emailSendSucceeded(row.emailStatus)) {
      results.invite = inviteRow(false, 'send_failed', inviteeEmail);
      return results;
    }
    results.invite = inviteRow(true, 'collaborator_invite_sent', inviteeEmail);
  } catch (error) {
    results.invite = mapInviteError(error, inviteeEmail);
  }
  return results;
}
