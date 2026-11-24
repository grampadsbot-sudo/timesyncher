#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultRunRoot, hostEnvReady, httpHarnessEnv } from './harness/env.mjs';
import { harnessTag } from './harness/protected.mjs';

function value(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : String(process.argv[index + 1] || '');
}

const has = (flag) => process.argv.includes(flag);
const root = fileURLToPath(new URL('..', import.meta.url));
const runId = value('--run-id');
const storyId = value('--story-id');

const rosterMode = ['--roster', '--customer', '--wave-size', '--ramp', '--dry', '--stories-dir'].some((flag) => process.argv.includes(flag));

if (has('--cleanup-only')) {
  if (!hostEnvReady()) {
    process.stderr.write('HOST ONLY: DATABASE_URL\n');
    process.exit(1);
  }
  const { deleteTaggedRows } = await import('./harness/cleanup.mjs');
  const { sql } = await import('../src/vacation/db.mjs');
  const result = await deleteTaggedRows(sql(process.env), harnessTag(runId, storyId));
  process.stdout.write(`${JSON.stringify({ remaining: result.remaining })}\n`);
  process.exit(result.remaining === 0 ? 0 : 1);
}

if (!runId) {
  process.stderr.write('refused: --run-id is required\n');
  process.exit(2);
}

function stagingLiveEnv() {
  const prepared = httpHarnessEnv(process.env);
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  delete process.env.OPENROUTER_API_KEY;
  process.env.HARNESS_LIVE = prepared.env.HARNESS_LIVE;
  process.env.HARNESS_STAGING_ORIGIN = prepared.origin;
  process.env.TIMESYNCHER_TRAVEL_BASE_URL = prepared.origin;
  return prepared.env;
}

async function liveHarnessOptions() {
  if (hostEnvReady()) return (await import('./harness/runtime.mjs')).liveOptions(process.env);
  stagingLiveEnv();
  return (await import('./harness/http-live.mjs')).httpLiveOptions(process.env);
}

if (rosterMode) {
  const dry = has('--dry');
  const { runRosterCli } = await import('./harness/roster-cli.mjs');
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  try {
    const result = await runRosterCli(process.argv, {
      outRoot: value('--out-root') || defaultRunRoot(),
      liveOptions: dry ? null : await liveHarnessOptions(),
      buildSha: String(sha.stdout || '').trim(),
    });
    if (String(result.reason || '').includes('host-only-database')) process.stderr.write('HOST ONLY: DATABASE_URL\n');
    process.exit(result.stopped_at == null ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exit(2);
  }
}

const { loadStorySchema, validateStory, validateWave } = await import('./harness/schema.mjs');
const { runWave } = await import('./harness/wave.mjs');
const schema = loadStorySchema();
let stories = [];
if (value('--wave')) {
  const parsed = JSON.parse(fs.readFileSync(value('--wave'), 'utf8'));
  const errors = validateWave(parsed, schema);
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exit(2);
  }
  stories = parsed;
} else if (value('--story')) {
  const parsed = JSON.parse(fs.readFileSync(value('--story'), 'utf8'));
  const errors = validateStory(parsed, schema);
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exit(2);
  }
  stories = [parsed];
} else {
  process.stderr.write('refused: pass --story or --wave\n');
  process.exit(2);
}

const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const ssrFile = value('--ssr-reactions');
const ssrReactions = ssrFile ? JSON.parse(fs.readFileSync(ssrFile, 'utf8')) : null;
const ssrHook = ssrReactions ? (await import('./customer_suite/ssr/hooks.mjs')).createHarnessSsrHook({ reactionsByStory: ssrReactions }) : null;
const result = await runWave(stories, {
  ...(await liveHarnessOptions()),
  runId,
  outRoot: value('--out-root') || defaultRunRoot(),
  concurrency: value('--concurrency') || 1,
  continueOnFail: has('--continue-on-fail'),
  keep: has('--keep'),
  buildSha: String(sha.stdout || '').trim(),
  ...(ssrHook ? { ssrHook } : {}),
});
const failed = result.cards.some((card) => card.verdict !== 'PASS');
process.stdout.write(`${JSON.stringify({ run_id: runId, stories: result.cards.length, failed })}\n`);
process.exit(failed ? 1 : 0);
