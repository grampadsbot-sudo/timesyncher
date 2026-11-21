#!/usr/bin/env node
import { runPreflight } from './preflight.mjs';

const result = await runPreflight({ trigger: 'acceptance-c3', only: 's3', report: false });
console.log(JSON.stringify({ row: 'c3-website-flow', ok: false, run: result.run, dir: result.dir, checks: result.checks }, null, 2));
process.exitCode = 1;
