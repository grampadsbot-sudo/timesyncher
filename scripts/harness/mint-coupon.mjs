import { createThrowawayCoupon } from '../customer_suite/cleanup.mjs';
import { STAGING_HARNESS_ORIGIN } from './env.mjs';
import { harnessTag } from './protected.mjs';

export async function mintFreshStagingCoupon({ origin, env = {}, runId, storyId, fetchImpl } = {}) {
  if (String(origin || '') !== STAGING_HARNESS_ORIGIN) throw new Error('refused: harness origin is not vacation-staging');
  const adminToken = String(env.TIMESYNCHER_ADMIN_TOKEN || '').trim();
  if (!adminToken) return { ok: false, missing: 'TIMESYNCHER_ADMIN_TOKEN' };
  const minted = await createThrowawayCoupon(origin, adminToken, {
    tag: harnessTag(runId, storyId),
    plan: 'single',
    label: 'VK harness fresh test coupon',
    fetchImpl,
  });
  const code = String(minted.code || '').trim().toUpperCase();
  if (!code) return { ok: false, missing: 'TIMESYNCHER_ADMIN_TOKEN' };
  return { ok: true, code, mintedCode: code };
}
