import os from 'node:os';
import path from 'node:path';

export function hostEnvReady(env = process.env) {
  const database = Boolean(String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim());
  return database && String(env.HARNESS_LIVE || '') === '1';
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
