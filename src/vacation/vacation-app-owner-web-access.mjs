import crypto from 'node:crypto';

import { cleanText } from './http.mjs';
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
  try {
    await createAcceptedWebAccessSession(db, {
      ownerCustomerId: ownerId,
      tripId: normalizedTripId,
      email,
      displayName: cleanText(session?.display_name, 180) || 'Owner',
      role: 'owner',
      metadata: { source: 'vacation_app_owner_session' },
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
