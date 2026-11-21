#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cron = fileURLToPath(new URL('./cron.sh', import.meta.url));
const tab = execFileSync('crontab', ['-l'], { encoding: 'utf8' });
const lines = tab.split('\n').filter((line) => line.endsWith('# vk-customer-suite-1075'));
const scheduled = lines.find((line) => line.startsWith(`0 */2 * * * bash "${cron}" scheduled `));
const deploymentWatch = lines.find((line) => line.startsWith(`*/5 * * * * bash "${cron}" deploy-watch `));
const watch = fileURLToPath(new URL('./deploy-watch.mjs', import.meta.url));
const check = JSON.parse(execFileSync(process.execPath, [watch, '--check'], { encoding: 'utf8', timeout: 30_000 }));
const wiring = Boolean(scheduled && deploymentWatch && check.sha);
console.log(JSON.stringify({
  row: 'c9-host-cron', ok: false, wiring,
  scheduled: scheduled || null, deploymentWatch: deploymentWatch || null,
  postDeploy: `bash "${cron}" post-deploy`, sha: check.sha,
  detail: 'Host cron can run the staging browser preflight. C9 requires the full customer suite.',
}, null, 2));
process.exitCode = 1;
