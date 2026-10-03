import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runPreflight } from './deploy-env-preflight.mjs';

async function main() {
  const migrationCheck = spawnSync('node', ['scripts/check-staging-migrations.mjs'], { stdio: 'inherit' });
  if (migrationCheck.status !== 0) process.exit(migrationCheck.status === null ? 1 : migrationCheck.status);
  const result = await runPreflight({ project: 'timesyncher-vacation-staging', target: 'production' });
  (result.ok ? process.stdout : process.stderr).write(result.text);
  if (!result.ok) process.exit(1);
  const deployed = spawnSync('vercel', ['deploy', '--prod', '--yes'], { stdio: 'inherit' });
  process.exit(deployed.status === null ? 1 : deployed.status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
