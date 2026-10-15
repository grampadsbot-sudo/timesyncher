import { prepareSharedTripForLiveApp } from './shared-trip-live-tab-lists.mjs';
import { backfillSharedTripCarSummaries } from './trip-thing-enrichment.mjs';

export function finalizeServedSharedTripPayload(shared = {}, options = {}) {
  void options;
  return prepareSharedTripForLiveApp(backfillSharedTripCarSummaries(shared));
}
