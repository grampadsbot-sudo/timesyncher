#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  STAGING_ORIGIN,
  VIEWPORTS,
  assertStagingUrl,
  loadStagingSecrets,
  readState,
  scrub,
  writeState,
} from './config.mjs';
import { createRun, launchBrowser, writeJson } from './harness.mjs';
import { cleanupThrowawayRun, openSuiteDb, suiteHarnessTag } from './cleanup.mjs';
import { s1Signup, s2VacationByChat, s3WebsiteFlow } from './scenarios_auth.mjs';
import { s4CollaboratorInvite, s5VacationSwitcher } from './scenarios_collab.mjs';
import { s6ChatFirstAiImportMcp, s7ShareLinkView, s8PdfKeepsake } from './scenarios_mcp.mjs';
import { reportRun } from './report.mjs';

const ALL = {
  S1: s1Signup,
  S2: s2VacationByChat,
  S3: s3WebsiteFlow,
  S4: s4CollaboratorInvite,
  S5: s5VacationSwitcher,
  S6: s6ChatFirstAiImportMcp,
  S7: s7ShareLinkView,
  S8: s8PdfKeepsake,
};

const PREREQS = {
  S1: [],
  S2: ['S1'],
  S3: [],
  S4: ['S1', 'S2'],
  S5: ['S1', 'S2'],
  S6: ['S1', 'S2', 'S5'],
  S7: ['S1', 'S2', 'S5', 'S6'],
  S8: ['S1', 'S2', 'S5', 'S6'],
};

function expandOrder(only) {
  if (!only || !only.length) return Object.keys(ALL);
  const needed = new Set();
  for (const id of only) {
    if (!ALL[id]) throw new Error(`unknown scenario ${id}`);
    for (const dep of PREREQS[id] || []) needed.add(dep);
    needed.add(id);
  }
  return Object.keys(ALL).filter((id) => needed.has(id));
}

export async function runSuite({ trigger = 'manual', only = null, report = true, runRoot } = {}) {
  const base = assertStagingUrl(process.env.VK_SUITE_BASE_URL || STAGING_ORIGIN);
  const run = createRun(runRoot ? { root: runRoot } : {});
  const tag = suiteHarnessTag(run.id);
  const startedAt = new Date().toISOString();
  const secrets = await loadStagingSecrets();
  if (!secrets.databaseUrl) throw new Error('staging DATABASE_URL is required for throwaway cleanup');
  if (!secrets.adminToken) throw new Error('TIMESYNCHER_ADMIN_TOKEN is required for throwaway coupon checkout');
  const db = await openSuiteDb(secrets.databaseUrl);
  const browser = await launchBrowser();
  const ctx = {
    browser,
    base,
    db,
    tag,
    adminToken: secrets.adminToken,
    emails: [],
    couponIds: [],
    ownerSessionToken: '',
    ownerEmail: '',
    ownerName: '',
    trip1: null,
    trip2: null,
    s6Approved: false,
  };
  const scenarios = [];
  let version = null;
  let cleanupResult = null;
  try {
    version = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(20000) })
      .then((r) => r.json())
      .catch(() => null);
    const wanted = only && only.length ? only : Object.keys(ALL);
    const order = expandOrder(only);
    for (const id of order) {
      const sc = await ALL[id](run, ctx);
      const prereqOnly = !wanted.includes(id);
      if (prereqOnly) sc.meta = { ...sc.meta, prerequisiteOnly: true };
      scenarios.push(sc);
      const passedChecks = sc.assertions.filter((a) => a.ok).length;
      const label = prereqOnly ? 'prerequisite' : sc.skipped ? 'SKIP' : sc.blocked ? `BLOCKED (${sc.blocked})` : sc.ok ? 'PASS' : 'FAIL';
      console.log(`${sc.id} ${sc.title}: ${label} (${passedChecks}/${sc.assertions.length} checks)`);
    }
  } finally {
    cleanupResult = await cleanupThrowawayRun(db, {
      tag,
      emails: ctx.emails,
      couponIds: ctx.couponIds,
    }).catch((error) => ({ ok: false, remaining: -1, error: scrub(String(error?.message || error)) }));
    await browser.close().catch(() => null);
  }

  const counted = scenarios.filter((s) => !s.meta?.prerequisiteOnly);
  const scenariosGreen = counted.length > 0 && counted.every((s) => s.ok);
  const green = scenariosGreen && cleanupResult?.ok === true && cleanupResult?.remaining === 0;
  const target = {
    base,
    host: new URL(base).host,
    sha: version?.sha || null,
    production: false,
  };
  const result = {
    suite: 'vk-customer-suite',
    issue: 'grampadsbot-sudo/timesyncher#1075',
    run: run.id,
    trigger,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: green ? 'green' : 'red',
    target,
    safety: {
      stagingOnly: true,
      protectedTargetsUntouched: ['NYC 8CQX', 'TREK trip 99', 'Neon d0463815', 'Santa Barbara', 'Kim', 'Craig'],
      throwawayDomain: 'example.test',
      openRouter: 'blocked by browser route guard; not called by suite',
      stripeLive: 'never used; coupon checkout only',
    },
    cleanup: cleanupResult,
    viewports: VIEWPORTS.map((v) => `${v.width}x${v.height}${v.touch ? ' touch' : ''}`),
    scenarios: scenarios.map((s) => ({
      ...s.toJSON(),
      prerequisiteOnly: s.meta?.prerequisiteOnly || undefined,
    })),
    issues: [],
  };

  const file = path.join(run.dir, 'results.json');
  writeJson(file, result);
  if (report) {
    try {
      result.issues = await reportRun({ run, target, scenarios: counted });
    } catch (error) {
      result.issues = [{ action: 'report_error', error: scrub(String(error?.message || error)) }];
    }
    writeJson(file, result);
  }

  const state = readState();
  const isFull = !only || !only.length;
  const history = [
    {
      run: run.id,
      status: result.status,
      sha: target.sha,
      host: target.host,
      trigger,
      scenarios: (only && only.length ? only : Object.keys(ALL)).join(','),
      cleanupRemaining: cleanupResult?.remaining ?? null,
      at: result.finishedAt,
    },
    ...(state.history || []),
  ].slice(0, 50);
  writeState({
    ...state,
    lastRun: run.id,
    lastStatus: result.status,
    ...(isFull ? { lastFullRunSha: target.sha } : {}),
    history,
  });
  console.log(`run ${run.id}: ${result.status.toUpperCase()} cleanup.remaining=${cleanupResult?.remaining} -> ${file}`);
  return { result, file, run };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (flag) => {
    const index = process.argv.indexOf(flag);
    return index > -1 ? process.argv[index + 1] : null;
  };
  const only = arg('--only') ? arg('--only').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
  const { result } = await runSuite({
    trigger: arg('--trigger') || 'manual',
    only,
    report: !process.argv.includes('--no-report'),
  });
  process.exit(result.status === 'green' ? 0 : 1);
}
