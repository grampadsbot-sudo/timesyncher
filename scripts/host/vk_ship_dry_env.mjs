import { readFileSync } from 'node:fs';

export const PULLED_ENV_FILES = [
  '.env.production.local',
  '.vercel/.env.production.local',
  '.env.local',
];

export const DATABASE_ENV_ID = '1aaOv6d2efkLmXJA';
const PROJECT = 'timesyncher-vacation-staging';

function envAssignment(text, key) {
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1 || trimmed.slice(0, eq).trim() !== key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return value.trim();
  }
  return '';
}

export function databaseUrlFromText(text) {
  const raw = envAssignment(text, 'DATABASE_URL') || envAssignment(text, 'NEON_DATABASE_URL');
  return /^postgres(ql)?:\/\//i.test(raw) ? raw : '';
}

export function harnessEnvSkipped(text) {
  const blob = String(text || '');
  return blob.includes('SKIP harness:') || blob.includes('host env absent');
}

export function markEnvBlocked(dryRun, sha, runId) {
  return {
    ...dryRun,
    ran: false,
    blockedEnv: true,
    sha: sha || '',
    id: runId || '',
    reason: 'blocked: env',
    verdict: '',
    outputsPass: false,
  };
}

function joinRoot(root, rel) {
  return `${String(root).replace(/\/$/, '')}/${rel}`;
}

export function databaseUrlFromFiles(roots, readFile) {
  for (const root of roots || []) {
    if (!root) continue;
    for (const rel of PULLED_ENV_FILES) {
      let text = '';
      try { text = readFile(joinRoot(root, rel)); } catch { text = ''; }
      const url = databaseUrlFromText(text);
      if (url) return { url, source: rel };
    }
  }
  return { url: '', source: '' };
}

function teamFromText(text) {
  try { return JSON.parse(text).orgId || ''; } catch { return ''; }
}

async function fetchDatabaseUrl(token, team, fetchImpl) {
  const params = new URLSearchParams({ decrypt: 'true' });
  if (team) params.set('teamId', team);
  const response = await fetchImpl(
    `https://api.vercel.com/v1/projects/${PROJECT}/env/${DATABASE_ENV_ID}?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
  );
  if (!response?.ok) return '';
  const payload = await response.json();
  if (payload?.key && payload.key !== 'DATABASE_URL') return '';
  const value = String(payload?.value || '').trim().replace(/^"|"$/g, '');
  return /^postgres(ql)?:\/\//i.test(value) ? value : '';
}

export async function loadStagingDatabaseUrl({ roots, env = {}, readFile = (file) => readFileSync(file, 'utf8'), fetchImpl = fetch } = {}) {
  const existing = String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim();
  if (/^postgres(ql)?:\/\//i.test(existing)) return { url: existing, source: 'env' };
  const fileHit = databaseUrlFromFiles(roots, readFile);
  if (fileHit.url) return fileHit;
  const token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) return { url: '', source: '' };
  let team = String(env.VERCEL_ORG_ID || env.VERCEL_TEAM_ID || '').trim();
  if (!team) {
    for (const root of roots || []) {
      if (!root) continue;
      try { team = teamFromText(readFile(joinRoot(root, '.vercel/project.json'))); } catch { team = ''; }
      if (team) break;
    }
  }
  const url = await fetchDatabaseUrl(token, team, fetchImpl);
  return url ? { url, source: 'vercel-database-url' } : { url: '', source: '' };
}
