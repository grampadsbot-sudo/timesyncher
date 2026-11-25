import { existsSync, readFileSync } from 'node:fs';
import { isSpendLimitReason } from '../harness/backends.mjs';
import { DRY_RUN_KEY_DAILY_CAP_USD } from '../harness/cost.mjs';
import { PULLED_ENV_FILES, defaultVercelTokenFile } from './vk_ship_dry_env.mjs';

const KEY_URL = 'https://openrouter.ai/api/v1/key';
const KEY_NAMES = ['OPENROUTER_API_KEY', 'TIMESYNCHER_OPENROUTER_API_KEY'];
const PROJECT = 'timesyncher-vacation-staging';
const RESET_RE = /resets\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i;
const QUOTA_TEXT_RE = /key limit exceeded|\bquota\b|payment required|credit exhausted|\b(?:daily|monthly|weekly) limit\b|limit_remaining|credits?[_ ]required/i;

export const DRY_RUN_COST_FLOOR_USD = 0.25;

export function customerBudgetUsd(measured) {
  const amount = Number(measured);
  if (Number.isFinite(amount) && amount > 0) return amount;
  return DRY_RUN_COST_FLOOR_USD;
}

export function keyLimitReason(resetAt) {
  const when = String(resetAt || '').trim();
  return when ? `blocked: env key-limit resets ${when}` : 'blocked: env key-limit';
}

function finite(value) {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function isoInstant(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

export function nextQuotaReset(kind, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return '';
  const name = String(kind || '').trim().toLowerCase();
  if (name === 'daily') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
  }
  if (name === 'weekly') {
    const day = date.getUTCDay();
    const add = (8 - day) % 7 || 7;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + add)).toISOString();
  }
  if (name === 'monthly') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
  }
  return '';
}

export function parseKeyPayload(payload, now = new Date()) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const budget = data.effective_budget && typeof data.effective_budget === 'object' ? data.effective_budget : null;
  const limit = finite(data.limit) ?? finite(budget?.limit_usd);
  let remaining = finite(data.limit_remaining);
  if (remaining == null) remaining = finite(budget?.remaining_usd);
  if (remaining == null && limit != null) {
    const usage = finite(data.usage_daily) ?? finite(budget?.spend_usd) ?? finite(data.usage);
    if (usage != null) remaining = limit - usage;
  }
  const resetAt = isoInstant(budget?.resets_at) || nextQuotaReset(data.limit_reset || budget?.reset_interval, now);
  return { limit, remaining, resetAt };
}

function quotaBlob(card) {
  const parts = [];
  for (const turn of card?.turns || []) parts.push(turn?.gap, turn?.app_error);
  const http = card?.turn_http;
  parts.push(http?.body?.error, http?.body?.message, http?.body?.reason);
  if (http?.body?.error && typeof http.body.error === 'object') parts.push(http.body.error.message);
  for (const check of card?.checks || []) parts.push(check?.detail);
  return parts.filter((part) => part != null && part !== '').map(String).join(' ');
}

function quotaStatus(card) {
  const http = card?.turn_http || {};
  const code = Number(http.post_status ?? http.status);
  return Number.isFinite(code) ? code : 0;
}

export function resetFromQuotaText(text) {
  const match = String(text || '').match(RESET_RE);
  return match ? isoInstant(match[1]) : '';
}

export function providerQuotaReason(card) {
  const text = quotaBlob(card);
  const status = quotaStatus(card);
  const named = isSpendLimitReason(card?.reason);
  const httpQuota = status === 402 || (status === 429 && QUOTA_TEXT_RE.test(text));
  if (!named && !httpQuota) return '';
  return keyLimitReason(resetFromQuotaText(text));
}

