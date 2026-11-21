#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { STAGING_ORIGIN, assertStagingUrl, readState, writeState } from './config.mjs';
import { runSuite } from './run.mjs';

export async function checkStagingDeploy({ base = STAGING_ORIGIN, state = readState(), fetchImpl = fetch } = {}) {
  const origin = assertStagingUrl(base);
  const res = await fetchImpl(`${origin}/api/version`, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  const sha = String(data?.sha || '').trim().toLowerCase();
  const tested = new Set([state.lastFullRunSha, ...(state.deployTested || [])].filter(Boolean));
  const needsRun = Boolean(sha) && !tested.has(sha);
  const decision = !sha
    ? 'staging /api/version returned no sha'
    : needsRun
      ? 'new staging deploy: run the suite'
      : 'already tested';
  return {
    at: new Date().toISOString(),
    target: origin,
    sha: sha || null,
    needsRun,
    decision,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checkOnly = process.argv.includes('--check');
  const state = readState();
  const base = process.env.VK_SUITE_BASE_URL || STAGING_ORIGIN;
  const info = await checkStagingDeploy({ base, state });
  console.log(JSON.stringify(info));
  if (checkOnly || !info.needsRun) process.exit(0);
  writeState({
    ...state,
    deployTested: [info.sha, ...(state.deployTested || [])].slice(0, 30),
  });
  const { result } = await runSuite({ trigger: 'deploy' });
  process.exit(result.status === 'green' ? 0 : 1);
}
