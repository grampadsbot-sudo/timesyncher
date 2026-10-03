import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = '.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs';
const ran = spawnSync(process.execPath, [script, '--self-check'], { cwd: root, encoding: 'utf8' });
if (ran.status !== 0) {
  process.stderr.write(ran.stderr || ran.stdout || 'verify layout self-check failed\n');
  process.exit(ran.status || 1);
}
process.stdout.write(ran.stdout);
