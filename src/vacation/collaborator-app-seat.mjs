import crypto from 'node:crypto';
import { createCollaboratorInvite } from './collaborators.mjs';
import { queueOrSendCollaboratorInviteEmail } from './email.mjs';
import { publicTripUrl } from './web-access.mjs';
import { upsertCustomer, vacationAppLink } from './onboarding.mjs';

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
  if (!seat.ownerCustomerId) return null;
  if (!seat.ownerTripId && !seat.ownerOnboardingSessionId) return null;
  return seat;
}

export function isCollaboratorAppSeat(session) {
  return Boolean(seatFromSession(session));
}

export function transcriptCustomerId(session) {
  return seatFromSession(session)?.ownerCustomerId || session?.customer_id || null;
}

export function collaboratorSeatJoinEvent(seat) {
  if (!seat?.ownerCustomerId || (!seat?.ownerTripId && !seat?.ownerOnboardingSessionId)) {
    throw Object.assign(new Error('Only a collaborator seat records a join.'), { statusCode: 403 });
  }
  return {
    speaker: 'system',
    direction: 'system',
    channel: 'vacation-app',
    body: '',
    payload: {
      source: 'collaborator_seat_join',
      event: 'collaborator_seat_join',
      seat: {
        displayName: clean(seat.displayName, 180) || null,
        payer: clean(seat.payer, 40) || null,
        inviteId: clean(seat.inviteId, 80) || null,
        role: clean(seat.role, 40) || 'collaborator',
        ownerCustomerId: seat.ownerCustomerId,
        ownerTripId: seat.ownerTripId,
      },
    },
  };
}

