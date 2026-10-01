#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../src/vacation/db.mjs';
import { createCoupon } from '../src/vacation/coupons.mjs';

const TIERS = new Set(['single', 'unlimited']);
const scriptPath = fileURLToPath(import.meta.url);

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) throw fail(`${flag} needs a value.`);
  return value;
}

function positiveInteger(value, flag) {
  if (!/^[1-9]\d*$/.test(String(value || ''))) throw fail(`${flag} must be a positive integer.`);
  return Number(value);
}

export function assertMintTier(tier) {
  if (tier == null || tier === '') return;
  if (!TIERS.has(tier)) throw fail('--tier must be single or unlimited.');
}

export function parseMintArgs(argv = []) {
  const opts = { count: 1, expires: null, tier: null, label: '', max: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--count') {
      opts.count = positiveInteger(takeValue(argv, index, flag), flag);
      index += 1;
    } else if (flag === '--expires') {
      opts.expires = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === '--tier') {
      opts.tier = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === '--label') {
      opts.label = takeValue(argv, index, flag);
      index += 1;
    } else if (flag === '--max') {
      opts.max = positiveInteger(takeValue(argv, index, flag), flag);
      index += 1;
    } else {
      throw fail(`Unknown argument ${flag}.`);
    }
  }
  assertMintTier(opts.tier);
  return opts;
}

export async function mintCheckoutCoupons(db, opts, env = process.env) {
  assertMintTier(opts?.tier);
  const count = positiveInteger(opts?.count, '--count');
  const max = positiveInteger(opts?.max, '--max');
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    const created = await createCoupon(db, {
      label: opts.label,
      maxRedemptions: max,
      expiresAt: opts.expires,
      metadata: opts.tier ? { plan: opts.tier } : {},
    }, env);
    codes.push(created.code);
  }
  return codes;
}

export async function runMint(argv, { db, env = process.env, print = console.log } = {}) {
  const opts = parseMintArgs(argv);
  const codes = await mintCheckoutCoupons(db, opts, env);
  for (const code of codes) print(code);
  return codes;
}

async function main() {
  await runMint(process.argv.slice(2), { db: sql(process.env) });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message || 'Unable to mint coupons.'}\n`);
    process.exit(error.statusCode && error.statusCode !== 400 ? error.statusCode : 1);
  });
}
