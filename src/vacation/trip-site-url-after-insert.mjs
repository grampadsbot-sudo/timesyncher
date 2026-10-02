import { intakeShareSlug } from './intake-shared-trip.mjs';
import { assignTripSiteUrl } from './onboarding.mjs';
import { websiteTripBase } from './web-access.mjs';

export async function assignTripSiteUrlWhenThingsPresent(db, tripId, env = process.env) {
  try {
    const rows = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
    if (!Number(rows[0]?.n)) return null;
    if (!intakeShareSlug(tripId)) return null;
    try {
      websiteTripBase(env);
    } catch (error) {
      if (String(error?.message || '').includes('TIMESYNCHER_TRAVEL_BASE_URL is missing')) return null;
      throw error;
    }
    return await assignTripSiteUrl(db, tripId, env);
  } catch (error) {
    if (error?.code === 'onboarding_trip_site_url_failed') throw error;
    throw error;
  }
}
