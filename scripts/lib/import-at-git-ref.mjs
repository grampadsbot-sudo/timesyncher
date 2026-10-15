import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export async function importAtGitRef(ref, repoRelPath, { cwd = REPO_ROOT } = {}) {
  const body = execFileSync('git', ['show', `${ref}:${repoRelPath}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  const dir = mkdtempSync(join(tmpdir(), 'tsv-git-import-'));
  const out = join(dir, repoRelPath.replace(/\//g, '_'));
  writeFileSync(out, body, 'utf8');
  return import(pathToFileURL(out).href);
}
