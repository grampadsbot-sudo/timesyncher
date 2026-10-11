#!/usr/bin/env node
/**
 * Documents four-state layout/visual provisioning for post-deploy verify-layout.
 * Mint path: mintVisualStateCustomers (4 fresh coupons layout-${SHA7}, @resend.dev emails).
 */
import { mintVisualStateCustomers } from '../../../../scripts/shepherd-staging-smoke-visual-states.mjs';

export { mintVisualStateCustomers };

export const VERIFY_LAYOUT_STATE_IDS = ['v0', 'v1', 'v1site', 'v2'];

export function verifyLayoutProvisionHelp() {
  return {
    states: VERIFY_LAYOUT_STATE_IDS,
    mint: 'mintVisualStateCustomers({ db, BASE, SHA7, setStage })',
    env: 'DATABASE_URL and OPENROUTER_API_KEY in process.env (operator supplies; skill does not call Vercel API)',
    viewports: ['390x844', '1280x800'],
    note: 'Never reuse coupon TS-2TZD3CGMA_J7; v1site supplies sharedUrl for Day-by-Day shell.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(verifyLayoutProvisionHelp(), null, 2));
}
