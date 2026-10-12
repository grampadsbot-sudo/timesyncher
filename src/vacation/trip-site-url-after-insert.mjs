import { intakeShareSlug } from './intake-shared-trip.mjs';
import { assignTripSiteUrl } from './onboarding.mjs';
import { websiteTripBase, sharedTripWebsiteUrl } from './web-access.mjs';
import { loadTripSearchProgress, persistTripSearchProgress } from './search-progress.mjs';

export async function assignTripSiteUrlWhenThingsPresent(db, tripId, env = process.env) {
  try {
    const rows = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
    if (!Number(rows[0]?.n)) return null;
    if (!intakeShareSlug(tripId)) return null;
    websiteTripBase(env);
    const url = await assignTripSiteUrl(db, tripId, env);
    try {
      const progress = await loadTripSearchProgress(db, tripId);
      if (progress.jobId && progress.stage !== 'failed') {
        const slug = intakeShareSlug(tripId);
        const publicUrl = slug ? (sharedTripWebsiteUrl(slug, env) || url || '') : (url || '');
        await persistTripSearchProgress(db, tripId, {
          ...progress,
          stage: 'ready',
          websiteReady: Boolean(publicUrl),
          seq: progress.seq + 1,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Progress must not block site URL assignment.
    }
    return url;
  } catch (error) {
    if (error?.code === 'onboarding_trip_site_url_failed') throw error;
    throw error;
  }
}