export function dryRunQuotaGate(quota, measuredPerCustomer) {
  if (!quota || quota.block) return { skip: true, reason: quota?.block || 'blocked: env key-quota unread' };
  const needed = customerBudgetUsd(measuredPerCustomer);
  if (quota.limited === true && Number(quota.remaining) < needed) {
    return { skip: true, reason: keyLimitReason(quota.resetAt), needed };
  }
  return { skip: false, needed };
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

function keyFromText(text) {
  for (const name of KEY_NAMES) {
    const value = envAssignment(text, name);
    if (value) return value;
  }
  return '';
}

function keyFromEnv(env) {
  for (const name of KEY_NAMES) {
    const value = String(env?.[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function readTrimmed(file, readFile, exists) {
  if (!file || !exists?.(file)) return '';
  try { return String(readFile(file) || '').trim(); } catch { return ''; }
}

function pythonConstant(text, name) {
  const match = String(text || '').match(new RegExp(`^${name}\\s*=\\s*(['"])(.*?)\\1`, 'm'));
  return match ? match[2].trim() : '';
}

function dispatchIds(roots, readFile) {
  for (const root of roots || []) {
    if (!root) continue;
    let text = '';
    try { text = readFile(`${String(root).replace(/\/$/, '')}/tsv_dispatch.py`); } catch { text = ''; }
    const team = pythonConstant(text, 'VERCEL_TEAM_ID');
    const project = pythonConstant(text, 'STAGING_PROJECT_ID');
    if (team || project) return { team, project };
  }
  return { team: '', project: '' };
}

function keyFromFiles(roots, readFile) {
  for (const root of roots || []) {
    if (!root) continue;
    for (const rel of PULLED_ENV_FILES) {
      let text = '';
      try { text = readFile(`${String(root).replace(/\/$/, '')}/${rel}`); } catch { text = ''; }
      const key = keyFromText(text);
      if (key) return key;
    }
  }
  return '';
}

async function keyFromVercel({ env, roots, readFile, exists, fetchImpl, tokenFile }) {
  const token = String(env?.VERCEL_TOKEN || '').trim() || readTrimmed(tokenFile, readFile, exists);
  if (!token || !fetchImpl) return '';
  const dispatch = dispatchIds(roots, readFile);
  const team = String(env?.VERCEL_ORG_ID || env?.VERCEL_TEAM_ID || '').trim() || dispatch.team;
  const project = String(env?.VERCEL_PROJECT_ID || '').trim() || dispatch.project || PROJECT;
  const query = team ? `?teamId=${encodeURIComponent(team)}` : '';
  const headers = { Authorization: `Bearer ${token}` };
  let list;
  try {
    list = await fetchImpl(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}/env${query}`, { headers, redirect: 'error' });
  } catch {
    return '';
  }
  if (!list?.ok) return '';
  let payload;
  try { payload = await list.json(); } catch { return ''; }
  const rows = Array.isArray(payload?.envs) ? payload.envs : [];
  const found = KEY_NAMES.map((name) => rows.find((row) => row?.key === name)).find(Boolean);
  if (!found?.id) return '';
  const params = new URLSearchParams({ decrypt: 'true' });
  if (team) params.set('teamId', team);
  let got;
  try {
    got = await fetchImpl(
      `https://api.vercel.com/v1/projects/${encodeURIComponent(project)}/env/${encodeURIComponent(found.id)}?${params}`,
      { headers, redirect: 'error' },
    );
  } catch {
    return '';
  }
  if (!got?.ok) return '';
  let body;
  try { body = await got.json(); } catch { return ''; }
  if (body?.key && !KEY_NAMES.includes(body.key)) return '';
  return String(body?.value || '').trim().replace(/^"|"$/g, '');
}

function publicQuota(fields) {
  return {
    limited: fields.limited === true,
    remaining: fields.remaining ?? null,
    limit: fields.limit ?? null,
    resetAt: fields.resetAt || '',
    block: fields.block || '',
    secret: fields.secret || '',
  };
}

export async function readDryRunKeyQuota({
  env = {},
  roots = [],
  readFile = (file) => readFileSync(file, 'utf8'),
  exists = existsSync,
  fetchImpl = fetch,
  tokenFile = defaultVercelTokenFile(),
  now = new Date(),
} = {}) {
  let secret = keyFromEnv(env) || keyFromFiles(roots, readFile);
  if (!secret) secret = await keyFromVercel({ env, roots, readFile, exists, fetchImpl, tokenFile });
  if (!secret) return publicQuota({ block: 'blocked: env key-quota unread' });
  let response;
  try {
    response = await fetchImpl(KEY_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
    });
  } catch {
    return publicQuota({ block: 'blocked: env key-quota unread', secret });
  }
  const status = Number(response?.status) || (response?.ok ? 200 : 0);
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (status === 402 || status === 429) {
    const parsed = parseKeyPayload(payload, now);
    return publicQuota({ limited: true, remaining: 0, limit: parsed.limit, resetAt: parsed.resetAt, secret });
  }
  if (!response?.ok) return publicQuota({ block: 'blocked: env key-quota unread', secret });
  const parsed = parseKeyPayload(payload, now);
  if (parsed.limit == null && parsed.remaining == null) {
    return publicQuota({ limited: false, resetAt: parsed.resetAt, secret });
  }
  if (parsed.remaining == null) return publicQuota({ block: 'blocked: env key-quota unread', secret });
  return publicQuota({
    limited: true,
    remaining: parsed.remaining,
    limit: parsed.limit ?? DRY_RUN_KEY_DAILY_CAP_USD,
    resetAt: parsed.resetAt,
    secret,
  });
}
