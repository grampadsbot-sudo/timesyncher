#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { couponHash, createCoupon } from '../src/vacation/coupons.mjs';
import { blockedTarget } from './host/vk_ship_round_core.mjs';

export const SEED_LABEL = 'VK harness roster test coupon';
export const SEED_COUNT = 100;

export function rosterCodes(count = SEED_COUNT) {
  return Array.from({ length: count }, (_, index) => `VK-TEST-${String(index + 1).padStart(3, '0')}`);
}

export function assertStagingSeed(env = process.env, argv = []) {
  if (!argv.includes('--staging')) throw new Error('refused: pass --staging (seed is staging only)');
  if (String(env.HARNESS_LIVE || '') !== '1') throw new Error('refused: HARNESS_LIVE=1 is required');
  if (String(env.HARNESS_COUPON_SEED_TARGET || '') !== 'staging') throw new Error('refused: HARNESS_COUPON_SEED_TARGET=staging is required');
  if (/^prod/i.test(String(env.VERCEL_ENV || '')) || /^prod/i.test(String(env.NODE_ENV || ''))) throw new Error('refused: production environment');
  const url = String(env.DATABASE_URL || env.NEON_DATABASE_URL || '');
  if (!url) throw new Error('refused: DATABASE_URL is required');
  const hit = blockedTarget(url);
  if (hit) throw new Error(`refused: ${hit}`);
  if (/\b(?:craig|santa[-_]?barbara)\b/i.test(url)) throw new Error('refused: protected-target');
  if (!String(env.TIMESYNCHER_COUPON_HASH_SALT || env.TIMESYNCHER_AUDIT_HASH_SALT || '').trim()) {
    throw new Error('refused: TIMESYNCHER_COUPON_HASH_SALT is required for staging seed');
  }
}

function harnessOwned(row) {
  return row?.metadata && typeof row.metadata === 'object' && row.metadata.harness === 'vk-roster';
}

export async function seedVkTestCoupons(db, { rearm = false, env = process.env, count = SEED_COUNT } = {}) {
  const report = { created: [], existing: [], rearmed: [], refused: [] };
  for (const [index, code] of rosterCodes(count).entries()) {
    const hash = couponHash(code, env);
    const rows = await db`select id, status, redemption_count, max_redemptions, metadata from checkout_coupons where code_hash = ${hash} limit 1`;
    const row = rows[0];
    if (!row) {
      await createCoupon(db, { code, label: SEED_LABEL, maxRedemptions: 1, metadata: { harness: 'vk-roster', roster_id: index + 1, plan: 'single' } }, env);
      report.created.push(code);
      continue;
    }
    if (!harnessOwned(row)) {
      report.refused.push(code);
      continue;
    }
    const used = Number(row.redemption_count || 0) > 0 || row.status !== 'active';
    if (rearm && used) {
      await db`update checkout_coupons set redemption_count = 0, status = 'active', updated_at = now() where id = ${row.id} and metadata->>'harness' = 'vk-roster'`;
      report.rearmed.push(code);
    } else {
      report.existing.push(code);
    }
  }
  return report;
}

function summary(report) {
  return JSON.stringify({ created: report.created.length, existing: report.existing.length, rearmed: report.rearmed.length, refused: report.refused });
}

async function main(argv) {
  if (argv.includes('--dry')) {
    const codes = rosterCodes();
    process.stdout.write(`${JSON.stringify({ dry: true, would_ensure: codes.length, first: codes[0], last: codes[codes.length - 1], max_redemptions: 1, plan: 'single', label: SEED_LABEL, rearm: argv.includes('--rearm') })}\n`);
    return 0;
  }
  assertStagingSeed(process.env, argv);
  const { sql } = await import('../src/vacation/db.mjs');
  const report = await seedVkTestCoupons(sql(process.env), { rearm: argv.includes('--rearm') });
  process.stdout.write(`${summary(report)}\n`);
  return report.refused.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${String(error?.message || error).replace(/postgres(ql)?:\/\/\S+/gi, '[database-url]')}\n`);
    process.exit(2);
  });
}
