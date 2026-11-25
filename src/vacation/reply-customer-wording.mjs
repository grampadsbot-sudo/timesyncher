import { upgradeHouseholdPlanYearWording } from './household-plan-year-copy.mjs';
import { normalizeLodgingCheckoutWording } from './reply-lodging-checkout-wording.mjs';

export function finalizeCustomerReplyText(text) {
  return normalizeLodgingCheckoutWording(upgradeHouseholdPlanYearWording(String(text || '').trim()));
}