#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const problems = [];
let tab = '';
try {
  tab = execFileSync('crontab', ['-l'], { encoding: 'utf8' });
} catch (error) {
  void error;
  problems.push('no crontab for this user');
}

const lines = tab
  .split('\n')
  .filter((line) => line.includes('# vk-customer-suite') && !line.trim().startsWith('#'));
const every2h = lines.find((line) => /^0 \*\/2 \* \* \* /.test(line) && /\/cron\.sh scheduled /.test(line));
const hook = lines.find((line) => /^\*\/5 \* \* \* \* /.test(line) && /\/cron\.sh deploy-watch /.test(line));
if (!every2h) problems.push('missing every-2-hours line (0 */2 * * * ... cron.sh scheduled)');
if (!hook) problems.push('missing post-deploy hook line (*/5 * * * * ... cron.sh deploy-watch)');

for (const line of [every2h, hook].filter(Boolean)) {
  const script = line.split(/\s+/)[5];
  if (!fs.existsSync(script)) problems.push(`cron script missing: ${script}`);
  else if (!(fs.statSync(script).mode & 0o111)) problems.push(`cron script not executable: ${script}`);
}

let hookCheck = null;
try {
  const raw = execFileSync('node', [path.join(DIR, 'deploy-watch.mjs'), '--check'], {
    encoding: 'utf8',
    timeout: 50000,
  });
  hookCheck = JSON.parse(raw.trim().split('\n').at(-1));
  if (!hookCheck?.sha) problems.push(`post-deploy hook saw no staging sha: ${hookCheck?.decision || 'unknown'}`);
} catch (error) {
  problems.push(`deploy-watch --check failed: ${String(error?.message || error).slice(0, 160)}`);
}

console.log(JSON.stringify({
  row: 'c9-host-cron',
  ok: problems.length === 0,
  crontab: { every2h: every2h || null, postDeployHook: hook || null },
  hookCheck,
  problems,
}, null, 2));
process.exit(problems.length ? 1 : 0);
