#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deleteTaggedRows } from './harness/cleanup.mjs';
import { defaultRunRoot, hostEnvReady } from './harness/env.mjs';
import { harnessTag } from './harness/protected.mjs';
import { liveOptions } from './harness/runtime.mjs';
import { loadStorySchema, validateStory, validateWave } from './harness/schema.mjs';
import { runWave } from './harness/wave.mjs';
import { isRosterMode, runRosterCli } from './harness/roster-cli.mjs';
import { createHarnessSsrHook } from './customer_suite/ssr/hooks.mjs';

function value(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : String(process.argv[index + 1] || '');
}

const has = (flag) => process.argv.includes(flag);
const root = fileURLToPath(new URL('..', import.meta.url));
const runId = value('--run-id');
const storyId = value('--story-id');

if (has('--cleanup-only')) {
  if (!hostEnvReady()) {
    process.stderr.write('refused: host env absent (DATABASE_URL and HARNESS_LIVE=1). Cleanup was not executed.\n');
    process.exit(1);
  }
  const { sql } = await import('../src/vacation/db.mjs');
  const result = await deleteTaggedRows(sql(process.env), harnessTag(runId, storyId));
  process.stdout.write(`${JSON.stringify({ remaining: result.remaining })}\n`);
  process.exit(result.remaining === 0 ? 0 : 1);
}

if (!runId) {
  process.stderr.write('refused: --run-id is required\n');
  process.exit(2);
}

if (isRosterMode(process.argv)) {
  const dry = has('--dry');
  if (!dry && !hostEnvReady()) {
    process.stderr.write('SKIP harness: host env absent (DATABASE_URL and HARNESS_LIVE=1). Live run was not executed.\n');
    process.exit(1);
  }
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  try {
    const result = await runRosterCli(process.argv, {
      outRoot: value('--out-root') || defaultRunRoot(),
      liveOptions: dry ? null : liveOptions(process.env),
      buildSha: String(sha.stdout || '').trim(),
    });
    process.exit(result.stopped_at == null ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exit(2);
  }
}

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

if (!hostEnvReady()) {
  process.stderr.write('SKIP harness: host env absent (DATABASE_URL and HARNESS_LIVE=1). Live run was not executed.\n');
  process.exit(1);
}

const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const ssrFile = value('--ssr-reactions');
const ssrReactions = ssrFile ? JSON.parse(fs.readFileSync(ssrFile, 'utf8')) : null;
const result = await runWave(stories, {
  ...liveOptions(process.env),
  runId,
  outRoot: value('--out-root') || defaultRunRoot(),
  concurrency: value('--concurrency') || 1,
  continueOnFail: has('--continue-on-fail'),
  keep: has('--keep'),
  buildSha: String(sha.stdout || '').trim(),
  ...(ssrReactions ? { ssrHook: createHarnessSsrHook({ reactionsByStory: ssrReactions }) } : {}),
});
const failed = result.cards.some((card) => card.verdict !== 'PASS');
process.stdout.write(`${JSON.stringify({ run_id: runId, stories: result.cards.length, failed })}\n`);
process.exit(failed ? 1 : 0);
