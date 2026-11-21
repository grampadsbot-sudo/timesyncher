#!/usr/bin/env node
import { freshFullRun, printRow, scenarioVerdict } from './acceptance.mjs';
import { runSuite } from './run.mjs';

const cached = process.env.VK_SUITE_ACCEPT_LIVE === '1' ? null : freshFullRun();
const result = cached || (await runSuite({ trigger: 'acceptance-c6', only: ['S6'], report: false })).result;
process.exit(printRow('c6-chat-first-ai-import-mcp', scenarioVerdict(result, 'S6'), result));
