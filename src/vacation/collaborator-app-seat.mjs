import crypto from 'node:crypto';
import { createCollaboratorInvite } from './collaborators.mjs';
import { ensureVacationEulaSession, telegramLink, upsertCustomer, vacationAppLink } from './onboarding.mjs';

function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function sessionToken() {
  return crypto.randomBytes(18).toString('base64url');
}

export function seatFromSession(session) {
  const metadata = session?.metadata && typeof session.metadata === 'object' ? session.metadata : {};
  const seat = metadata.seat;
  if (!seat || typeof seat !== 'object') return null;
  if (!seat.ownerCustomerId || !seat.ownerTripId) return null;
  return seat;
}

export function transcriptCustomerId(session) {
  return seatFromSession(session)?.ownerCustomerId || session?.customer_id || null;
}

export async function openCollaboratorAppSeats(db, { ownerCustomerId, tripId, seats } = {}) {
  if (!ownerCustomerId || !tripId) {
    throw Object.assign(new Error('Owner session is missing a vacation.'), { statusCode: 409 });
  }
  const opened = [];
  for (const raw of Array.isArray(seats) ? seats : []) {
    const name = clean(raw.name || raw.displayName, 180);
    const email = clean(raw.email, 180).toLowerCase();
    const payer = clean(raw.payer || 'owner', 40) || 'owner';
    if (!name || !email) continue;
    const { invite, token } = await createCollaboratorInvite(db, {
      ownerCustomerId,
      tripId,
      planCode: 'telegram_collaborators_single_trip',
      requestedFor: name,
      metadata: { payer, email, displayName: name, channel: 'vacation-app' },
    });
    opened.push({
      name,
      email,
      payer,
      inviteId: invite.id,
      inviteToken: token,
    });
  }
  if (!opened.length) throw Object.assign(new Error('Name and email are required for each seat.'), { statusCode: 400 });
  return opened;
}

export async function recordDialogParty(db, tripId, party) {
  if (!tripId || !party || typeof party !== 'object') {
    throw Object.assign(new Error('A party roster is required.'), { statusCode: 400 });
  }
  await db`
    update trips
    set metadata = coalesce(metadata, '{}'::jsonb) || ${{ dialogParty: party }},
      updated_at = now()
    where id = ${tripId}
  `;
  return party;
}

export async function joinCollaboratorAppSession(db, { invite, contact, env = process.env } = {}) {
  if (!invite?.owner_customer_id || !invite?.trip_id) {
    throw Object.assign(new Error('Collaborator invite is not attached to a vacation.'), { statusCode: 409 });
  }
  const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const displayName = clean(contact?.displayName || metadata.displayName || invite.requested_for, 180);
  const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
  const person = {
    email: clean(contact?.email || metadata.email, 180).toLowerCase() || null,
    phone: null,
    firstName: clean(contact?.firstName || firstName, 80) || null,
    lastName: clean(contact?.lastName || rest.join(' '), 80) || null,
    displayName,
  };
  const customerId = await upsertCustomer(db, person, { source: 'collaborator_app_seat', inviteId: invite.id });
  const token = sessionToken();
  const seat = {
    role: 'collaborator',
    payer: clean(metadata.payer || 'owner', 40) || 'owner',
    displayName,
    ownerCustomerId: invite.owner_customer_id,
    ownerTripId: invite.trip_id,
    inviteId: invite.id,
  };
  const rows = await db`
    insert into onboarding_sessions (
      customer_id, trip_id, token, status, current_step, telegram_deep_link, metadata, updated_at
    )
    values (
      ${customerId}, ${invite.trip_id}, ${token}, 'purchase_confirmed',
      'post_purchase', ${telegramLink(token, env)}, ${{ seat, source: 'collaborator_app_seat' }}, now()
    )
    returning *
  `;
  const session = rows[0];
  await ensureVacationEulaSession(session, { contact: person, env });
  await db`
    insert into vacation_collaborators (
      invite_id, owner_customer_id, trip_id, display_name, plan_code, scope, status,
      metadata, accepted_at, updated_at
    )
    values (
      ${invite.id}, ${invite.owner_customer_id}, ${invite.trip_id}, ${displayName},
      ${invite.plan_code}, ${invite.scope}, 'active',
      ${{ payer: seat.payer, email: person.email, channel: 'vacation-app', onboardingToken: token }},
      now(), now()
    )
  `;
  return {
    token: session.token,
    vacationAppUrl: vacationAppLink(session.token, env),
    displayName,
    payer: seat.payer,
  };
}
