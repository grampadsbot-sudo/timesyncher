#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c1', only: ['S1'], report: false })).result;
process.exit(printRow('c1-signup', scenarioVerdict(result, 'S1'), result));
