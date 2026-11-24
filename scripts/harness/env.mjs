import os from 'node:os';
import path from 'node:path';
import { loadStagingDatabaseUrl } from '../host/vk_ship_dry_env.mjs';

export const HARNESS_ENV_DEFAULTS = {
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://vacation-staging.timesyncher.com',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
};

export const STAGING_PROJECT_NAME = 'timesyncher-vacation-staging';
export const STAGING_HARNESS_ORIGIN = 'https://vacation-staging.timesyncher.com';

export function hostEnvReady(env = process.env) {
  const database = Boolean(String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim());
  return database && String(env.HARNESS_LIVE || '') === '1';
}

export function assertStagingHarnessTarget({ projectName, projectId, stagingProjectId, origin } = {}) {
  if (String(projectName || '') !== STAGING_PROJECT_NAME) {
    throw new Error('refused: harness live config is not timesyncher-vacation-staging');
  }
  if (String(origin || '') !== STAGING_HARNESS_ORIGIN) {
    throw new Error('refused: harness origin is not vacation-staging');
  }
  if (stagingProjectId && projectId && String(projectId) !== String(stagingProjectId)) {
    throw new Error('refused: harness project id is not the staging project');
  }
}

export async function loadStagingHarnessDatabase({
  env = {},
  roots = [],
  projectName = STAGING_PROJECT_NAME,
  projectId = '',
  stagingProjectId = '',
  origin = STAGING_HARNESS_ORIGIN,
  fetchImpl,
  readFile,
  tokenFile,
  tokenFileExists,
} = {}) {
  assertStagingHarnessTarget({ projectName, projectId, stagingProjectId, origin });
  if (projectId && projectId !== STAGING_PROJECT_NAME && projectId !== String(stagingProjectId || '')) {
    throw new Error('refused: harness project id is not the staging project');
  }
  const locked = { ...env, VERCEL_PROJECT_ID: STAGING_PROJECT_NAME };
  delete locked.DATABASE_URL;
  delete locked.NEON_DATABASE_URL;
  delete locked.OPENROUTER_API_KEY;
  const loaded = await loadStagingDatabaseUrl({
    env: locked,
    roots,
    fetchImpl,
    readFile,
    tokenFile,
    tokenFileExists,
  });
  if (!loaded.url) {
    return { ok: false, missing: 'DATABASE_URL', environment: 'timesyncher-vacation-staging production', flag: 'HARNESS_LIVE' };
  }
  return {
    ok: true,
    env: { ...env, DATABASE_URL: loaded.url, HARNESS_LIVE: '1' },
  };
}

export function withHarnessEnvDefaults(env = process.env) {
  const next = { ...env };
  if (!String(next.TIMESYNCHER_TRAVEL_BASE_URL || next.TIMESYNCHER_PUBLIC_TRAVEL_BASE_URL || '').trim()) {
    next.TIMESYNCHER_TRAVEL_BASE_URL = HARNESS_ENV_DEFAULTS.TIMESYNCHER_TRAVEL_BASE_URL;
  }
  if (!String(next.TIMESYNCHER_COLLABORATOR_NAME || '').trim()) {
    next.TIMESYNCHER_COLLABORATOR_NAME = HARNESS_ENV_DEFAULTS.TIMESYNCHER_COLLABORATOR_NAME;
  }
  return next;
}

export function preflightHarnessEnv(env = process.env) {
  const ready = withHarnessEnvDefaults(env);
  const missing = [];
  if (!String(ready.DATABASE_URL || ready.NEON_DATABASE_URL || '').trim()) missing.push('DATABASE_URL');
  if (String(ready.HARNESS_LIVE || '') !== '1') missing.push('HARNESS_LIVE');
  if (!String(ready.TIMESYNCHER_TRAVEL_BASE_URL || '').trim()) missing.push('TIMESYNCHER_TRAVEL_BASE_URL');
  if (!String(ready.TIMESYNCHER_COLLABORATOR_NAME || '').trim()) missing.push('TIMESYNCHER_COLLABORATOR_NAME');
  if (missing.length) throw new Error(`harness preflight missing ${missing.join(', ')}`);
  return ready;
}

export function stagingOrigin(env = process.env) {
  const raw = String(env.HARNESS_STAGING_ORIGIN || 'https://vacation-staging.timesyncher.com').trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('refused: staging origin must be https');
  return url.origin;
}

export function defaultRunRoot() {
  return path.join(os.homedir(), 'tsv-dispatch', 'harness-runs');
}

export function secretValues(env = process.env, extra = []) {
  const keys = ['DATABASE_URL', 'NEON_DATABASE_URL', 'TIMESYNCHER_MEDIA_BIND_TOKEN', 'TIMESYNCHER_ADMIN_TOKEN', 'TIMESYNCHER_WORKER_TOKEN'];
  return [...keys.map((key) => String(env[key] || '')), ...extra].filter((value) => value.length > 8);
}
