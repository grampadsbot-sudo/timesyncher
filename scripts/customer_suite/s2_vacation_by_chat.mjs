#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c2', only: ['S2'], report: false })).result;
process.exit(printRow('c2-vacation-by-chat', scenarioVerdict(result, 'S2'), result));
