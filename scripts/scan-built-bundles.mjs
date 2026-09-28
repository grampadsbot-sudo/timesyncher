import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bundleScanFindings, explainSharedBundle, htmlRefsProducedByBuild } from './check-hardcoded-content.mjs';

const cwd = process.cwd();
const explained = explainSharedBundle(cwd);
process.stdout.write(`${explained.message}\n`);

const produced = htmlRefsProducedByBuild(cwd);
if (!produced.length) {
  process.stdout.write('no HTML reference is produced by an offline build\n');
  process.exit(0);
}

const built = spawnSync('unshare', ['-Urn', 'npm', 'run', 'build'], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
});
if (built.status !== 0) process.exit(built.status === null ? 1 : built.status);

let failed = 0;
for (const item of produced) {
  const abs = path.join(cwd, item.repoPath);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`FAIL\tSERVED-BUNDLE\t${item.file}:1\t${item.ref} was not written by the offline build\n`);
    failed += 1;
    continue;
  }
  const hits = bundleScanFindings(item.repoPath, fs.readFileSync(abs, 'utf8'));
  for (const hit of hits) {
    process.stderr.write(`FAIL\tBUNDLE-SCAN\t${hit.file}:${hit.line}\t${hit.symbol_or_pattern}\n`);
    failed += 1;
  }
}
if (failed) process.exit(1);
process.stdout.write(`scanned ${produced.length} built bundle${produced.length === 1 ? '' : 's'}\n`);
