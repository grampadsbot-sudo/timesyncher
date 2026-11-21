import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertThrowaway } from '../harness/protected.mjs';
import { defaultVercelTokenFile, loadStagingDatabaseUrl } from '../host/vk_ship_dry_env.mjs';

export const REPO = 'grampadsbot-sudo/timesyncher';
export const STAGING_ORIGIN = 'https://vacation-staging.timesyncher.com';
const HOME = os.homedir();
const SUITE_ROOT = process.env.VK_SUITE_ROOT || path.join(HOME, 'tsv-dispatch', 'customer-suite');
export const RESULTS_ROOT = path.join(SUITE_ROOT, 'results');
const STATE_FILE = path.join(SUITE_ROOT, 'state.json');
const TOKEN_FILE = process.env.VK_SUITE_GH_TOKEN_FILE || path.join(HOME, '.config', 'tsv-gateb', 'gh-token');
export const BELL = process.env.VK_SUITE_BELL || path.join(HOME, 'tsv-dispatch', 'bell_gate.py');
export const BANNED_AI_HOST = ['openrouter', 'ai'].join('.');

export const VIEWPORTS = [
  { name: 'iphone-390', width: 390, height: 844, touch: true },
  { name: 'desktop-1280', width: 1280, height: 800, touch: false },
];

const EXTRA_PROTECTED_TERMS = ['8cqx', 'd0463815', 'santa barbara'];
const EXTRA_PROTECTED_NAMES = ['kim', 'craig'];
const SCRUB_SECRETS = new Set();

export function registerSecret(value) {
  const s = String(value || '').trim();
  if (s.length > 8) SCRUB_SECRETS.add(s);
}

export function assertStagingUrl(rawUrl) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const isLocal = host === '127.0.0.1' || host === 'localhost';
  if (!isLocal && host !== 'vacation-staging.timesyncher.com') {
    throw new Error(`refusing non-staging target ${host}`);
  }
  if (!isLocal && url.protocol !== 'https:') {
    throw new Error('refusing non-https staging target');
  }
  return url.origin;
}

export function assertSafeThrowaway(target = {}) {
  assertThrowaway(target);
  const hay = [
    target.tripId,
    target.trip_id,
    target.shareToken,
    target.share_token,
    target.slug,
    target.publicSlug,
    target.title,
    target.destination,
    target.email,
    target.name,
    target.displayName,
    target.display_name,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(' ');
  for (const term of EXTRA_PROTECTED_TERMS) {
    if (hay.includes(term)) throw new Error(`refused: protected target (${term})`);
  }
  const email = String(target.email || '').trim().toLowerCase();
  if (email) {
    const local = email.split('@')[0] || '';
    for (const name of EXTRA_PROTECTED_NAMES) {
      if (local === name || local.startsWith(`${name}.`) || local.startsWith(`${name}+`) || local.startsWith(`${name}_`)) {
        throw new Error(`refused: protected account (${name})`);
      }
    }
  }
  const personName = String(target.displayName || target.display_name || target.name || '').trim().toLowerCase();
  for (const name of EXTRA_PROTECTED_NAMES) {
    if (personName === name || personName.startsWith(`${name} `) || personName.endsWith(` ${name}`)) {
      throw new Error(`refused: protected person (${name})`);
    }
  }
  return target;
}

function ghToken() {
  if (process.env.VK_SUITE_NO_GITHUB === '1') return null;
  try {
    const tok = fs.readFileSync(TOKEN_FILE, 'utf8').trim() || null;
    if (tok) registerSecret(tok);
    return tok;
  } catch (error) {
    void error;
    return null;
  }
}

export async function gh(pathname, { method = 'GET', body, token = ghToken() } = {}) {
  if (!token) throw new Error('no GitHub credential file');
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'vk-customer-suite',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    void error;
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub ${method} ${pathname.split('?')[0]} -> ${res.status}`), {
      status: res.status,
      data,
    });
  }
  return data;
}

export function readState(file = STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    void error;
    return {};
  }
}

export function writeState(next, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${scrub(JSON.stringify(next, null, 2))}\n`);
}

export function scrub(text) {
  let out = String(text ?? '');
  for (const secret of SCRUB_SECRETS) {
    out = out.split(secret).join('<redacted>');
  }
  return out
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '<redacted-db-url>')
    .replace(/\b(gh[opsu]_[A-Za-z0-9]{20,}|vkm_[A-Za-z0-9_-]{12,}|sk_(?:live|test)_[A-Za-z0-9]+|pk_(?:live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9]{20,}|vercel_blob_rw_[A-Za-z0-9_]+)\b/g, '<redacted>')
    .replace(/session=[A-Za-z0-9_-]{12,}/gi, 'session=<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer <redacted>');
}

function readVercelDispatchIds() {
  const roots = [process.cwd(), path.join(HOME, 'tsv-dispatch')];
  for (const root of roots) {
    const file = path.join(root, 'tsv_dispatch.py');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const team = (text.match(/^VERCEL_TEAM_ID\s*=\s*['"](.*?)['"]/m) || [])[1] || '';
    const project = (text.match(/^STAGING_PROJECT_ID\s*=\s*['"](.*?)['"]/m) || [])[1] || '';
    if (team || project) return { team, project };
  }
  return { team: '', project: 'timesyncher-vacation-staging' };
}

async function fetchVercelStagingEnvValue(keyName) {
  const envVal = String(process.env[keyName] || '').trim();
  if (envVal) {
    registerSecret(envVal);
    return envVal;
  }
  const tokenFile = defaultVercelTokenFile();
  let vercelToken = String(process.env.VERCEL_TOKEN || '').trim();
  if (!vercelToken && fs.existsSync(tokenFile)) {
    vercelToken = fs.readFileSync(tokenFile, 'utf8').trim();
  }
  if (!vercelToken) return '';
  registerSecret(vercelToken);
  const { team, project } = readVercelDispatchIds();
  const projectId = String(process.env.VERCEL_PROJECT_ID || project || 'timesyncher-vacation-staging').trim();
  const teamId = String(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || team).trim();
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  const listRes = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env${q}`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!listRes.ok) return '';
  const listData = await listRes.json().catch(() => ({}));
  const row = (listData.envs || []).find((entry) => entry?.key === keyName);
  if (!row?.id) return '';
  const params = new URLSearchParams({ decrypt: 'true' });
  if (teamId) params.set('teamId', teamId);
  const valRes = await fetch(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(row.id)}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${vercelToken}` }, signal: AbortSignal.timeout(20000) },
  );
  if (!valRes.ok) return '';
  const valData = await valRes.json().catch(() => ({}));
  const value = String(valData?.value || '').trim().replace(/^"|"$/g, '');
  if (value) registerSecret(value);
  return value;
}

export async function loadStagingSecrets() {
  const roots = [process.cwd(), path.join(HOME, 'tsv-dispatch')];
  const dbResult = await loadStagingDatabaseUrl({ roots, env: process.env });
  const databaseUrl = String(dbResult?.url || '').trim();
  if (databaseUrl) registerSecret(databaseUrl);
  const adminToken = await fetchVercelStagingEnvValue('TIMESYNCHER_ADMIN_TOKEN');
  return {
    databaseUrl,
    databaseSource: dbResult?.source || '',
    adminToken,
  };
}
