import fs from 'node:fs';
import path from 'node:path';
import { RESULTS_ROOT, VIEWPORTS } from './config.mjs';

export function listRuns(root = RESULTS_ROOT) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d) => /^\d{8}T\d{6}Z$/.test(d) && fs.existsSync(path.join(root, d, 'results.json')))
    .sort()
    .reverse()
    .map((d) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, d, 'results.json'), 'utf8'));
      } catch (error) {
        void error;
        return null;
      }
    })
    .filter(Boolean);
}

const FULL_IDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];

export const isFullRun = (r) => FULL_IDS.every((id) => r.scenarios?.some((s) => s.id === id && !s.prerequisiteOnly));

function screenshotsComplete(scenario) {
  if (scenario.status === 'skipped') return { ok: true, missing: [] };
  const widths = VIEWPORTS.map((v) => String(v.width));
  const missing = [];
  for (const step of scenario.steps || []) {
    for (const width of widths) {
      if (!step.screenshots?.[width] || !fs.existsSync(step.screenshots[width])) {
        missing.push(`${step.step}@${width}`);
      }
    }
  }
  return { ok: (scenario.steps || []).length > 0 && missing.length === 0, missing };
}

export function scenarioVerdict(result, id) {
  const sc = (result?.scenarios || []).find((s) => s.id === id);
  if (!sc) return { ok: false, why: `${id} not in run ${result?.run || 'unknown'}` };
  if (id === 'S8' && sc.status === 'skipped' && sc.meta?.exposed === false) {
    return {
      ok: true,
      why: 'S8 skipped cleanly because PDF/keepsake control is not exposed',
      scenario: sc,
    };
  }
  const shots = screenshotsComplete(sc);
  const visible = (sc.assertions || []).filter((a) => /visible text/.test(a.expect));
  const failed = (sc.assertions || []).filter((a) => !a.ok);
  const ok = sc.status === 'pass' && shots.ok && visible.length > 0 && failed.length === 0;
  return {
    ok,
    why: ok
      ? `${id} pass: ${sc.assertions.length} checks (${visible.length} visible-text), ${sc.steps.length} steps x 390/1280 screenshots`
      : `${id} ${sc.status}; failed=${failed.length} visibleChecks=${visible.length} missingShots=${shots.missing.slice(0, 4).join(',')}${sc.error ? ` error=${sc.error.slice(0, 160)}` : ''}`,
    scenario: sc,
  };
}

export function printRow(row, verdict, result) {
  const out = {
    row,
    ok: verdict.ok,
    detail: verdict.why,
    run: result?.run || null,
    runDir: result ? path.join(RESULTS_ROOT, result.run) : null,
    target: result?.target || null,
    cleanup: result?.cleanup || null,
  };
  if (verdict.scenario) {
    out.screenshots = (verdict.scenario.steps || []).map((s) => ({ step: s.step, ...s.screenshots }));
  }
  console.log(JSON.stringify(out, null, 2));
  return verdict.ok ? 0 : 1;
}

export function freshFullRun(maxAgeMs = Number(process.env.VK_SUITE_EVIDENCE_MAX_AGE_MS || 2.25 * 3600 * 1000)) {
  return listRuns().find((r) => isFullRun(r) && Date.now() - Date.parse(r.finishedAt) < maxAgeMs) || null;
}
