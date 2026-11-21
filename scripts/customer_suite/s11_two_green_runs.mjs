#!/usr/bin/env node
import path from 'node:path';
import { RESULTS_ROOT } from './config.mjs';
import { isFullRun, listRuns, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const BUDGET_MS = Number(process.env.VK_SUITE_C11_BUDGET_MS || 1_150_000);
const t0 = Date.now();

function judge(r) {
  const why = [];
  if (r.status !== 'green') why.push(`status ${r.status}`);
  if (r.target?.production !== false || r.target?.host !== 'vacation-staging.timesyncher.com') {
    why.push('not vacation-staging target');
  }
  if (r.cleanup?.ok !== true || r.cleanup?.remaining !== 0) {
    why.push(`throwaway accounts not fully deleted (remaining=${r.cleanup?.remaining})`);
  }
  for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']) {
    const verdict = scenarioVerdict(r, id);
    if (!verdict.ok) why.push(verdict.why);
  }
  return why;
}

function lastTwo() {
  const full = listRuns().filter(isFullRun);
  const pair = full.slice(0, 2);
  return { pair, verdicts: pair.map((r) => ({ run: r.run, problems: judge(r) })) };
}

let { pair, verdicts } = lastTwo();
const good = () => pair.length === 2 && verdicts.every((v) => v.problems.length === 0);

while (!good() && Date.now() - t0 < BUDGET_MS - 300_000) {
  await runSuite({ trigger: 'acceptance-c11', report: false });
  ({ pair, verdicts } = lastTwo());
}

const ok = good();
console.log(JSON.stringify({
  row: 'c11-two-consecutive-green-runs',
  ok,
  runs: pair.map((r) => ({
    run: r.run,
    dir: path.join(RESULTS_ROOT, r.run),
    status: r.status,
    trigger: r.trigger,
    finishedAt: r.finishedAt,
    host: r.target?.host,
    sha: r.target?.sha,
    cleanup: r.cleanup,
  })),
  verdicts,
}, null, 2));
process.exit(ok ? 0 : 1);
