#!/usr/bin/env node
 * Staging project should set TIMESYNCHER_HARNESS_STUB_OUTBOUND=1 so harness mint
 * checkouts do not consume Resend quota; bundle spine still sends to agentmail + shepherd-*@resend.dev.
import { readFileSync } from 'node:fs';

const PROJECT = 'timesyncher-vacation-staging';
const V1_ENV_IDS = {
  DATABASE_URL: 'A9IvKmyFpAfVBLQx',
  OPENROUTER_API_KEY: '84Sr0i1odTrW9wLN',
  TIMESYNCHER_COUPON_HASH_SALT: 'v5J7KMS41ksY339X',
  TIMESYNCHER_COLLABORATOR_NAME: 'i6c6ba5Gh1Xx1ysV',
};

function teamId() {
  const fromEnv = process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID;
  if (fromEnv) return fromEnv;
  try {
    return JSON.parse(readFileSync(new URL('../.vercel/project.json', import.meta.url), 'utf8')).orgId || '';
  } catch {
    return '';
  }
}

async function resolveTeamId(fetchImpl = fetch) {
  const existing = teamId();
  if (existing) return existing;
  const token = String(process.env.VERCEL_TOKEN || '').trim();
  if (!token) return '';
  const res = await fetchImpl('https://api.vercel.com/v2/teams', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return '';
  const payload = await res.json();
  return payload.teams?.[0]?.id || '';
}

async function fetchV1EnvValue(envId, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) throw new Error('VERCEL_TOKEN is required to load staging smoke env.');
  const team = await resolveTeamId(fetchImpl);
  const params = new URLSearchParams({ decrypt: 'true' });
  if (team) params.set('teamId', team);
  const res = await fetchImpl(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(PROJECT)}/env/${envId}?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
  );
  if (!res.ok) throw new Error(`Failed to load Vercel env ${envId}: HTTP ${res.status}`);
  const payload = await res.json();
  const value = typeof payload?.value === 'string' ? payload.value.trim() : '';
  if (!value) throw new Error(`Empty Vercel env ${payload?.key || envId}.`);
  return { key: payload.key, value };
}

const STAGING_TRAVEL_BASE = 'https://vacation-staging.timesyncher.com/';

export async function ensureShepherdStagingSmokeEnv({ env = process.env, fetchImpl = fetch } = {}) {
  for (const [key, envId] of Object.entries(V1_ENV_IDS)) {
    const existing = String(env[key] || '').trim();
    const keepExisting = key === 'DATABASE_URL'
      ? /^postgres(ql)?:\/\//.test(existing)
      : existing.length > 0;
    if (keepExisting) continue;
    const row = await fetchV1EnvValue(envId, { env, fetchImpl });
    env[row.key] = row.value;
    if (row.key === 'DATABASE_URL') env.NEON_DATABASE_URL = row.value;
  }
  if (!String(env.TIMESYNCHER_TRAVEL_BASE_URL || '').trim()) {
    env.TIMESYNCHER_TRAVEL_BASE_URL = STAGING_TRAVEL_BASE;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureShepherdStagingSmokeEnv();
  process.stdout.write('ok\n');
}
