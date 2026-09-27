#!/usr/bin/env node
/**
 * A live run counts only when vacation-staging's deployed commit equals the
 * tested tip. A mismatch aborts with VOID_STALE_BUILD and is not graded.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const STAGING_ORIGIN = 'https://vacation-staging.timesyncher.com';
const SHA = /^[0-9a-f]{40}$/;

export class VoidStaleBuildError extends Error {
  constructor(live, tip) {
    const liveSha = live || 'missing';
    const tipSha = tip || 'missing';
    super(`VOID_STALE_BUILD live=${liveSha} tip=${tipSha}`);
    this.name = 'VoidStaleBuildError';
    this.live = liveSha;
    this.tip = tipSha;
  }
}

export function isVoidStaleBuild(error) {
  return error instanceof VoidStaleBuildError || String(error?.message || '').startsWith('VOID_STALE_BUILD ');
}

export function normalizeSha(value) {
  const text = String(value || '').trim().toLowerCase();
  return SHA.test(text) ? text : '';
}

export function assertMatchingBuild(live, tip) {
  const liveSha = normalizeSha(live);
  const tipSha = normalizeSha(tip);
  if (!liveSha || !tipSha || liveSha !== tipSha) {
    throw new VoidStaleBuildError(liveSha, tipSha);
  }
  return { live: liveSha, tip: tipSha };
}

export function voidDocumentStamp(live, tip) {
  const liveSha = normalizeSha(live) || 'missing';
  const tipSha = normalizeSha(tip) || 'missing';
  return [
    'VOID',
    `VOID_STALE_BUILD live=${liveSha} tip=${tipSha}`,
    'This run is void. Do not grade it.',
  ].join('\n');
}

export function prependVoidStamp(text, live, tip) {
  const stamp = voidDocumentStamp(live, tip);
  const body = String(text || '').replace(/^\uFEFF/, '');
  if (body.startsWith('VOID\n')) return body.endsWith('\n') ? body : `${body}\n`;
  return `${stamp}\n\n${body}${body.endsWith('\n') || body.length === 0 ? '' : '\n'}`;
}

export function shaFromVersionPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return normalizeSha(payload.sha || payload.gitSha || payload.commit);
}

export function shaFromDeploymentMeta(payload) {
  const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : payload;
  return normalizeSha(meta?.githubCommitSha || meta?.gitCommitSha);
}

export function readTipSha(cwd = root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return normalizeSha(result.stdout);
}

function teamId() {
  try {
    const project = JSON.parse(readFileSync(path.join(root, '.vercel/project.json'), 'utf8'));
    return project.orgId || '';
  } catch {
    return '';
  }
}

function vercelCommand() {
  const found = spawnSync('bash', ['-lc', 'command -v vercel || true'], { encoding: 'utf8' });
  const fromPath = String(found.stdout || '').trim();
  if (fromPath) return fromPath;
  const caches = ['/home/ubuntu/.npm/_npx', '/usr/local/lib/node_modules'];
  for (const cache of caches) {
    let entries = [];
    try {
      entries = readdirSync(cache);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(cache, entry, 'node_modules/.bin/vercel');
      if (existsSync(candidate)) return candidate;
    }
  }
  return '';
}

export async function readVersionEndpointSha(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const origin = options.origin || STAGING_ORIGIN;
  const headers = { accept: 'application/json' };
  const bypass = options.bypass || process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS || '';
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  let response;
  try {
    response = await fetchImpl(`${origin}/api/version`, { headers });
  } catch {
    return '';
  }
  if (!response?.ok) return '';
  try {
    return shaFromVersionPayload(await response.json());
  } catch {
    return '';
  }
}

export async function readInspectDeploymentId(options = {}) {
  if (options.deploymentId) return String(options.deploymentId);
  const bin = options.vercelBin || vercelCommand();
  if (!bin) return '';
  const scope = options.scope || teamId();
  const args = ['inspect', options.origin || STAGING_ORIGIN, '--json'];
  if (scope) args.push('--scope', scope);
  const result = spawnSync(bin, args, { cwd: options.cwd || root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) return '';
  try {
    const payload = JSON.parse(result.stdout);
    return String(payload.id || '');
  } catch {
    return '';
  }
}

export async function readDeploymentMetaSha(deploymentId, options = {}) {
  if (!deploymentId) return '';
  const token = options.token || process.env.VERCEL_TOKEN || '';
  if (!token) return '';
  const fetchImpl = options.fetchImpl || fetch;
  const team = options.teamId || teamId();
  const query = team ? `?teamId=${encodeURIComponent(team)}` : '';
  let response;
  try {
    response = await fetchImpl(`https://api.vercel.com/v13/deployments/${deploymentId}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return '';
  }
  if (!response?.ok) return '';
  try {
    return shaFromDeploymentMeta(await response.json());
  } catch {
    return '';
  }
}

export async function readLiveBuildSha(options = {}) {
  const versionSha = await readVersionEndpointSha(options);
  if (versionSha) return versionSha;
  const deploymentId = await readInspectDeploymentId(options);
  return readDeploymentMetaSha(deploymentId, options);
}

export function pdfTextHasSha(file, sha) {
  const result = spawnSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) return false;
  return String(result.stdout || '').includes(String(sha || ''));
}

export async function assertBothPdfsMatchLive(dialogPdf, journeyPdf, options = {}) {
  const match = await assertLiveMatchesTip(options);
  for (const file of [dialogPdf, journeyPdf]) {
    if (!pdfTextHasSha(file, match.live)) {
      throw new Error(`refused: ${file} does not print live sha ${match.live}`);
    }
  }
  return match;
}

export async function assertLiveMatchesTip(options = {}) {
  const tip = options.tip || readTipSha(options.cwd || root);
  const live = options.live ?? await readLiveBuildSha(options);
  return assertMatchingBuild(live, tip);
}

async function main() {
  try {
    const match = await assertLiveMatchesTip();
    process.stdout.write(`live=${match.live} tip=${match.tip}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
