#!/usr/bin/env node
/** Load staging secrets required for local mint + DB smoke (never log values). */
import { readFileSync } from 'node:fs';

const PROJECT = 'timesyncher-vacation-staging';
const V1_ENV_IDS = {
  DATABASE_URL: 'A9IvKmyFpAfVBLQx',
  TIMESYNCHER_COUPON_HASH_SALT: 'v5J7KMS41ksY339X',
  TIMESYNCHER_COLLABORATOR_NAME: 'i6c6ba5Gh1Xx1ysV',
};

const OPENROUTER_ENV_KEYS = [
  'OPENROUTER_API_KEY',
  'TIMESYNCHER_OPENROUTER_API_KEY',
  'TIMESYNCHER_JEV_CLASSIFY_TOKEN',
  'JEV_OPENROUTER_API_KEY',
  'TIMESYNCHER_JEV_OPENROUTER_API_KEY',
];

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

function openRouterKeyPresent(env = process.env) {
  return OPENROUTER_ENV_KEYS.some((key) => String(env[key] || '').trim().length > 0);
}

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
  if (!openRouterKeyPresent(env)) {
    const token = String(env.VERCEL_TOKEN || '').trim();
    if (token) {
      const team = await resolveTeamId(fetchImpl);
      const params = new URLSearchParams();
      if (team) params.set('teamId', team);
      const res = await fetchImpl(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(PROJECT)}/env?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
      );
      if (res.ok) {
        const payload = await res.json();
        const rows = Array.isArray(payload?.envs) ? payload.envs : [];
        for (const want of OPENROUTER_ENV_KEYS) {
          const hit = rows.find((row) => String(row?.key || '').trim() === want);
          const value = typeof hit?.value === 'string' ? hit.value.trim() : '';
          if (value) {
            env[want] = value;
            break;
          }
        }
      }
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureShepherdStagingSmokeEnv();
  process.stdout.write('ok\n');
}
