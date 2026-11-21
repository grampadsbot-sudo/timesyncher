#!/usr/bin/env node
import { runPreflight } from './preflight.mjs';

const result = await runPreflight({ trigger: 'acceptance-c1', only: 's1', report: false });
console.log(JSON.stringify({ row: 'c1-signup', ok: false, run: result.run, dir: result.dir, checks: result.checks }, null, 2));
process.exitCode = 1;
