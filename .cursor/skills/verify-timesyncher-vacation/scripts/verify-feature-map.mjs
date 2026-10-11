#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-layout.mjs', import.meta.url));
const ran = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(ran.status === null ? 1 : ran.status);
