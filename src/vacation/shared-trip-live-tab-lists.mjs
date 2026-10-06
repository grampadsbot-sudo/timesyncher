import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';
import { applyLiveAppListRowFields } from './shared-trip-live-app-fields.mjs';

export function prepareSharedTripForLiveApp(shared = {}) {
  const keepsake = applyProductKeepsakeOverrides(shared);
  return applyLiveAppListRowFields(keepsake);
}
