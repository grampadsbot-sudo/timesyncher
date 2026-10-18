import { finalizeServedSharedTripPayload } from '../../../../src/vacation/shared-trip-served-page.mjs';

export { finalizeServedSharedTripPayload as prepareServedSharedTrip };

export function prepareItinerarySharedTrip(shared) {
  return finalizeServedSharedTripPayload(shared, { budgetMode: 'itinerary' });
}
