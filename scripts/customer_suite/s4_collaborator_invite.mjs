#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c4', only: ['S4'], report: false })).result;
process.exit(printRow('c4-collaborator-invite', scenarioVerdict(result, 'S4'), result));
