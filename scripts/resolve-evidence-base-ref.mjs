import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function integrationLaneSelfBase(refName) {
  const name = String(refName || '').trim();
  if (/^cursor\/jev-quality-r\d+-1128$/.test(name)) return name;
  return '';
}

export function resolveEvidenceBaseRef({
  baseRef = '',
  refName = '',
  sha = '',
  repository = '',
  ghPullsForCommit = null,
  ghPrListHead = null,
} = {}) {
  const trimmedBase = String(baseRef || '').trim();
  if (trimmedBase) return trimmedBase;

  if (sha && repository && typeof ghPullsForCommit === 'function') {
    const fromCommit = String(ghPullsForCommit(repository, sha) || '').trim();
    if (fromCommit) return fromCommit;
  }

  if (refName && typeof ghPrListHead === 'function') {
    const fromOpenPr = String(ghPrListHead(refName, 'open') || '').trim();
    if (fromOpenPr) return fromOpenPr;
  }

  return integrationLaneSelfBase(refName);
}

function ghJson(args) {
  const ran = spawnSync('gh', args, { encoding: 'utf8' });
  if (ran.status !== 0) return null;
  try {
    return JSON.parse(ran.stdout || 'null');
  } catch {
    return null;
  }
}

function defaultGhPullsForCommit(repository, commitSha) {
  const pulls = ghJson(['api', `repos/${repository}/commits/${commitSha}/pulls`, '-H', 'Accept: application/vnd.github+json']);
  if (!Array.isArray(pulls) || !pulls.length) return '';
  return pulls[0]?.base?.ref || '';
}

function defaultGhPrListHead(headRef, state) {
  const rows = ghJson(['pr', 'list', '--head', headRef, '--state', state, '--json', 'baseRefName']);
  if (!Array.isArray(rows) || !rows.length) return '';
  return rows[0]?.baseRefName || '';
}

function fetchOriginBase(base, cwd = process.cwd()) {
  const ran = spawnSync('git', ['fetch', 'origin', base, '--depth=1'], { cwd, encoding: 'utf8' });
  if (ran.status !== 0) {
    process.stderr.write(ran.stderr || ran.stdout || `git fetch origin ${base} failed\n`);
    process.exit(ran.status || 1);
  }
}

function writeGithubEnv(base) {
  const envPath = process.env.GITHUB_ENV;
  if (envPath) fs.appendFileSync(envPath, `BASE=${base}\n`);
  else process.stdout.write(`BASE=${base}\n`);
}

function main() {
  const base = resolveEvidenceBaseRef({
    baseRef: process.env.GITHUB_BASE_REF || process.env.BASE || '',
    refName: process.env.GITHUB_REF_NAME || '',
    sha: process.env.GITHUB_SHA || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    ghPullsForCommit: defaultGhPullsForCommit,
    ghPrListHead: defaultGhPrListHead,
  });
  if (!base) {
    process.stderr.write('BASE is unset; subset check cannot run\n');
    process.exit(1);
  }
  fetchOriginBase(base);
  writeGithubEnv(base);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
