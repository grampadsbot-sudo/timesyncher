import crypto from 'node:crypto';

import { cleanText } from './http.mjs';
import { intakeShareSlug } from './intake-shared-trip.mjs';
import {
  createAcceptedWebAccessSession,
  readCookie,
  verifiedOwnerWebGrant,
  webAccessCookieHeader,
  webAccessCookieName,
  webAccessForSession,
} from './web-access.mjs';

function vacationAppOwnerWebAccessToken(onboardingToken, tripId, env = process.env) {
  const salt = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-web-access';
  return crypto.createHmac('sha256', salt).update(`vacation-app-owner:${cleanText(onboardingToken, 400)}:${cleanText(tripId, 80)}`).digest('base64url');
}

function vacationAppCollaboratorWebAccessToken(onboardingToken, tripId, env = process.env) {
  const salt = env.TIMESYNCHER_WEB_ACCESS_TOKEN_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation-web-access';
  return crypto.createHmac('sha256', salt).update(`vacation-app-collaborator:${cleanText(onboardingToken, 400)}:${cleanText(tripId, 80)}`).digest('base64url');
}

export async function vacationAppOwnerWebAccessCookie(db, req, { session, tripId, env = process.env }) {
  const ownerId = cleanText(session?.customer_id, 80);
  const normalizedTripId = cleanText(tripId, 80);
  const onboardingToken = cleanText(session?.token, 400);
  const email = cleanText(session?.email, 180).toLowerCase();
  if (!ownerId || !normalizedTripId || !onboardingToken || !email.includes('@')) return '';
  const existing = readCookie(req, webAccessCookieName());
  if (existing) {
    const grant = await webAccessForSession(db, { sessionToken: existing, tripId: normalizedTripId, env });
    if (grant && await verifiedOwnerWebGrant(db, grant, normalizedTripId)) return '';
  }
  const sessionToken = vacationAppOwnerWebAccessToken(onboardingToken, normalizedTripId, env);
  const slug = intakeShareSlug(normalizedTripId);
  try {
    await createAcceptedWebAccessSession(db, {
      ownerCustomerId: ownerId,
      tripId: normalizedTripId,
      email,
      displayName: cleanText(session?.display_name, 180) || 'Owner',
      role: 'owner',
      metadata: {
        source: 'vacation_app_owner_session',
        ...(slug ? { publicSlug: slug } : {}),
      },
      sessionToken,
      env,
    });
  } catch (error) {
    if (error?.statusCode === 403) return '';
    throw error;
  }
  return webAccessCookieHeader(sessionToken, env);
}

async function verifyActiveCollaboratorForTrip(db, { seat, session, tripId }) {
  const ownerId = cleanText(seat?.ownerCustomerId, 80);
  const inviteId = cleanText(seat?.inviteId, 80);
  const onboardingToken = cleanText(seat?.onboardingToken || session?.token, 400);
  if (!ownerId || !tripId) return null;
  if (seat?.ownerTripId && cleanText(seat.ownerTripId, 80) !== tripId) return null;
  let email = cleanText(session?.email, 180).toLowerCase();
  if (inviteId) {
    const collabRows = await db`
      select id, trip_id, status, metadata
      from vacation_collaborators
      where invite_id = ${inviteId}
        and owner_customer_id = ${ownerId}
        and (trip_id = ${tripId} or trip_id is null)
      order by case when status = 'active' then 0 else 1 end
      limit 1
    `;
    if (collabRows[0]) {
      if (collabRows[0].status && collabRows[0].status !== 'active') return null;
      const meta = collabRows[0].metadata && typeof collabRows[0].metadata === 'object' ? collabRows[0].metadata : {};
      if (!email && meta.email) email = cleanText(meta.email, 180).toLowerCase();
      return { email };
    }
    const invites = await db`
      select id, trip_id, status, metadata
      from vacation_collaborator_invites
      where id = ${inviteId}
        and owner_customer_id = ${ownerId}
        and status in ('paid', 'accepted')
        and (trip_id = ${tripId} or trip_id is null)
      limit 1
    `;
    if (invites[0]) {
      const meta = invites[0].metadata && typeof invites[0].metadata === 'object' ? invites[0].metadata : {};
      if (!email && meta.email) email = cleanText(meta.email, 180).toLowerCase();
      return { email };
    }
    return null;
  }
  if (!onboardingToken) return null;
  const byToken = await db`
    select id, trip_id, status, metadata
    from vacation_collaborators
    where owner_customer_id = ${ownerId}
      and metadata->>'onboardingToken' = ${onboardingToken}
      and (trip_id = ${tripId} or trip_id is null)
    order by case when status = 'active' then 0 else 1 end
    limit 1
  `;
  if (!byToken[0] || (byToken[0].status && byToken[0].status !== 'active')) return null;
  const meta = byToken[0].metadata && typeof byToken[0].metadata === 'object' ? byToken[0].metadata : {};
  if (!email && meta.email) email = cleanText(meta.email, 180).toLowerCase();
  return { email };
}

export async function vacationAppCollaboratorWebAccessCookie(db, req, { session, seat, tripId, env = process.env }) {
  const ownerId = cleanText(seat?.ownerCustomerId, 80);
  const normalizedTripId = cleanText(tripId, 80);
  const onboardingToken = cleanText(session?.token, 400);
  if (!ownerId || !normalizedTripId || !onboardingToken) return '';
  const verified = await verifyActiveCollaboratorForTrip(db, { seat, session, tripId: normalizedTripId });
  if (!verified || !verified.email || !verified.email.includes('@')) return '';
  const existing = readCookie(req, webAccessCookieName());
  if (existing) {
    const grant = await webAccessForSession(db, { sessionToken: existing, tripId: normalizedTripId, env });
    if (grant && grant.role !== 'owner') return '';
  }
  const sessionToken = vacationAppCollaboratorWebAccessToken(onboardingToken, normalizedTripId, env);
  const slug = intakeShareSlug(normalizedTripId);
  try {
    await createAcceptedWebAccessSession(db, {
      ownerCustomerId: ownerId,
      tripId: normalizedTripId,
      email: verified.email,
      displayName: cleanText(seat?.displayName || session?.display_name, 180) || 'Collaborator',
      role: 'web_editor',
      metadata: {
        source: 'vacation_app_collaborator_session',
        inviteId: cleanText(seat?.inviteId, 80) || null,
        collaboratorCustomerId: cleanText(session?.customer_id, 80) || null,
        ...(slug ? { publicSlug: slug } : {}),
      },
      sessionToken,
      env,
    });
  } catch (error) {
    if (error?.statusCode === 403) return '';
    throw error;
  }
  return webAccessCookieHeader(sessionToken, env);
}

export async function setVacationAppOwnerWebAccessCookie(db, req, res, { session, tripId, env = process.env }) {
  try {
    const cookie = await vacationAppOwnerWebAccessCookie(db, req, { session, tripId, env });
    if (cookie) res.setHeader('set-cookie', cookie);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'vacation_app_owner_web_access_failed',
      tripId: String(tripId || ''),
      error: String(error?.message || error),
    }));
  }
}

export async function setVacationAppCollaboratorWebAccessCookie(db, req, res, { session, seat, tripId, env = process.env }) {
  try {
    const cookie = await vacationAppCollaboratorWebAccessCookie(db, req, { session, seat, tripId, env });
    if (cookie) res.setHeader('set-cookie', cookie);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'vacation_app_collaborator_web_access_failed',
      tripId: String(tripId || ''),
      error: String(error?.message || error),
    }));
  }
}
