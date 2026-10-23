#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { addressIsSpecific } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { logXaiUsage } from '../src/vacation/dossier-cost.mjs';
import { applyStoredDossiersToSharedTripSync } from '../src/vacation/shared-trip-dossier-overlay.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import {
  placeFromTarget,
  runThingEvidenceDossierStagingTargets,
} from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/live-shared-gate-b-fill-regression.json', import.meta.url), 'utf8'),
);

const TARGET_IDS = new Set([602, 603, 604, 606, 609, 610, 611]);
const targets = PR336_GATE_B_XAI_PLACE_TARGETS.filter((row) => TARGET_IDS.has(row.rowId));

function writerFindings(dossier = {}) {
  const name = dossier.thing || 'this place';
  return [1, 2, 3, 4].map((i) => ({
    text: `Representative review ${i} about ${name} with enough words describing food, service, and the overall guest experience on recent visits.`,
    rating: 5,
    claims: [{ text: 'guest experience', pages: ['p1'], supported: true }],
  }));
}

function makeRecordingMocks() {
  const calls = {
    rebuildWriter: 0,
    builder: 0,
    extract: 0,
    byPlace: new Map(),
  };
  const bump = (placeId, key) => {
    const row = calls.byPlace.get(placeId) || { rebuildWriter: 0, builder: 0, extract: 0 };
    row[key] += 1;
    calls.byPlace.set(placeId, row);
  };
  return {
    calls,
    buildImpl: async (dossier, { reviewsOnly = false } = {}) => {
      const placeId = dossier.placeId;
      calls.builder += 1;
      if (placeId) bump(placeId, 'builder');
      if (reviewsOnly) {
        calls.rebuildWriter += 1;
        if (placeId) bump(placeId, 'rebuildWriter');
      }
      logXaiUsage(dossier, reviewsOnly ? 'reviews-writer' : 'builder', 'test-model', {
        usage: { input_tokens: 120, output_tokens: 80 },
      });
      dossier.placeId = placeId;
      return {
        payload: {},
        structuredText: JSON.stringify({ reviews: writerFindings(dossier) }),
        findings: reviewsOnly ? { reviews: writerFindings(dossier) } : { summary: { value: dossier.fields?.summary?.value || 'ok', claims: [{ text: 'ok', pages: ['p1'], supported: true }] } },
      };
    },
    extractReviewsImpl: async (dossier) => {
      calls.extract += 1;
      return { reviews: [], keep: null };
    },
    judgeImpl: async (_dossier, ask) => ask.map((item) => ({ id: item.id, supported: true })),
  };
}

function seedStore(dossiers = {}) {
  const rows = new Map();
  return {
    rows,
    async getDossier(key) {
      return rows.get(key) ? JSON.parse(JSON.stringify(rows.get(key))) : null;
    },
    async putDossier(key, dossier) {
      rows.set(key, JSON.parse(JSON.stringify(dossier)));
    },
    seed(id, dossier) {
      rows.set(tripPlaceDossierKey(FIXTURE.tripId, id), JSON.parse(JSON.stringify(dossier)));
    },
    dossiers,
  };
}

const store = seedStore();
for (const [id, dossier] of Object.entries(FIXTURE.dossiers)) {
  store.seed(Number(id), dossier);
}

