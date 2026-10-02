import { openCollaboratorAppSeats, seatFromSession } from './collaborator-app-seat.mjs';

function clean(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function collaboratorInviteRequested(requestText = '') {
  const text = String(requestText || '');
  if (!text.trim()) return false;
  if (/\bas a collaborator\b/i.test(text)) return true;
  if (/\b(?:add|invite)\b/i.test(text) && /\bcollaborator\b/i.test(text)) return true;
  if (/\b(?:add|invite)\b/i.test(text) && /\b(?:wife|husband|spouse|partner)\b/i.test(text)) return true;
  return false;
}

function inviteContactsFromTurn(requestText = '', roster = []) {
  const emails = [...String(requestText).matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => clean(match[0], 180).toLowerCase())
    .filter(Boolean);
  const names = (Array.isArray(roster) ? roster : [])
    .map((row) => clean(row?.name || row?.displayName, 180))
    .filter(Boolean);
  const seats = [];
  if (emails.length && names.length) {
    const count = Math.min(emails.length, names.length);
    for (let index = 0; index < count; index += 1) {
      seats.push({ name: names[index], email: emails[index] });
    }
    return seats;
  }
  if (emails.length === 1) {
    const name = names[0] || clean(emails[0].split('@')[0], 180);
    if (name) seats.push({ name, email: emails[0] });
  }
  return seats;
}

export async function runVacationAppTurnActions({
  db,
  session,
  tripId,
  requestText,
  roster = [],
} = {}) {
  const results = {};
  if (!db || !tripId || !session?.customer_id) return results;
  if (seatFromSession(session)) return results;
  if (!collaboratorInviteRequested(requestText)) return results;
  const seats = inviteContactsFromTurn(requestText, roster);
  if (!seats.length) {
    results.collaboratorInvite = { ok: false, reason: 'missing_name_or_email' };
    return results;
  }
  try {
    const opened = await openCollaboratorAppSeats(db, {
      ownerCustomerId: session.customer_id,
      tripId,
      seats,
    });
    const sent = opened.some((row) => String(row?.emailStatus || '').toLowerCase() === 'sent' || row?.inviteId);
    results.collaboratorInvite = {
      ok: sent,
      action: sent ? 'collaborator_invite_sent' : 'collaborator_invite_failed',
      invites: opened,
    };
  } catch (error) {
    results.collaboratorInvite = {
      ok: false,
      reason: String(error?.message || error || 'collaborator_invite_failed'),
    };
  }
  return results;
}
