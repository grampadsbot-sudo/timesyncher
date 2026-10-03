import { mkdirSync, writeFileSync } from 'node:fs';
import { SMOKE_PARALLEL_CONCURRENCY } from './shepherd-staging-smoke-plan.mjs';
import { mintVisualStateCustomers } from './shepherd-staging-smoke-visual-states.mjs';
import { captureVisualStateScreenshots } from './shepherd-staging-smoke-visual-capture.mjs';
import { VISUAL_JUDGE_MODEL, judgeScreenshotsParallel } from './shepherd-staging-smoke-visual-judge.mjs';
import { runVisualOpenRouterPreflight } from './shepherd-staging-smoke-visual-preflight.mjs';
import { VISUAL_RUBRIC_VERSION, loadVisualScreenSpec } from './shepherd-staging-smoke-visual-rubric.mjs';
import { visualInfraBlockedFromPreflight, visualPreflightReady } from './shepherd-staging-smoke-visual-preflight.mjs';

function writeVisualComposerVerifyMd(artifactDir, composerShots = []) {
  const lines = ['# VERIFY', '', '## VISUAL composer screenshots (390 / 1280)', ''];
  for (const row of composerShots) lines.push(`- ${row.stateId} @ ${row.viewport}: \`${row.path}\``);
  if (!composerShots.length) lines.push('- (none captured)');
  lines.push('');
  writeFileSync(`${artifactDir}/VERIFY.md`, `${lines.join('\n')}\n`);
}

function visualArtifactDir(baseDir, expectSha) {
  const dir = `${baseDir}/${expectSha}-visual`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mergeLayoutAndJudgeVerdict(shot, judgeVerdict) {
  const layoutPass = shot.layoutDom?.pass !== false && !shot.hydrationError;
  const layoutFailures = (shot.layoutDom?.failures || []).map((f) => ({
    rubricItem: 'layout_dom',
    reason: `[${f.rule}] ${f.selector}: ${f.detail}`,
  }));
  if (shot.hydrationError) {
    layoutFailures.push({ rubricItem: 'layout_dom', reason: shot.hydrationError });
  }
  const judgePass = Boolean(judgeVerdict?.pass);
  const pass = layoutPass && judgePass;
  if (pass) {
    return { ...judgeVerdict, pass: true, failures: [] };
  }
  const failures = [...layoutFailures];
  if (!judgePass) {
    for (const f of judgeVerdict.failures || []) failures.push(f);
  }
  return { ...judgeVerdict, pass: false, failures };
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
  const preflight = await runVisualOpenRouterPreflight({
    apiKey: env.OPENROUTER_API_KEY,
    fetchImpl,
  });
  if (!visualPreflightReady(preflight)) {
    const block = visualInfraBlockedFromPreflight(preflight);
    return {
      pass: false,
      infraBlocked: true,
      preflight,
      judged: [],
      verdictDoc: {
        expectSha,
        model: VISUAL_JUDGE_MODEL,
        rubricVersion: VISUAL_RUBRIC_VERSION,
        preflight,
        pass: false,
      },
      artifactDir,
      stageTimestamps,
      states: spineState || {},
      specSource: spec.source,
      infraDetail: block?.infraDetail,
    };
  }
  stageTimestamps.mintStartMs = Date.now();
  const states = spineState || await mintVisualStateCustomers({ db, BASE, SHA7, setStage });
  stageTimestamps.mintEndMs = Date.now();
  stageTimestamps.captureStartMs = Date.now();
  const captured = await captureVisualStateScreenshots({
    page,
    states,
    artifactDir,
    setStage,
    stageTimestamps,
  });
  const shots = captured.shots || [];
  const composerShots = captured.composerShots || [];
  writeVisualComposerVerifyMd(artifactDir, composerShots);
  stageTimestamps.captureEndMs = Date.now();
  for (const shot of shots) {
    shot.specSource = spec.source;
    shot.specText = spec.text;
  }
  stageTimestamps.judgeStartMs = Date.now();
  const judgeShots = shots.filter((shot) => shot.judgeComposer && shot.composerPath);
  const judged = (await judgeScreenshotsParallel(judgeShots, {
    apiKey: env.OPENROUTER_API_KEY,
    concurrency: SMOKE_PARALLEL_CONCURRENCY,
    fetchImpl,
    setStage,
  })).map(({ shot, verdict }) => ({
    shot,
    verdict: mergeLayoutAndJudgeVerdict(shot, verdict),
  }));
  stageTimestamps.judgeEndMs = Date.now();
  const chatLayoutPass = shots
    .filter((shot) => shot.pageKind === 'chat')
    .every((shot) => shot.layoutDom?.pass !== false && !shot.hydrationError);
  const pass = chatLayoutPass && judged.length > 0 && judged.every((row) => Boolean(row.verdict?.pass));
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
      layoutDomPass: shot.layoutDom?.pass !== false,
      failures: verdict.failures,
      error: verdict.error || null,
      latencyMs: verdict.latencyMs ?? null,
    })),
    pass,
  };
  verdictDoc.preflight = preflight;
  writeFileSync(`${artifactDir}/verdict.json`, `${JSON.stringify(verdictDoc, null, 2)}\n`);
  return {
    pass,
    preflight,
    judged,
    verdictDoc,
    artifactDir,
    stageTimestamps,
    states,
    specSource: spec.source,
    composerShots,
    verifyMdPath: `${artifactDir}/VERIFY.md`,
  };
}
