import { mkdirSync, writeFileSync } from 'node:fs';
import { SMOKE_PARALLEL_CONCURRENCY } from './shepherd-staging-smoke-plan.mjs';
import { mintVisualStateCustomers } from './shepherd-staging-smoke-visual-states.mjs';
import { captureVisualStateScreenshots } from './shepherd-staging-smoke-visual-capture.mjs';
import {
  VISUAL_JUDGE_MODEL,
  VISUAL_RUBRIC_VERSION,
  judgeScreenshotsParallel,
} from './shepherd-staging-smoke-visual-judge.mjs';
import { loadVisualScreenSpec } from './shepherd-staging-smoke-visual-rubric.mjs';

function visualArtifactDir(baseDir, expectSha) {
  const dir = `${baseDir}/${expectSha}-visual`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function summarizeVisualVerdicts(judged) {
  const lines = [];
  for (const row of judged) {
    const v = row.verdict;
    const id = row.shot?.id || 'unknown';
    if (row.shot?.missing) {
      lines.push(`${id}: FAIL (missing screenshot)`);
      continue;
    }
    if (v.pass) lines.push(`${id}: PASS`);
    else {
      lines.push(`${id}: FAIL`);
      for (const f of v.failures || []) {
        lines.push(`  [${f.rubricItem}] ${f.reason}`);
      }
      if (v.error) lines.push(`  (error=${v.error})`);
    }
  }
  return lines.join('\n');
}

export async function runVisualHarnessCheck({
  page,
  db,
  BASE,
  SHA7,
  expectSha,
  artifactBaseDir = '/opt/cursor/artifacts',
  setStage,
  env = process.env,
  fetchImpl = fetch,
  /** When set (spine), skip mint and use this single-state map for faster smoke. */
  spineState = null,
}) {
  const stageTimestamps = {};
  const artifactDir = visualArtifactDir(artifactBaseDir, expectSha);
  const spec = loadVisualScreenSpec();
  stageTimestamps.mintStartMs = Date.now();
  const states = spineState || await mintVisualStateCustomers({ db, BASE, SHA7, setStage });
  stageTimestamps.mintEndMs = Date.now();
  stageTimestamps.captureStartMs = Date.now();
  const shots = await captureVisualStateScreenshots({
    page,
    states,
    artifactDir,
    setStage,
    stageTimestamps,
  });
  stageTimestamps.captureEndMs = Date.now();
  for (const shot of shots) {
    shot.specSource = spec.source;
    shot.specText = spec.text;
  }
  stageTimestamps.judgeStartMs = Date.now();
  const judged = await judgeScreenshotsParallel(shots, {
    apiKey: env.OPENROUTER_API_KEY,
    concurrency: SMOKE_PARALLEL_CONCURRENCY,
    fetchImpl,
    setStage,
  });
  stageTimestamps.judgeEndMs = Date.now();
  const pass = judged.every((row) => {
    if (row.shot?.missing) return false;
    if (!row.shot?.path) return false;
    return Boolean(row.verdict?.pass);
  });
  const verdictDoc = {
    expectSha,
    model: VISUAL_JUDGE_MODEL,
    rubricVersion: VISUAL_RUBRIC_VERSION,
    specSource: spec.source,
    states: Object.keys(states),
    stageTimestamps,
    shots: judged.map(({ shot, verdict }) => ({
      id: shot.id,
      stateId: shot.stateId,
      pageKind: shot.pageKind,
      tabLabel: shot.tabLabel || null,
      viewport: shot.viewport?.label || shot.viewport?.width,
      path: shot.path,
      pass: verdict.pass,
      failures: verdict.failures,
      error: verdict.error || null,
      latencyMs: verdict.latencyMs ?? null,
    })),
    pass,
  };
  writeFileSync(`${artifactDir}/verdict.json`, `${JSON.stringify(verdictDoc, null, 2)}\n`);
  return {
    pass,
    judged,
    verdictDoc,
    artifactDir,
    stageTimestamps,
    states,
    specSource: spec.source,
  };
}
