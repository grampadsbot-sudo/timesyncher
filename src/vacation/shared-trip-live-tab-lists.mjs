import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';
import { applyThingPresentation } from './intake-shared-trip.mjs';
import { applyLiveAppListRowFields } from './shared-trip-live-app-fields.mjs';

export function prepareSharedTripForLiveApp(shared = {}) {
  const presented = applyThingPresentation(shared);
  const keepsake = applyProductKeepsakeOverrides(presented);
  return applyLiveAppListRowFields(keepsake);
}
