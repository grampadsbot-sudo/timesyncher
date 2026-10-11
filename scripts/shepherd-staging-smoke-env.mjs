#!/usr/bin/env node
/**
 * Staging project should set TIMESYNCHER_HARNESS_STUB_OUTBOUND=1 so harness mint
 * checkouts do not consume Resend quota; bundle spine still sends to agentmail + shepherd-*@resend.dev.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { outboundEmailPassesSmokeHarness } from '../src/vacation/email.mjs';

const PROJECT = 'timesyncher-vacation-staging';
const V1_ENV_IDS = {
  DATABASE_URL: '1aaOv6d2efkLmXJA',
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

const PULLED_ENV_FILE_REL_PATHS = [
  '.vercel/.env.production.local',
  '.env.production.local',
  '.env.local',
];

function repoRootDir() {
  return fileURLToPath(new URL('..', import.meta.url));
}

/** Vercel decrypt occasionally returns a JSON-encoded string (extra quotes). */
export function unwrapVercelEnvString(value) {
  let trimmed = String(value ?? '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') trimmed = parsed.trim();
    } catch (parseError) {
      if (parseError instanceof Error) trimmed = trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function parseEnvFileValue(key, filePath) {
  if (!existsSync(filePath)) return '';
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return unwrapVercelEnvString(value.trim());
  }
  return '';
}

function hydrateEnvKeyFromPulledFiles(key, env) {
  if (String(env[key] || '').trim()) return;
  const root = repoRootDir();
  for (const rel of PULLED_ENV_FILE_REL_PATHS) {
    const value = parseEnvFileValue(key, `${root}/${rel}`);
    if (value) {
      env[key] = value;
      return;
    }
  }
}

async function listVercelTeamIds(token, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.vercel.com/v2/teams', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const payload = await res.json();
  return (payload.teams || []).map((row) => row.id).filter(Boolean);
}

async function fetchProjectEnvValueByKey(keyName, { env = process.env, fetchImpl = fetch } = {}) {
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) throw new Error('VERCEL_TOKEN is required to load staging smoke env.');
  const primaryTeam = await resolveTeamId(fetchImpl);
  const teamIds = primaryTeam ? [primaryTeam] : ['', ...await listVercelTeamIds(token, fetchImpl)];
  let lastStatus = 0;
  for (const teamId of teamIds) {
    const params = new URLSearchParams({ decrypt: 'false' });
    if (teamId) params.set('teamId', teamId);
    const res = await fetchImpl(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(PROJECT)}/env?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
    );
    lastStatus = res.status;
    if (!res.ok) continue;
    const envs = (await res.json()).envs || [];
    const row = envs.find((entry) => entry.key === keyName && [].concat(entry.target || []).includes('production'));
    if (row?.id) return fetchV1EnvValue(row.id, { env, fetchImpl });
  }
  throw new Error(`Failed to load Vercel env ${keyName}: HTTP ${lastStatus || 'unknown'}`);
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
  const value = unwrapVercelEnvString(typeof payload?.value === 'string' ? payload.value : '');
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
  if (String(env.TIMESYNCHER_HARNESS_STUB_OUTBOUND || '').trim() !== '0') {
    env.TIMESYNCHER_HARNESS_STUB_OUTBOUND = '1';
  }
  const eulaPrefixKey = 'TIMESYNCHER_EULA_BLOB_PREFIX';
  hydrateEnvKeyFromPulledFiles(eulaPrefixKey, env);
  if (!String(env[eulaPrefixKey] || '').trim() && String(env.VERCEL_TOKEN || '').trim()) {
    const row = await fetchProjectEnvValueByKey(eulaPrefixKey, { env, fetchImpl });
    env[row.key] = row.value;
  }
}

/** Check I: stub outbound when TIMESYNCHER_HARNESS_STUB_OUTBOUND=1 (zero Resend HTTP). */
export function checkIOutboundPassesSmokeHarness(row, env = process.env) {
  if (env.TIMESYNCHER_HARNESS_STUB_OUTBOUND === '1') {
    return String(row?.status || '') === 'stubbed' && String(row?.provider || '') === 'harness_stub';
  }
  return outboundEmailPassesSmokeHarness(row);
}

function outboundRowErrorSummaryEmpty(row) {
  const summary = row?.error_summary ?? row?.errorSummary;
  return summary == null || String(summary).trim() === '';
}

/** Live Resend row: status=sent, provider=resend, no error_summary. */
export function checkIResendSentRowPasses(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.status || '') !== 'sent') return false;
  if (String(row.provider || '') !== 'resend') return false;
  return outboundRowErrorSummaryEmpty(row);
}

/**
 * Check I outbound verdict (stub harness vs confirmed live Resend send).
 */
export function evaluateCheckIOutbound({ row, env = process.env } = {}) {
  const stub = env.TIMESYNCHER_HARNESS_STUB_OUTBOUND === '1';
  if (stub) {
    if (checkIOutboundPassesSmokeHarness(row, env)) {
      return { pass: true, infraBlocked: false, reason: null };
    }
    return { pass: false, infraBlocked: true, reason: 'stub_outbound_unconfirmed' };
  }
  if (checkIResendSentRowPasses(row)) {
    return { pass: true, infraBlocked: false, reason: null };
  }
  if (checkIOutboundPassesSmokeHarness(row, env)) {
    return { pass: true, infraBlocked: false, reason: null };
  }
  return { pass: false, infraBlocked: false, reason: 'outbound_failed' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureShepherdStagingSmokeEnv();
  process.stdout.write('ok\n');
}
