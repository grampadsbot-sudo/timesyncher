#!/usr/bin/env node
import { brokerMintPaidCollaboratorInvite } from '../src/vacation/collaborator-broker.mjs';

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const dryRun = !hasFlag('remote');
const body = {
  tripId: arg('trip-id', 'aba991d7-894f-4b4c-a548-cb7510581182'),
  sessionToken: arg('session-token', '6CTRnW4Ca2MW_bsj6hqJozxW'),
  requestedFor: arg('requested-for', 'Kim Rivera'),
  plan: arg('plan', 'single_trip'),
  email: arg('email', 'kim.rivera.sct@example.invalid'),
  firstName: arg('first-name', 'Kim'),
  lastName: arg('last-name', 'Rivera'),
  couponCode: arg('coupon-code'),
  dryRun,
};

const stagingEnv = {
  ...process.env,
  TIMESYNCHER_TELEGRAM_BOT_USERNAME:
    process.env.TIMESYNCHER_TELEGRAM_BOT_USERNAME || 'TimeSyncherVacationStagingBot',
  TIMESYNCHER_SITE_BASE_URL:
    process.env.TIMESYNCHER_SITE_BASE_URL || 'https://vacation-staging.timesyncher.com',
};

if (dryRun) {
  const result = await brokerMintPaidCollaboratorInvite(null, body, stagingEnv);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
}

const adminToken = process.env.TIMESYNCHER_ADMIN_TOKEN || '';
if (!adminToken) {
  console.log(JSON.stringify({
    ok: false,
    status: 'cannot_mint',
    error: 'TIMESYNCHER_ADMIN_TOKEN is not set in this environment.',
    craigClick: 'Put TIMESYNCHER_ADMIN_TOKEN in the SCT/OpenClaw secret lane (same as prior admin onboard). Then: node scripts/mint-staging-collaborator.mjs --remote',
  }, null, 2));
  process.exit(2);
}

const base = String(arg('base', 'https://vacation-staging.timesyncher.com')).replace(/\/+$/, '');
const bypass = process.env.VERCEL_PROTECTION_BYPASS || '';
const headers = {
  authorization: `Bearer ${adminToken}`,
  'content-type': 'application/json',
};
if (bypass) headers['x-vercel-protection-bypass'] = bypass;

const response = await fetch(`${base}/api/admin-onboardings?action=create-collaborator-invite`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ ...body, dryRun: hasFlag('dry-run') }),
});
const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
console.log(JSON.stringify(payload, null, 2));
process.exit(payload.ok ? 0 : 2);
