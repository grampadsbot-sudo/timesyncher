#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS, STAGING, servedBuild } from './staging.mjs';

const expected = Array.from({ length: 8 }, (_, index) => `s${index + 1}`);
const sha = await servedBuild();
const runs = fs.existsSync(RESULTS) ? fs.readdirSync(RESULTS).flatMap((name) => {
  try {
    const result = JSON.parse(fs.readFileSync(path.join(RESULTS, name, 'results.json'), 'utf8'));
    return result.suite === 'vk-customer-suite' && result.full === true ? [result] : [];
  } catch {
    return [];
  }
}).sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt)).slice(0, 2) : [];

function green(run) {
  if (run.status !== 'green' || run.target !== STAGING || run.sha !== sha || run.verifiedSha !== sha) return false;
  const cleanup = run.cleanup;
  if (!cleanup || cleanup.accountsCreated < 1 || cleanup.accountsCreated !== cleanup.accountsDeleted
    || cleanup.vacationsCreated < 1 || cleanup.vacationsCreated !== cleanup.vacationsDeleted) return false;
  return expected.every((id) => {
    const row = run.checks?.find((item) => item.id === id);
    if (id === 's8' && row?.status === 'skip') return row.reason === 'keepsake control absent';
    return row?.status === 'pass' && [390, 1280].every((width) => row.evidence?.some((item) => item.width === width
      && item.screenshot && fs.existsSync(item.screenshot) && item.assertions?.length && item.assertions.every((a) => a.pass)));
  });
}

const evidence = runs.map((run) => ({ run: run.run, sha: run.sha, pass: green(run), cleanup: run.cleanup }));
const ok = evidence.length === 2 && evidence.every((run) => run.pass);
console.log(JSON.stringify({ row: 'c11-two-consecutive-green-runs', ok, sha, evidence }, null, 2));
process.exitCode = ok ? 0 : 1;
