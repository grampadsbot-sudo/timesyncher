import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    const fromOpenPr = String(ghPrListHead(refName) || '').trim();
    if (fromOpenPr) return fromOpenPr;
  }

  return '';
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

function defaultGhPrListHead(headRef) {
  const rows = ghJson(['pr', 'list', '--head', headRef, '--json', 'baseRefName']);
  if (!Array.isArray(rows) || !rows.length) return '';
  return rows[0]?.baseRefName || '';
}

function main() {
  const sha = String(process.argv[2] || process.env.GITHUB_SHA || '').trim();
  if (!sha) {
    process.stderr.write('usage: node scripts/resolve-evidence-base-ref.mjs <sha>\n');
    process.exit(2);
  }

  const base = resolveEvidenceBaseRef({
    baseRef: process.env.GITHUB_BASE_REF || process.env.BASE || '',
    refName: process.env.GITHUB_REF_NAME || '',
    sha,
    repository: process.env.GITHUB_REPOSITORY || '',
    ghPullsForCommit: defaultGhPullsForCommit,
    ghPrListHead: defaultGhPrListHead,
  });

  if (!base) {
    process.stderr.write(`no PR for ${sha}: push through a PR\n`);
    process.exit(1);
  }

  process.stdout.write(`${base}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
