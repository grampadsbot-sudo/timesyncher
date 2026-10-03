import { mkdirSync, writeFileSync } from 'node:fs';
import { SMOKE_PARALLEL_CONCURRENCY } from './shepherd-staging-smoke-plan.mjs';
import { seedVisualSmokeTripContent } from './shepherd-staging-smoke-visual-seed.mjs';
import { captureVisualScreenshots } from './shepherd-staging-smoke-visual-capture.mjs';
import {
  VISUAL_JUDGE_MODEL,
  VISUAL_RUBRIC_VERSION,
  judgeScreenshotsParallel,
} from './shepherd-staging-smoke-visual-judge.mjs';

export function visualArtifactDir(baseDir, expectSha) {
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
  session,
  tripId,
  chatUrl,
  sharedUrl,
  expectSha,
  artifactBaseDir = '/opt/cursor/artifacts',
  setStage,
  env = process.env,
  fetchImpl = fetch,
}) {
  const stageTimestamps = {};
  const artifactDir = visualArtifactDir(artifactBaseDir, expectSha);
  setStage?.('visual seed trip tabs');
  stageTimestamps.seedStartMs = Date.now();
  const seed = await seedVisualSmokeTripContent(session, tripId, { setStage });
  stageTimestamps.seedEndMs = Date.now();
  stageTimestamps.captureStartMs = Date.now();
  const shots = await captureVisualScreenshots({
    page,
    chatUrl,
    sharedUrl,
    artifactDir,
    expectSha,
    setStage,
    stageTimestamps,
  });
  stageTimestamps.captureEndMs = Date.now();
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
    screenSpecFiles: null,
    seed,
    stageTimestamps,
    shots: judged.map(({ shot, verdict }) => ({
      id: shot.id,
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
  return { pass, judged, verdictDoc, artifactDir, stageTimestamps, seed, screenSpecNote: 'features/screens/*.md absent; shared shots include features/itinerary-surfaces.md when matched' };
}
