#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureWelcomeDatabase, WELCOME_DATABASE_MISSING } from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const skillPath = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs', import.meta.url));
const TOKEN = 're_test_verify_welcome_must_not_print';
const env = { ...process.env, VERCEL_TOKEN: TOKEN };
delete env.DATABASE_URL;
delete env.NEON_DATABASE_URL;

await assert.rejects(() => ensureWelcomeDatabase({ env: {} }), (error) => {
  assert.equal(error.message, WELCOME_DATABASE_MISSING);
  assert.equal(error.message.includes(TOKEN), false);
  return true;
});
const run = spawnSync(process.execPath, [skillPath, '--check'], { cwd: repo, env, encoding: 'utf8' });
assert.notEqual(run.status, 0);
assert.equal(run.stderr.includes(WELCOME_DATABASE_MISSING), true);
assert.equal(run.stderr.includes(TOKEN), false);
const skillSource = readFileSync(skillPath, 'utf8');
assert.equal(skillSource.includes('api.vercel.com'), false);
process.stdout.write('verify welcome missing DATABASE_URL test passed\n');
