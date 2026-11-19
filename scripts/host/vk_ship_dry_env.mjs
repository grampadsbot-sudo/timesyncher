import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const PULLED_ENV_FILES = [
  '.env.production.local',
  '.vercel/.env.production.local',
  '.env.local',
];

export const DATABASE_ENV_ID = '1aaOv6d2efkLmXJA';
const PROJECT = 'timesyncher-vacation-staging';

export function defaultVercelTokenFile(home = homedir()) {
  return path.join(home, '.config', 'tsv-deploy', 'vercel-token');
}

export const MEDIA_BIND_ENV = 'TIMESYNCHER_MEDIA_BIND_TOKEN';

export function defaultMediaBindTokenFile(home = homedir()) {
  return path.join(home, '.config', 'tsv-deploy', 'media-bind-token');
}

export function loadHostMediaBindToken({
  env = {},
  tokenFile = defaultMediaBindTokenFile(),
  readFile = (file) => readFileSync(file, 'utf8'),
  exists = existsSync,
} = {}) {
  const fromEnv = String(env[MEDIA_BIND_ENV] || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'env', block: '' };
  const token = readHostVercelToken(tokenFile, readFile, exists);
  if (token) return { token, source: 'file', block: '' };
  return { token: '', source: '', block: `blocked: env ${MEDIA_BIND_ENV} missing at ${tokenFile}` };
}

function readHostVercelToken(file, readFile, exists) {
  if (!file || !exists(file)) return '';
  try { return String(readFile(file) || '').trim(); } catch { return ''; }
}

function pythonStringConstant(text, name) {
  const match = String(text || '').match(new RegExp(`^${name}\\s*=\\s*(['"])(.*?)\\1`, 'm'));
  return match ? match[2].trim() : '';
}

function dispatchConstants(roots, readFile) {
  for (const root of roots || []) {
    if (!root) continue;
    let text = '';
    try { text = readFile(joinRoot(root, 'tsv_dispatch.py')); } catch { text = ''; }
    const team = pythonStringConstant(text, 'VERCEL_TEAM_ID');
    const project = pythonStringConstant(text, 'STAGING_PROJECT_ID');
    if (team || project) return { team, project };
  }
  return { team: '', project: '' };
}

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

export function dryRunId(date = new Date()) {
  const compact = date.toISOString().slice(0, 16).replace(/[-:T]/g, '').toLowerCase();
  return `dry-run-${compact.slice(0, 8)}-${compact.slice(8)}-openrouter`;
}

export function harnessFailureMessage(text) {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const named = lines.find((line) => line.startsWith('Error:') || line.startsWith('refused:'));
  const detail = named ? named.replace(/^Error:\s*/, '') : (lines[0] || 'dry-run-missing-scorecard');
  return detail.slice(0, 240);
}

export function applyMissingScorecard(round, text) {
  const detail = harnessFailureMessage(text);
  round.errors.push(detail);
  round.dryRun.ran = false;
  round.dryRun.blockedEnv = true;
  round.dryRun.verdict = 'FAIL';
  round.dryRun.reason = detail;
  round.dryRun.outputsPass = false;
  return detail;
}

export function markEnvBlocked(dryRun, sha, runId, reason = 'blocked: env') {
  return {
    ...dryRun,
    ran: false,
    blockedEnv: true,
    sha: sha || '',
    id: runId || '',
    reason,
    verdict: '',
    outputsPass: false,
  };
}

export const NPM_STAMP_NAME = 'ship-repo-npm-ci.sha256';
export const APP_DB_MODULE = '@neondatabase/serverless';

export function lockHash(text) {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

export function depsNeedInstall({ hasNodeModules, lockHash: hash, savedHash }) {
  return !hasNodeModules || !savedHash || savedHash !== hash;
}

export function missingModule(repo, name, exists) {
  const pkg = path.join(repo, 'node_modules', ...String(name || '').split('/'), 'package.json');
  return exists(pkg) ? '' : (name || APP_DB_MODULE);
}

export function ensureShipRepoDeps({
  repo,
  stateDir,
  readFile = (file) => readFileSync(file, 'utf8'),
  writeFile = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); },
  exists = existsSync,
  spawn,
  moduleName = APP_DB_MODULE,
} = {}) {
  const module = moduleName || APP_DB_MODULE;
  let lockText = '';
  try { lockText = readFile(path.join(repo, 'package-lock.json')); } catch { return `blocked: env ${module}`; }
  const hash = lockHash(lockText);
  const stampPath = path.join(stateDir, NPM_STAMP_NAME);
  let saved = '';
  try { saved = String(readFile(stampPath) || '').trim(); } catch { saved = ''; }
  const hasNodeModules = exists(path.join(repo, 'node_modules'));
  if (depsNeedInstall({ hasNodeModules, lockHash: hash, savedHash: saved })) {
    const result = spawn ? spawn('npm', ['ci', '--no-audit', '--no-fund'], { cwd: repo }) : { status: 1 };
    if (!result || result.status !== 0) return `blocked: env ${module}`;
    writeFile(stampPath, `${hash}\n`);
  }
  const missing = missingModule(repo, module, exists);
  return missing ? `blocked: env ${missing}` : '';
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

async function fetchDatabaseUrl(token, team, project, fetchImpl) {
  const params = new URLSearchParams({ decrypt: 'true' });
  if (team) params.set('teamId', team);
  const response = await fetchImpl(
    `https://api.vercel.com/v1/projects/${project || PROJECT}/env/${DATABASE_ENV_ID}?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
  );
  if (!response?.ok) return '';
  const payload = await response.json();
  if (payload?.key && payload.key !== 'DATABASE_URL') return '';
  const value = String(payload?.value || '').trim().replace(/^"|"$/g, '');
  return /^postgres(ql)?:\/\//i.test(value) ? value : '';
}

export async function loadStagingDatabaseUrl({
  roots,
  env = {},
  readFile = (file) => readFileSync(file, 'utf8'),
  fetchImpl = fetch,
  tokenFile = defaultVercelTokenFile(),
  tokenFileExists = existsSync,
} = {}) {
  const existing = String(env.DATABASE_URL || env.NEON_DATABASE_URL || '').trim();
  if (/^postgres(ql)?:\/\//i.test(existing)) return { url: existing, source: 'env' };
  const fileHit = databaseUrlFromFiles(roots, readFile);
  if (fileHit.url) return fileHit;
  let token = String(env.VERCEL_TOKEN || '').trim();
  if (!token) token = readHostVercelToken(tokenFile, readFile, tokenFileExists);
  if (!token) return { url: '', source: '' };
  const dispatch = dispatchConstants(roots, readFile);
  let team = String(env.VERCEL_ORG_ID || env.VERCEL_TEAM_ID || '').trim() || dispatch.team;
  if (!team) {
    for (const root of roots || []) {
      if (!root) continue;
      try { team = teamFromText(readFile(joinRoot(root, '.vercel/project.json'))); } catch { team = ''; }
      if (team) break;
    }
  }
  const project = String(env.VERCEL_PROJECT_ID || '').trim() || dispatch.project;
  const url = await fetchDatabaseUrl(token, team, project, fetchImpl);
  return url ? { url, source: 'vercel-database-url' } : { url: '', source: '' };
}
