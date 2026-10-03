import { mkdirSync, writeFileSync } from 'node:fs';
import {
  SMOKE_CHECK_ORDER,
  SMOKE_FAIL_CLOSED_GO,
  SMOKE_PARALLEL_CONCURRENCY,
  SMOKE_PARALLEL_INDEPENDENT_NAMES,
} from './shepherd-staging-smoke-plan.mjs';
import { finalizeSmokeProviderLogSummary } from './shepherd-staging-smoke-provider-log.mjs';

export { SMOKE_CHECK_ORDER, SMOKE_PARALLEL_INDEPENDENT_NAMES };

const WHOLE_RUN_CAP_MS = 12 * 60 * 1000;

function createCheckStageTools(runStartedAt) {
  const stages = [];
  let stage = 'init';
  const setStage = (label) => {
    stage = label;
    stages.push({ label, atMs: Date.now() - runStartedAt });
  };
  return { setStage, getStage: () => stage, stages, resetStages: () => { stages.length = 0; } };
}

/**
 * @param {{ out: Record<string, unknown>, sha7: string, artifactDir?: string, runStartedAt?: number, wholeRunCapMs?: number }} ctx
 */
export function createSmokeRunner(ctx) {
  const {
    out,
    sha7,
    artifactDir = '/opt/cursor/artifacts',
    runStartedAt = Date.now(),
    wholeRunCapMs = WHOLE_RUN_CAP_MS,
  } = ctx;

  const browsers = new Set();
  const completed = new Set();
  let capAborted = false;
  let exiting = false;

  out.stageTimings = out.stageTimings || {};
  out.checkFailures = out.checkFailures || {};
  out.browserCleanupErrors = out.browserCleanupErrors || [];
  out.harnessErrors = out.harnessErrors || {};

  function recordBrowserCleanupError(err, context) {
    out.browserCleanupErrors.push({
      context,
      message: String(err?.message || err),
    });
  }

  function registerBrowser(browser) {
    if (browser) browsers.add(browser);
  }

  async function killBrowsers() {
    for (const browser of browsers) {
      try {
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (err) {
            recordBrowserCleanupError(err, 'page.close');
          }
        }
        await browser.close();
      } catch (err) {
        recordBrowserCleanupError(err, 'browser.close');
      }
    }
    browsers.clear();
  }

  function capExceeded() {
    return Date.now() - runStartedAt >= wholeRunCapMs;
  }

  function assignCheck(name, pass, failDetail) {
    out.checks[name] = pass ? 'PASS' : 'FAIL';
    if (!pass && failDetail) {
      out.checkFailures[name] = failDetail;
    }
  }

  function recordStageTiming(name, record) {
    out.stageTimings[name] = record;
  }

  function markRemainingCapTimeouts(fromName) {
    const startIdx = SMOKE_CHECK_ORDER.indexOf(fromName);
    const slice = startIdx >= 0 ? SMOKE_CHECK_ORDER.slice(startIdx) : SMOKE_CHECK_ORDER;
    for (const name of slice) {
      if (completed.has(name)) continue;
      assignCheck(name, false, { reason: 'timeout', stage: 'whole_run_cap' });
      recordStageTiming(name, {
        startMs: runStartedAt,
        endMs: Date.now(),
        ms: Date.now() - runStartedAt,
        timedOut: true,
        stage: 'whole_run_cap',
        stages: [],
      });
      completed.add(name);
    }
  }

  async function writeOutAndExit(code) {
    if (exiting) return;
    exiting = true;
    out.totalRuntimeMs = Date.now() - runStartedAt;
    if (!out.deployId) {
      out.deployId = process.env.SHEPHERD_DEPLOY_ID || null;
    }
    finalizeSmokeProviderLogSummary(out);
    mkdirSync(artifactDir, { recursive: true });
    const artifactOut = `${artifactDir}/shepherd-${sha7}-out.json`;
    writeFileSync(artifactOut, JSON.stringify(out, null, 2));
    writeFileSync(`/tmp/shepherd-${sha7}-out.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    await killBrowsers();
    process.exit(code);
  }

  /**
   * @param {string} name
   * @param {(tools: { setStage: (s: string) => void, registerBrowser: (b: unknown) => void, stages: { label: string, atMs: number }[] }) => Promise<{ pass?: boolean, http?: number, harnessError?: boolean, harnessMessage?: string }>} fn
   * @param {{ timeoutMs: number }} opts
   */
  async function runCheck(name, fn, { timeoutMs }) {
    if (timeoutMs == null || !Number.isFinite(timeoutMs)) {
      throw new Error(`runCheck(${name}) requires timeoutMs`);
    }
    if (capAborted || capExceeded()) {
      if (!completed.has(name)) {
        assignCheck(name, false, { reason: 'timeout', stage: 'whole_run_cap' });
        recordStageTiming(name, {
          startMs: Date.now(),
          endMs: Date.now(),
          ms: 0,
          timedOut: true,
          stage: 'whole_run_cap',
          stages: [],
        });
        completed.add(name);
      }
      return;
    }

    const checkStart = Date.now();
    const tools = createCheckStageTools(runStartedAt);
    let settled = false;
    let pass = false;
    let http;

    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await killBrowsers();
      assignCheck(name, false, { reason: 'timeout', stage: tools.getStage() });
      recordStageTiming(name, {
        startMs: checkStart,
        endMs: Date.now(),
        ms: Date.now() - checkStart,
        timedOut: true,
        stage: tools.getStage(),
        stages: tools.stages,
      });
      completed.add(name);
      if (capExceeded() && !capAborted) {
        capAborted = true;
        markRemainingCapTimeouts(name);
        await writeOutAndExit(1);
      }
    }, timeoutMs);

    try {
      const result = await fn({
        setStage: tools.setStage,
        registerBrowser,
        stages: tools.stages,
      });
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result?.harnessError) {
        out.harnessErrors[name] = { message: result.harnessMessage || 'harness error' };
        assignCheck(name, false, { reason: 'harness_error', stage: tools.getStage(), message: result.harnessMessage });
        pass = false;
      } else {
        pass = Boolean(result?.pass);
        assignCheck(name, pass);
      }
      http = result?.http;
      if (http != null) out.http[name] = http;
      recordStageTiming(name, {
        startMs: checkStart,
        endMs: Date.now(),
        ms: Date.now() - checkStart,
        timedOut: false,
        stages: tools.stages,
      });
      completed.add(name);
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      assignCheck(name, false, { reason: 'error', stage: tools.getStage(), message: String(err?.message || err) });
      recordStageTiming(name, {
        startMs: checkStart,
        endMs: Date.now(),
        ms: Date.now() - checkStart,
        timedOut: false,
        stage: tools.getStage(),
        error: String(err?.message || err),
        stages: tools.stages,
      });
      completed.add(name);
    }

    if (capExceeded() && !capAborted) {
      capAborted = true;
      markRemainingCapTimeouts(name);
      await writeOutAndExit(1);
    }
  }

  /**
   * @param {Array<{ name: string, timeoutMs: number, run: () => Promise<{ pass?: boolean, http?: number, harnessError?: boolean, harnessMessage?: string }> }>} entries
   * @param {number} [concurrency]
   */
  async function runChecksParallel(entries, concurrency = SMOKE_PARALLEL_CONCURRENCY) {
    let next = 0;
    async function worker() {
      while (next < entries.length) {
        const idx = next;
        next += 1;
        const entry = entries[idx];
        await runCheck(entry.name, ({ setStage, registerBrowser, stages }) => entry.run({ setStage, registerBrowser, stages }), {
          timeoutMs: entry.timeoutMs,
        });
      }
    }
    const n = Math.max(1, Math.min(concurrency, entries.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
  }

  async function finish() {
    out.totalRuntimeMs = Date.now() - runStartedAt;
    finalizeSmokeProviderLogSummary(out);
    const goFails = SMOKE_FAIL_CLOSED_GO.filter((name) => out.checks[name] === 'FAIL');
    out.goGate = { pass: goFails.length === 0, checks: SMOKE_FAIL_CLOSED_GO, fails: goFails };
    const failed = Object.values(out.checks).some((v) => v === 'FAIL');
    await writeOutAndExit(failed ? 1 : 0);
  }

  return { runCheck, runChecksParallel, registerBrowser, killBrowsers, finish, writeOutAndExit };
}
