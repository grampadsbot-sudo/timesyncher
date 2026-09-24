#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIALOG_TEST_FINGERPRINT, REPLY_RULES_SLUG } from './vacation-app-reply-rules.mjs';

const dispatchPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'product-gbrain-dispatch.mjs');

function fail(error, extra = {}) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error,
    fingerprint: null,
    customerResponse: extra.customerResponse || '',
    source: 'product-gbrain-dispatch',
    mode: 'TIMESYNCHER_DIALOG_TEST_MODE=1',
    shared_skill_slug: REPLY_RULES_SLUG,
    ...extra,
  })}\n`);
  process.exit(extra.exitCode || 2);
}

function looksLikeOpenRouter(value) {
  return /openrouter/i.test(String(value || ''));
}

function assertNotPointedAtOpenRouter(argv, input) {
  if (argv.some((arg) => looksLikeOpenRouter(arg))) {
    fail('refused: harness will not call OpenRouter');
  }
  const replyKeys = ['provider', 'reply_provider', 'model_provider', 'url', 'reply_url', 'model_url', 'base_url'];
  for (const key of replyKeys) {
    if (looksLikeOpenRouter(input?.[key])) fail('refused: harness input points at OpenRouter');
  }
  for (const key of ['TIMESYNCHER_DIALOG_REPLY_URL', 'TIMESYNCHER_SHARED_REPLY_URL', 'TIMESYNCHER_MODEL_REPLY_URL', 'TIMESYNCHER_TIERED_MODEL_URL']) {
    if (looksLikeOpenRouter(process.env[key])) fail(`refused: ${key} points at OpenRouter`);
  }
}

function readStdin() {
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8');
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--generative') out.reply_mode = 'generative';
    else if (arg === '--customer-turn') out.customer_turn = argv[++index];
    else if (arg === '--seed') out.seed_id = argv[++index];
    else if (arg === '--stage') out.app_stage = argv[++index];
    else if (arg === '--screen') out.screen = argv[++index];
    else if (arg === '--gate') out.gate = argv[++index];
    else if (!arg.startsWith('--') && !out.customer_turn) out.customer_turn = arg;
  }
  return out;
}

function parseInput(argv, stdin) {
  const fromArgv = parseArgs(argv);
  let fromStdin = {};
  const raw = String(stdin || '').trim();
  if (raw) {
    try {
      fromStdin = JSON.parse(raw);
    } catch {
      fromStdin = { customer_turn: raw };
    }
  }
  return { ...fromStdin, ...fromArgv };
}

const argv = process.argv.slice(2);
const input = parseInput(argv, readStdin());
assertNotPointedAtOpenRouter(argv, input);

const customerTurn = String(input.customer_turn || input.request_text || '').trim();
if (!customerTurn) fail('customer_turn is required');

const job = {
  customer_turn: customerTurn,
  request_text: customerTurn,
  seed_id: input.seed_id || input.seedId || undefined,
  reply_mode: input.reply_mode || undefined,
  app_stage: input.app_stage || input.stage || undefined,
  screen: input.screen || undefined,
  gate: input.gate || undefined,
};

const child = spawnSync(process.execPath, [dispatchPath], {
  input: JSON.stringify(job),
  encoding: 'utf8',
  env: { ...process.env, TIMESYNCHER_DIALOG_TEST_MODE: '1' },
  maxBuffer: 8 * 1024 * 1024,
});

let parsed = null;
try {
  parsed = JSON.parse(String(child.stdout || '').trim());
} catch {
  fail(String(child.stderr || child.stdout || 'producer returned non-JSON').trim().slice(0, 800), { exitCode: child.status || 1 });
}

const shared = parsed.sharedReply || {};
const customerResponse = String(parsed.customerResponse || '');
const phrase = shared.smoke_bar_phrase || '';
const generative = job.reply_mode === 'generative';
const stamped = customerResponse.includes(DIALOG_TEST_FINGERPRINT) && phrase && customerResponse.includes(phrase);
const generativeReady = !generative || (shared.jevRan === true && shared.modelTier != null && shared.responseModel);
const ok = child.status === 0 && shared.ok !== false && stamped && generativeReady;

process.stdout.write(`${JSON.stringify({
  ok,
  fingerprint: customerResponse.includes(DIALOG_TEST_FINGERPRINT) ? DIALOG_TEST_FINGERPRINT : null,
  customerResponse,
  source: 'product-gbrain-dispatch',
  mode: 'TIMESYNCHER_DIALOG_TEST_MODE=1',
  shared_skill_slug: shared.slug || REPLY_RULES_SLUG,
  rules_via: shared.via || null,
  smoke_bar_id: shared.smoke_bar_id || null,
  smoke_bar_phrase: phrase || null,
  pipeline: shared.pipeline || null,
  replySource: shared.replySource || null,
  jevRan: shared.jevRan === true,
  jevVia: shared.jevVia || null,
  modelTier: shared.modelTier ?? null,
  responseModel: shared.responseModel ?? null,
  modelVia: shared.modelVia || null,
  jevError: shared.jevError || null,
  modelReason: shared.modelReason || null,
  seed_id: job.seed_id || null,
})}\n`);
process.exit(ok ? 0 : 1);
