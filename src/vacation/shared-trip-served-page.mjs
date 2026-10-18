import { prepareSharedTripForLiveApp } from './shared-trip-live-tab-lists.mjs';

export function finalizeServedSharedTripPayload(shared = {}, options = {}) {
  void options;
  return prepareSharedTripForLiveApp(shared);
}
