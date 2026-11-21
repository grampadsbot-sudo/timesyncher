import fs from 'node:fs';
import path from 'node:path';
import { loadBannedHosts } from '../../harness/fetch-guard.mjs';
import { assertThrowaway } from '../../harness/protected.mjs';

export const ALLOWED_STAGING_ORIGIN = 'https://vacation-staging.timesyncher.com';

const EXTRA_PROTECTED_TERMS = ['santa barbara', 'santabarbara'];
const EXTRA_PROTECTED_NAMES = ['kim'];
const STRIPE_LIVE_RE = /\b(?:sk|pk|rk)_live_[A-Za-z0-9]{6,}/;

export function assertSsrTargetSafe(target = {}) {
  assertThrowaway(target);
  const originRaw = String(target.origin || ALLOWED_STAGING_ORIGIN).trim();
  const parsed = new URL(originRaw);
  if (parsed.origin !== ALLOWED_STAGING_ORIGIN) {
    throw new Error(`refused: SSR suite must target staging only (${ALLOWED_STAGING_ORIGIN}), got ${parsed.origin}`);
  }
  const fields = [
    target.destination,
    target.name,
    target.displayName,
    target.display_name,
    target.slug,
    target.publicSlug,
    target.shareToken,
    target.share_token,
    target.tripId,
    target.trip_id,
    target.email,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const value of fields) {
    for (const term of EXTRA_PROTECTED_TERMS) {
      if (value.includes(term)) throw new Error(`refused: protected destination/target (${term})`);
    }
    if (STRIPE_LIVE_RE.test(value)) {
      throw new Error('refused: Stripe live key is banned');
    }
  }

  const nameField = String(target.name || target.displayName || target.display_name || '').trim().toLowerCase();
  const emailLocal = String(target.email || '').trim().toLowerCase().split('@')[0] || '';
  for (const protectedName of EXTRA_PROTECTED_NAMES) {
    if (
      nameField === protectedName
      || nameField.startsWith(`${protectedName} `)
      || emailLocal === protectedName
      || emailLocal.startsWith(`${protectedName}.`)
      || emailLocal.startsWith(`${protectedName}+`)
    ) {
      throw new Error(`refused: protected account (${protectedName})`);
    }
  }
  return true;
}

export function assertNoOpenRouterInPath(files) {
  const bannedHosts = loadBannedHosts();
  const violations = [];
  for (const file of files) {
    const abs = path.resolve(file);
    const text = fs.readFileSync(abs, 'utf8');
    const lower = text.toLowerCase();
    for (const host of bannedHosts) {
      if (lower.includes(host)) violations.push({ file: abs, term: host });
    }
    if (/https?:\/\/[^\s'"]*openrouter/i.test(text)) {
      violations.push({ file: abs, term: 'openrouter-url' });
    }
    if (STRIPE_LIVE_RE.test(text)) {
      violations.push({ file: abs, term: 'stripe-live' });
    }
  }
  if (violations.length > 0) {
    throw new Error(`refused: banned provider/secret found: ${violations.map((v) => `${v.file}:${v.term}`).join(', ')}`);
  }
  return { ok: true, scanned: files.length };
}

export function assertCopyRules(texts) {
  for (const raw of texts) {
    const text = String(raw || '');
    if (/\btrips?\b/i.test(text)) {
      throw new Error(`refused: customer-facing copy must say vacation, never trip: ${text.slice(0, 80)}`);
    }
  }
  return true;
}
