#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c7', only: ['S7'], report: false })).result;
process.exit(printRow('c7-share-link-view', scenarioVerdict(result, 'S7'), result));
