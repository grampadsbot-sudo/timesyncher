import { applyProductKeepsakeOverrides } from './keepsake-product-overrides.mjs';

export function prepareSharedTripForLiveApp(shared = {}) {
  return applyProductKeepsakeOverrides(shared);
}
