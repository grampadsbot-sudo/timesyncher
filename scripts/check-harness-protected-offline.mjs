#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptsDir = process.env.HARNESS_PROTECTED_SCRIPTS_DIR
  || fileURLToPath(new URL('./', import.meta.url));
const repoRoot = process.env.HARNESS_PROTECTED_REPO_ROOT
  || fileURLToPath(new URL('..', import.meta.url));
const listPath = `${scriptsDir}/harness-protected-offline.txt`;
const offlinePath = `${scriptsDir}/offline-tests.txt`;
const scorecardRun = `${scriptsDir}/passb-scorecard-run.mjs`;

function lines(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

const protectedPaths = lines(readFileSync(listPath, 'utf8'));
const offline = new Set(lines(readFileSync(offlinePath, 'utf8')));
const failures = [];

for (const file of protectedPaths) {
  const abs = `${repoRoot}/${file.replace(/^scripts\//, 'scripts/')}`;
  if (!existsSync(abs)) failures.push(`missing protected file: ${file}`);
  if (!offline.has(file)) failures.push(`protected test not in offline-tests.txt: ${file}`);
}

if (!existsSync(scorecardRun)) failures.push('missing scripts/passb-scorecard-run.mjs');
const pkg = JSON.parse(readFileSync(`${repoRoot}/package.json`, 'utf8'));
if (!pkg.scripts?.['test:passb-scorecard']) {
  failures.push('package.json missing test:passb-scorecard script');
}

if (failures.length) {
  console.error('check-harness-protected-offline: FAIL');
  for (const row of failures) console.error(row);
  process.exit(1);
}
console.log(`check-harness-protected-offline: ok (${protectedPaths.length} protected)`);
