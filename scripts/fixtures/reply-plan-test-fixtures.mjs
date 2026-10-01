import { replyPlanFactsFromEntitlementRow } from '../../src/vacation/reply-plan-entitlement.mjs';

export const testPlanEnv = {
  TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single',
  TIMESYNCHER_UNLIMITED_NAME: 'TimeSyncher Vacation Year',
};

export const testSingleOwnerPlan = replyPlanFactsFromEntitlementRow({
  plan: 'single',
  status: 'active',
  metadata: { product: 'timesyncher_vacation_single' },
}, testPlanEnv, 'test-trip');

export const loadTestSingleOwnerPlan = async () => testSingleOwnerPlan;
