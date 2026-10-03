import { postItinerary } from './shepherd-staging-smoke-helpers.mjs';

/** Post turns so shared tabs (hotels, cars, restaurants, budget, map) have real rows. */
export async function seedVisualSmokeTripContent(session, tripId, { setStage } = {}) {
  if (!session || !tripId) {
    return { ok: false, reason: 'missing_session_or_trip' };
  }
  const steps = [
    { label: 'seed hyatt lodging', body: { tripId, text: 'We are staying at Hyatt Regency Maui Resort & Spa in Lahaina for our trip.' } },
    { label: 'seed hertz car', body: { tripId, text: 'Hertz rental car pickup at OGG airport' } },
    { label: 'seed restaurant', body: { tripId, text: 'Dinner reservation at Merrimans Kapalua on March 12' } },
    { label: 'seed activity', body: { tripId, text: 'Luau at Old Lahaina on March 14 evening' } },
  ];
  const http = [];
  for (const step of steps) {
    setStage?.(step.label);
    const res = await postItinerary(session, step.body);
    http.push({ label: step.label, status: res.status });
  }
  return { ok: http.every((r) => r.status === 201), http };
}
