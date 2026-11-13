import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('python3', [join(root, 'scripts/check-no-blocking-pixel-ci.py')], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
