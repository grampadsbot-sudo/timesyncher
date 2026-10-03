#!/usr/bin/env node
/**
 * Repo entry for onboarding welcome verify (implementation lives in the verify skill).
 * Requires DATABASE_URL in the environment; does not call the Vercel API.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-welcome-after-intake.mjs', import.meta.url));
const child = spawnSync(process.execPath, [target, ...process.argv.slice(2)], {
  env: process.env,
  encoding: 'utf8',
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
process.exit(child.status === null ? 1 : child.status);
