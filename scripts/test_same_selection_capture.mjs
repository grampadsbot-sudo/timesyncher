import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = new URL('ops/dispatch/test_same_selection_capture.py', import.meta.url).pathname;
const r = spawnSync('python3', [testFile], { stdio: 'inherit' });
process.exit(r.status ?? 1);
