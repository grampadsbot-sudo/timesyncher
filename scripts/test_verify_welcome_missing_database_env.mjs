#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureWelcomeDatabase,
  WELCOME_DATABASE_MISSING,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs';

const scriptPath = fileURLToPath(new URL('./verify-welcome-after-intake.mjs', import.meta.url));
const skillPath = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

const TOKEN = 're_test_verify_welcome_must_not_print';

function baseEnv() {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.NEON_DATABASE_URL;
  env.VERCEL_TOKEN = TOKEN;
  return env;
}

await assert.rejects(
  () => ensureWelcomeDatabase({ env: {} }),
  (error) => {
    assert.equal(error.message, WELCOME_DATABASE_MISSING);
    assert.equal(error.exitCode, 1);
    assert.equal(error.message.includes('VERCEL_TOKEN'), true);
    assert.equal(error.message.includes(TOKEN), false);
    return true;
  },
);

const wrapper = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: repo, env: baseEnv(), encoding: 'utf8' });
assert.notEqual(wrapper.status, 0);
assert.equal(wrapper.stderr.includes(WELCOME_DATABASE_MISSING), true);
assert.equal(wrapper.stderr.includes('DATABASE_URL'), true);
assert.equal(wrapper.stderr.includes(TOKEN), false);
assert.equal(wrapper.stderr.includes('api.vercel.com'), false);

const skill = spawnSync(process.execPath, [skillPath, '--check'], { cwd: repo, env: baseEnv(), encoding: 'utf8' });
assert.notEqual(skill.status, 0);
assert.equal(skill.stderr.includes(WELCOME_DATABASE_MISSING), true);
assert.equal(skill.stderr.includes(TOKEN), false);

const skillSource = await import('node:fs').then((fs) => fs.readFileSync(skillPath, 'utf8'));
assert.equal(skillSource.includes('api.vercel.com'), false);
assert.equal(/env\.VERCEL_TOKEN|process\.env\.VERCEL_TOKEN/.test(skillSource), false);

process.stdout.write('verify welcome missing DATABASE_URL test passed\n');
