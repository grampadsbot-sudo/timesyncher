#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as ssrApi from './index.mjs';
import { runCustomer } from '../../harness/customer.mjs';
import { runWave } from '../../harness/wave.mjs';

const requiredExports = [
  'PINNED_EMBEDDING_MODEL',
  'PINNED_EMBEDDING_REVISION',
  'assertPinnedEmbeddingConfig',
  'resolveLocalModelSnapshot',
  'resolveEmbedPython',
  'createLocalBgeEmbedder',
  'ANCHOR_SET_VERSION',
  'SSR_CONSTRUCTS',
  'ANCHOR_SETS',
  'listAnchorVersions',
  'getAnchorSet',
  'SSR_CHECKPOINTS',
  'assertFreeTextPrompt',
  'assertFreeTextReply',
  'getCheckpointDefinition',
  'collectCheckpointReactions',
  'DEFAULT_SSR_TEMPERATURE',
  'SSR_FLOAT_TOLERANCE',
  'SSR_CITATION',
  'cosineSimilarity',
  'similaritiesToPmf',
  'averagePmfs',
  'expectedScore',
  'pmfToRatingMap',
  'scoreFreeText',
  'scoreCustomerCheckpoints',
  'extractLegacyDlrComparison',
  'aggregateSsrWave',
  'ssrScoreboardMarkdown',
  'attachSsrToDialogPack',
  'recordDialogPdfStatus',
  'attachSsrToKeepsakeMetadata',
  'ALLOWED_STAGING_ORIGIN',
  'assertSsrTargetSafe',
  'assertNoOpenRouterInPath',
  'assertCopyRules',
  'createHarnessSsrHook',
  'createPlaywrightSuiteSsrHook',
];

for (const name of requiredExports) {
  assert.notEqual(ssrApi[name], undefined, `missing standalone export ${name}`);
}

const embedder = ssrApi.createLocalBgeEmbedder();
const pwHook = ssrApi.createPlaywrightSuiteSsrHook({ embedder });
assert.equal(pwHook.suiteReady, true);
assert.equal(pwHook.requiresPr1075, false);

pwHook.onAfterSetup({
  customerId: 'pw-1075-ready',
  reply: 'Signing in and setting up my vacation felt smooth and clear.',
  target: { origin: ssrApi.ALLOWED_STAGING_ORIGIN, destination: 'Hilo', name: 'Taylor Moss' },
});
pwHook.onAfterKeepsake({
  customerId: 'pw-1075-ready',
  reply: 'The keepsake looked wonderful and I would gladly recommend this AI vacation planner.',
  keepsakeStatus: 'shown',
  target: { origin: ssrApi.ALLOWED_STAGING_ORIGIN, destination: 'Hilo', name: 'Taylor Moss' },
});
pwHook.onPricingCheck({
  customerId: 'pw-1075-ready',
  priceUsd: 10,
  reply: 'I would gladly pay $10 right away for this vacation planner.',
  target: { origin: ssrApi.ALLOWED_STAGING_ORIGIN, destination: 'Hilo', name: 'Taylor Moss' },
});
pwHook.onPricingCheck({
  customerId: 'pw-1075-ready',
  priceUsd: 17,
  reply: 'At $17 I am on the fence, though it still looks helpful.',
  target: { origin: ssrApi.ALLOWED_STAGING_ORIGIN, destination: 'Hilo', name: 'Taylor Moss' },
});

const pwCard = pwHook.finalizeCustomer({
  customerId: 'pw-1075-ready',
  customerName: 'Taylor Moss',
  legacyDlr: 4,
});
assert.equal(pwCard.primary_rating_method, 'ssr');
assert.equal(pwCard.ssr.checkpoints.length, 5);

const pwWave = pwHook.finalizeWave();
assert.equal(pwWave.aggregate.has_ssr, true);
assert.equal(pwWave.aggregate.dlr_comparison.is_primary, false);
assert.match(pwWave.markdown, /## SSR Ratings \(Primary\)/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-c11-'));
try {
  const ssrHook = ssrApi.createHarnessSsrHook({
    embedder,
    respond: async (ctx) => ({
      after_setup: 'Smooth AI vacation setup from the start.',
      after_keepsake: 'Loved the keepsake and happy to recommend it.',
      pricing_10: 'Easy yes at $10 for this vacation planner.',
      pricing_17: 'Unsure about $17, on the fence.',
    })[ctx.checkpoint],
  });
  const story = {
    story_id: 'hook-story-1',
    reply_backend: 'openrouter',
    customer: { name: 'Jordan Reed', email_alias: 'jordan-c11' },
    destination: 'Kauai',
    turns: [{ speaker: 'Jordan Reed', modality: 'text', text: 'Plan a quiet Kauai vacation.' }],
    steps: ['onboarding'],
    media: [],
  };
  const wave = await runWave([story], {
    runId: 'wave-c11',
    outRoot: dir,
    concurrency: 1,
    continueOnFail: true,
    ssrHook,
    run: (item, opts) => runCustomer(item, {
      ...opts,
      play: async () => ({
        reason: '',
        liveShaStart: 'sha1',
        liveShaEnd: 'sha1',
        transcript: { turns: [] },
        pdfText: '',
        timings: [],
        steps: ['onboarding'],
        dialogOk: true,
        keepsakeOk: true,
        screensOk: true,
        onboardingPdfOk: true,
        videoExists: true,
        videoPass: true,
        chromeOk: true,
      }),
      cleanup: async () => ({ deleted: {}, remaining: 0 }),
    }),
  });
  assert.equal(wave.cards.length, 1);
  assert.equal(wave.ssr.has_ssr, true);
  assert.ok(fs.existsSync(path.join(wave.dir, 'scoreboard.json')));
  assert.ok(fs.existsSync(path.join(wave.dir, 'scoreboard.md')));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('test_c11_standalone_hooks: ok');