export async function openCollaboratorAppSeats(db, { ownerCustomerId, tripId, onboardingSessionId = '', seats, env = process.env } = {}) {
  const resolvedTripId = clean(tripId, 80) || null;
  const sessionId = clean(onboardingSessionId, 80) || null;
  if (!ownerCustomerId || (!resolvedTripId && !sessionId)) {
    throw Object.assign(new Error('Owner session is missing a vacation workspace.'), { statusCode: 409 });
  }
  const opened = [];
  for (const raw of Array.isArray(seats) ? seats : []) {
    const name = clean(raw.name || raw.displayName, 180);
    const email = clean(raw.email, 180).toLowerCase();
    const payer = clean(raw.payer || 'owner', 40) || 'owner';
    if (!name || !email) continue;
    const { invite, token } = await createCollaboratorInvite(db, {
      ownerCustomerId,
      tripId: resolvedTripId,
      planCode: 'telegram_collaborators_single_trip',
      requestedFor: name,
      metadata: {
        payer,
        email,
        displayName: name,
        channel: 'vacation-app',
        onboardingSessionId: sessionId,
        deferredWebEditor: !resolvedTripId,
      },
      env,
    });
    let publicUrl = '';
    if (resolvedTripId) {
      const trips = await db`select title, metadata from trips where id = ${resolvedTripId} limit 1`;
      if (trips[0]) publicUrl = publicTripUrl(trips[0], env);
    }
    const sent = await queueOrSendCollaboratorInviteEmail(db, {
      invite,
      token,
      contact: { email, displayName: name, firstName: name.split(/\s+/)[0] || name },
      acceptUrl: '',
      publicUrl,
    }, env);
    opened.push({
      name,
      email,
      payer,
      inviteId: invite.id,
      inviteToken: token,
      emailStatus: sent.status,
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
  if (!invite?.owner_customer_id) {
    throw Object.assign(new Error('Collaborator invite is missing an owner.'), { statusCode: 409 });
  }
  const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {};
  const ownerOnboardingSessionId = clean(metadata.onboardingSessionId, 80) || null;
  const ownerTripId = clean(invite.trip_id, 80) || null;
  if (!ownerTripId && !ownerOnboardingSessionId) {
    throw Object.assign(new Error('Collaborator invite is not attached to a vacation workspace.'), { statusCode: 409 });
  }
  const existingToken = clean(metadata.collaboratorOnboardingToken, 120);
  if (existingToken) {
    const prior = await db`
      select token, metadata
      from onboarding_sessions
      where token = ${existingToken}
      limit 1
    `;
    if (prior[0]?.token) {
      const priorSeat = seatFromSession(prior[0]);
      return {
        token: prior[0].token,
        vacationAppUrl: vacationAppLink(prior[0].token, env),
        displayName: priorSeat?.displayName || clean(contact?.displayName, 180),
        payer: priorSeat?.payer || clean(metadata.payer || 'owner', 40) || 'owner',
      };
    }
  }
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
    ownerTripId: ownerTripId,
    ownerOnboardingSessionId,
    inviteId: invite.id,
  };
  const rows = await db`
    insert into onboarding_sessions (
      customer_id, trip_id, token, status, current_step, telegram_deep_link, metadata, updated_at
    )
    values (
      ${customerId}, ${ownerTripId}, ${token}, 'purchase_confirmed',
      'post_purchase', ${null}, ${{ seat, source: 'collaborator_app_seat' }}, now()
    )
    returning *
  `;
  const session = rows[0];
  await db`
    insert into vacation_collaborators (
      invite_id, owner_customer_id, trip_id, display_name, plan_code, scope, status,
      metadata, accepted_at, updated_at
    )
    values (
      ${invite.id}, ${invite.owner_customer_id}, ${ownerTripId}, ${displayName},
      ${invite.plan_code}, ${invite.scope}, 'active',
      ${{ payer: seat.payer, email: person.email, channel: 'vacation-app', onboardingToken: token, onboardingSessionId: ownerOnboardingSessionId }},
      now(), now()
    )
  `;
  await db`
    update vacation_collaborator_invites
    set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now(),
      metadata = metadata || ${{ collaboratorOnboardingToken: token, collaboratorCustomerId: customerId }}
    where id = ${invite.id}
  `;
  return {
    token: session.token,
    vacationAppUrl: vacationAppLink(session.token, env),
    displayName,
    payer: seat.payer,
  };
}

export function liveReplyCommerceGate({
  session,
  suppliedSeatDollars,
  customerTurn,
  intent,
  mergedTrip,
  upsellMode,
  asksPriceFn,
  payerLineFn,
}) {
  if (!isCollaboratorAppSeat(session)) {
    const seatDollars = Number(suppliedSeatDollars);
    const pricedSeat = Number.isFinite(seatDollars) && seatDollars > 0 ? seatDollars : null;
    const payerRows = (Array.isArray(mergedTrip.party?.collaborators) ? mergedTrip.party.collaborators : [])
      .map((person) => ({ name: String(person?.name || '').trim(), payer: String(person?.payer || '').trim() }))
      .filter((row) => row.name && row.payer);
    const extractedSeats = Array.isArray(intent?.seats) && intent.seats.some((seat) => seat?.name && seat?.payer)
      ? intent.seats
      : payerRows;
    const planLine = asksPriceFn(customerTurn, intent) && pricedSeat
      ? payerLineFn(customerTurn, pricedSeat, extractedSeats)
      : '';
    return {
      upsell: upsellMode,
      seatDollars,
      pricedSeat,
      payerRows,
      planLine,
      planTable: planLine ? { dollars_per_collaborator_seat: pricedSeat, payer_line: planLine } : null,
      purchasedPlan: String(mergedTrip.purchased_plan || mergedTrip.ownerPlan?.checkout_plan || '').trim(),
      planOwned: mergedTrip.planOwned === true,
      collaboratorSeat: false,
    };
  }
  return {
    upsell: 'forbidden',
    seatDollars: null,
    pricedSeat: null,
    payerRows: [],
    planLine: '',
    planTable: null,
    purchasedPlan: '',
    planOwned: false,
    collaboratorSeat: true,
  };
}
