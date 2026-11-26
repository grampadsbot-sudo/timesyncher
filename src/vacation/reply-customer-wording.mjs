import { upgradeHouseholdPlanYearWording } from './household-plan-year-copy.mjs';
import { normalizeLodgingCheckoutWording } from './reply-lodging-checkout-wording.mjs';

export { HOUSEHOLD_PLAN_YEAR_LINE, HOUSEHOLD_PLAN_YEAR_PATTERN } from './household-plan-year-copy.mjs';

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_THEN_VACATION = new RegExp(`\\b(${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?)\\s+vacation\\b`, 'gi');

export function finalizeCustomerReplyText(text) {
  const value = upgradeHouseholdPlanYearWording(String(text || '').trim()).replace(DATE_THEN_VACATION, '$1 stay');
  return normalizeLodgingCheckoutWording(value);
}
