#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c8', only: ['S8'], report: false })).result;
process.exit(printRow('c8-pdf-keepsake', scenarioVerdict(result, 'S8'), result));