const mocks = makeRecordingMocks();
const env = { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-model' };

const pass1 = await runThingEvidenceDossierStagingTargets(
  targets.map((t) => ({ ...t, tripId: FIXTURE.tripId, placeId: t.rowId })),
  {
    env,
    storeImpl: store,
    skipExisting: false,
    timeBudgetMs: 52000,
    gatherImpl: async () => { throw new Error('gather must not run on saved dossiers'); },
    buildImpl: (dossier, opts) => {
      const target = targets.find((t) => t.title === dossier.thing || t.ccabKey === dossier.thing);
      dossier.placeId = target?.rowId;
      return mocks.buildImpl(dossier, opts);
    },
    extractReviewsImpl: mocks.extractReviewsImpl,
    judgeImpl: mocks.judgeImpl,
  },
);

const assertions = [];

function record(placeId, label, ok, detail = '') {
  assertions.push({ placeId, label, ok, detail });
  assert.ok(ok, `place ${placeId} ${label}${detail ? `: ${detail}` : ''}`);
}

for (const id of [610, 604, 606]) {
  const placeCalls = mocks.calls.byPlace.get(id) || {};
  record(id, 'pass1 review writer invoked', (placeCalls.rebuildWriter || 0) >= 1, JSON.stringify(placeCalls));
}

for (const id of [609]) {
  const key = tripPlaceDossierKey(FIXTURE.tripId, id);
  const saved = await store.getDossier(key);
  record(id, 'car dossier strips reviews', (saved.reviews || []).length === 0);
}

const dossiersAfterPass1 = {};
for (const id of TARGET_IDS) {
  dossiersAfterPass1[id] = await store.getDossier(tripPlaceDossierKey(FIXTURE.tripId, id));
}

for (const id of [604, 606]) {
  record(id, 'pass1 keeps four reviews', (dossiersAfterPass1[id]?.reviews || []).length >= 4);
}

const shared = applyStoredDossiersToSharedTripSync(
  {
    places: FIXTURE.places.map((p) => ({
      ...p,
      title: p.name,
      sourceRecord: { category: p.category?.name || p.category_name || p.category },
    })),
    thingOverrides: {},
  },
  dossiersAfterPass1,
);

const o610 = shared.thingOverrides['place:610'];
record(610, 'Carbone address served', addressIsSpecific(o610?.address || ''), o610?.address);
record(610, 'Carbone address not missing', !o610?.missingFields?.includes('address'), o610?.missingFields?.join(','));
record(
  610,
  'Carbone happy hour captured or flagged',
  Boolean(o610?.happyHourDetails) || o610?.missingFields?.includes('happyHour'),
  o610?.happyHourDetails,
);

const o603 = shared.thingOverrides['place:603'];
record(603, 'Belleclaire address specific or flagged', addressIsSpecific(o603?.address || '') || o603?.missingFields?.includes('address'), o603?.address);

const o611 = shared.thingOverrides['place:611'];
record(611, 'Blue Note not Dizzy address', !/Broadway at 60th/i.test(o611?.address || ''), o611?.address);
record(611, 'Blue Note address or shortcoming', addressIsSpecific(o611?.address || '') || o611?.missingFields?.includes('address'), o611?.address);
record(611, 'Blue Note phone or shortcoming', Boolean(o611?.phone) || o611?.missingFields?.includes('phone'), o611?.phone);

const o609 = shared.thingOverrides['place:609'];
record(609, 'car has no reviewThemes', o609?.reviewThemes == null);

const beforePass2 = { ...mocks.calls };
const pass2 = await runThingEvidenceDossierStagingTargets(
  targets.map((t) => ({ ...t, tripId: FIXTURE.tripId, placeId: t.rowId })),
  {
    env,
    storeImpl: store,
    skipExisting: false,
    timeBudgetMs: 52000,
    gatherImpl: async () => { throw new Error('gather must not run on pass2'); },
    buildImpl: mocks.buildImpl,
    extractReviewsImpl: mocks.extractReviewsImpl,
    judgeImpl: mocks.judgeImpl,
  },
);

const rebuildDelta = mocks.calls.rebuildWriter - beforePass2.rebuildWriter;
record(0, 'pass2 zero review rebuild writer calls', rebuildDelta === 0, `delta=${rebuildDelta}`);

const carbonePlace = placeFromTarget({
  ...targets.find((t) => t.rowId === 610),
  tripId: FIXTURE.tripId,
  placeId: 610,
});
const budgetStore = seedStore();
budgetStore.seed(610, FIXTURE.dossiers['610']);
const budgetStart = Date.now();
const budgetResult = await fetchXaiPlaceRatings(carbonePlace, {
  env,
  storeImpl: budgetStore,
  timeBudgetMs: 200,
  timeoutMs: 120000,
  gatherImpl: async () => { throw new Error('gather must not run'); },
  buildImpl: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { payload: {}, structuredText: '{}', findings: {} };
  },
  judgeImpl: mocks.judgeImpl,
  extractReviewsImpl: mocks.extractReviewsImpl,
});
const budgetElapsed = Date.now() - budgetStart;
record(
  610,
  'fill respects time budget before platform timeout',
  budgetElapsed < 5000 && (budgetResult.partial === true || budgetResult.skipped === true),
  `elapsedMs=${budgetElapsed} partial=${budgetResult.partial} skipped=${budgetResult.skipped}`,
);

console.log('test_live_shared_gate_b_fill_regression_682 assertions:');
for (const row of assertions) {
  console.log(JSON.stringify(row));
}
console.log('test_live_shared_gate_b_fill_regression_682: ok');
