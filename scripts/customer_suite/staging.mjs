import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STAGING = 'https://vacation-staging.timesyncher.com';
export const ROOT = path.join(os.homedir(), 'tsv-dispatch', 'customer-suite');
export const RESULTS = path.join(ROOT, 'results');

export async function servedBuild() {
  const res = await fetch(`${STAGING}/api/version`, {
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`staging build check returned HTTP ${res.status}`);
  const { sha, ok } = await res.json();
  if (ok !== true || !/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('staging build check did not return a Git SHA');
  return sha;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}
