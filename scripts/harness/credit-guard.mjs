import fs from 'node:fs';

const CREDIT_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;
const DEFAULT_RESERVE_USD = 1;

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function readCreditSnapshot(env = process.env, now = Date.now()) {
  const file = String(env.HARNESS_OPENROUTER_CREDITS_FILE || '').trim();
  if (!file) return { ok: false, reason: 'credit-unknown', detail: 'HARNESS_OPENROUTER_CREDITS_FILE is not set' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'credit-unknown', detail: 'credit snapshot file is missing or not JSON' };
  }
  const total = money(parsed?.total_credits);
  const used = money(parsed?.total_usage);
  const asOf = Date.parse(String(parsed?.as_of || ''));
  if (total == null || used == null) return { ok: false, reason: 'credit-unknown', detail: 'credit snapshot lacks total_credits/total_usage' };
  if (!Number.isFinite(asOf) || now - asOf > CREDIT_SNAPSHOT_MAX_AGE_MS || asOf - now > 60000) {
    return { ok: false, reason: 'credit-unknown', detail: 'credit snapshot is stale' };
  }
  return { ok: true, remaining: total - used, total, used, as_of: new Date(asOf).toISOString() };
}

export function creditHeadroom({ snapshot, customers, projectedPerCustomer, spentSoFar = 0, env = process.env }) {
  if (!snapshot?.ok) return { ok: false, reason: snapshot?.reason || 'credit-unknown', detail: snapshot?.detail || 'no credit snapshot' };
  const perCustomer = money(projectedPerCustomer) ?? money(env.HARNESS_REPLY_DOLLARS_PER_CUSTOMER);
  if (perCustomer == null || perCustomer < 0) return { ok: false, reason: 'credit-unknown', detail: 'no $/customer projection (measure a wave or set HARNESS_REPLY_DOLLARS_PER_CUSTOMER)' };
  const reserveRaw = money(env.HARNESS_OPENROUTER_RESERVE_USD);
  const reserve = reserveRaw != null && reserveRaw >= 0 ? reserveRaw : DEFAULT_RESERVE_USD;
  const left = snapshot.remaining - Number(spentSoFar || 0);
  const need = perCustomer * Number(customers || 0) + reserve;
  if (left < need) {
    return { ok: false, reason: 'credit-cap', detail: `remaining $${left.toFixed(2)} < projected $${(perCustomer * customers).toFixed(2)} + reserve $${reserve.toFixed(2)}` };
  }
  return { ok: true, remaining: left, need, reserve, per_customer: perCustomer };
}
