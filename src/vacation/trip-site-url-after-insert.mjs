import { intakeShareSlug } from './intake-shared-trip.mjs';
import { assignTripSiteUrl } from './onboarding.mjs';
import { websiteTripBase } from './web-access.mjs';

export async function assignTripSiteUrlWhenThingsPresent(db, tripId, env = process.env) {
  const rows = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
  if (!Number(rows[0]?.n)) return null;
  if (!intakeShareSlug(tripId)) return null;
  try {
    websiteTripBase(env);
  } catch {
    return null;
  }
  return assignTripSiteUrl(db, tripId, env);
}
