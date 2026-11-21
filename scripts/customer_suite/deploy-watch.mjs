import fs from 'node:fs';
import path from 'node:path';
import { ROOT, servedBuild, writeJson } from './staging.mjs';
import { runPreflight } from './preflight.mjs';

const state = path.join(ROOT, 'last-deploy-preflight.json');
const lastSha = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')).sha : null;
const sha = await servedBuild();
const force = process.argv.includes('--post-deploy');
const pending = force || sha !== lastSha;
console.log(JSON.stringify({ sha, pending, mode: 'staging deployment preflight' }));

if (pending && !process.argv.includes('--check')) {
  const result = await runPreflight({ trigger: 'deploy', expectedSha: sha });
  if (result.verifiedSha !== sha) process.exitCode = 1;
  else writeJson(state, { sha, run: result.run, finishedAt: result.finishedAt });
  console.log(JSON.stringify({ run: result.run, status: result.status, dir: result.dir }));
}
