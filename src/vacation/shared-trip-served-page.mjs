import { prepareSharedTripForLiveApp } from './shared-trip-live-tab-lists.mjs';

/** API + served shared page: one payload shape for the live React shell. */
export function finalizeServedSharedTripPayload(shared = {}, options = {}) {
  void options;
  return prepareSharedTripForLiveApp(shared);
}
