import { mkdirSync, writeFileSync } from 'node:fs';

/** Execution order for whole-run cap (remaining checks marked FAIL on cap). */
export const SMOKE_CHECK_ORDER = [
  '1', '2', '3', '4', 'C', 'W', '5', 'I', '6', 'H', 'MAP', 'BUD', 'LOGO', 'INV-UI',
  '6b', 'T', 'CL', '7', '8', 'H2', 'M', 'R', 'K', 'O',
  'A1', 'A2', 'P', 'E', 'prior_db', 'D', 'INV-CLAIM',
];

const WHOLE_RUN_CAP_MS = 25 * 60 * 1000;

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
          } catch {
            void 0;
          }
        }
        await browser.close();
      } catch {
        void 0;
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

  function markRemainingCapTimeouts(fromName) {
    const startIdx = SMOKE_CHECK_ORDER.indexOf(fromName);
    const slice = startIdx >= 0 ? SMOKE_CHECK_ORDER.slice(startIdx) : SMOKE_CHECK_ORDER;
    for (const name of slice) {
      if (completed.has(name)) continue;
      assignCheck(name, false, { reason: 'timeout', stage: 'whole_run_cap' });
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
   * @param {(tools: { setStage: (s: string) => void, registerBrowser: (b: unknown) => void }) => Promise<{ pass?: boolean, http?: number }>} fn
   * @param {{ timeoutMs: number }} opts
   */
  async function runCheck(name, fn, { timeoutMs }) {
    if (timeoutMs == null || !Number.isFinite(timeoutMs)) {
      throw new Error(`runCheck(${name}) requires timeoutMs`);
    }
    if (capAborted || capExceeded()) {
      if (!completed.has(name)) {
        assignCheck(name, false, { reason: 'timeout', stage: 'whole_run_cap' });
        completed.add(name);
      }
      return;
    }

    const started = Date.now();
    let stage = `check:${name}`;
    const setStage = (label) => {
      stage = label;
    };
    let settled = false;
    let pass = false;
    let http;

    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      await killBrowsers();
      assignCheck(name, false, { reason: 'timeout', stage });
      out.stageTimings[name] = { ms: Date.now() - started, timedOut: true, stage };
      completed.add(name);
      if (capExceeded() && !capAborted) {
        capAborted = true;
        markRemainingCapTimeouts(name);
        await writeOutAndExit(1);
      }
    }, timeoutMs);

    try {
      const result = await fn({ setStage, registerBrowser });
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pass = Boolean(result?.pass);
      http = result?.http;
      assignCheck(name, pass);
      if (http != null) out.http[name] = http;
      out.stageTimings[name] = { ms: Date.now() - started, timedOut: false };
      completed.add(name);
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      assignCheck(name, false, { reason: 'error', stage, message: String(err?.message || err) });
      out.stageTimings[name] = { ms: Date.now() - started, timedOut: false, stage, error: String(err?.message || err) };
      completed.add(name);
    }

    if (capExceeded() && !capAborted) {
      capAborted = true;
      markRemainingCapTimeouts(name);
      await writeOutAndExit(1);
    }
  }

  async function finish() {
    out.totalRuntimeMs = Date.now() - runStartedAt;
    const failed = Object.values(out.checks).some((v) => v === 'FAIL');
    await writeOutAndExit(failed ? 1 : 0);
  }

  return { runCheck, registerBrowser, killBrowsers, finish, writeOutAndExit };
}
