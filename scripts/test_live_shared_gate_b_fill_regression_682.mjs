#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import handler from '../routes/thing-evidence-dossiers.mjs';
import { addressIsSpecific } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierReviewsPassValidityGate, dossierReviewsShouldRunWriter } from '../src/vacation/dossier-reviews-rebuild.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { pickFlightListRowSummaryText } from '../src/vacation/flight-list-row-summary.mjs';
import { logXaiUsage } from '../src/vacation/dossier-cost.mjs';
import { applyStoredDossiersToSharedTripSync } from '../src/vacation/shared-trip-dossier-overlay.mjs';
import {
  __setDossierFillTestImpls,
  placeFromTarget,
} from '../src/vacation/thing-evidence-dossier-execution.mjs';
import {
  tripPlaceDossierKey,
  useThingEvidenceDossierStore,
} from '../src/vacation/thing-evidence-dossier-store.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-rebuild.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/live-shared-gate-b-fill-regression.json', import.meta.url), 'utf8'),
);

const TARGET_IDS = new Set([601, 602, 603, 604, 605, 606, 607, 609, 610, 611]);
const targets = PR336_GATE_B_XAI_PLACE_TARGETS.filter((row) => TARGET_IDS.has(row.rowId));

function writerFindings(dossier = {}) {
  const name = dossier.thing || 'this place';
  const pageId = dossier.pages?.length ? 'p1' : 'p1';
  return [1, 2, 3, 4].map((i) => ({
    text: `Representative review ${i} about ${name} with enough words describing food, service, and the overall guest experience on recent visits.`,
    rating: 5,
    verdict: i === 1,
    claims: [{ text: `${name} guest experience`, pages: [pageId], supported: true }],
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
      logXaiUsage(dossier, reviewsOnly ? 'reviews-writer' : 'builder', 'test-place-model', {
        usage: { input_tokens: 120, output_tokens: 80 },
      });
      dossier.placeId = placeId;
      return {
        payload: {},
        structuredText: JSON.stringify({ reviews: writerFindings(dossier) }),
        findings: reviewsOnly
          ? { reviews: writerFindings(dossier) }
          : {
            summary: {
              value: dossier.fields?.summary?.value || 'Restored summary with enough words about this place for guests.',
              claims: [{ text: 'place', pages: ['p1'], supported: true }],
            },
            description: {
              value: dossier.fields?.description?.value || 'Restored description with enough words about this place for guests planning a visit.',
              claims: [{ text: 'place', pages: ['p1'], supported: true }],
            },
          },
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
      const { hashes, sources } = computeDossierFieldHashes(dossier);
      rows.set(key, {
        ...JSON.parse(JSON.stringify(dossier)),
        fieldHashes: hashes,
        fieldSources: sources,
      });
    },
    seed(id, dossier) {
      rows.set(tripPlaceDossierKey(FIXTURE.tripId, id), JSON.parse(JSON.stringify(dossier)));
    },
    dossiers,
  };
}

async function postWorkerFill(body, { env, storeImpl, mocks }) {
  process.env.TIMESYNCHER_WORKER_TOKEN = env.TIMESYNCHER_WORKER_TOKEN || 'test';
  process.env.XAI_API_KEY = env.XAI_API_KEY;
  useThingEvidenceDossierStore(storeImpl);
  __setDossierFillTestImpls({
    storeImpl,
    gatherImpl: async () => { throw new Error('gather must not run on saved dossiers'); },
    buildImpl: (dossier, opts) => {
      const target = targets.find((t) => t.title === dossier.thing || t.ccabKey === dossier.thing);
      dossier.placeId = target?.rowId;
      return mocks.buildImpl(dossier, opts);
    },
    extractReviewsImpl: mocks.extractReviewsImpl,
    judgeImpl: mocks.judgeImpl,
  });
  let status = 0;
  let json = null;
  await handler({
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.TIMESYNCHER_WORKER_TOKEN}`, 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  }, {
    statusCode: 0,
    setHeader() {},
    end(payload) {
      json = JSON.parse(String(payload));
      status = this.statusCode;
    },
    get statusCode() { return status; },
    set statusCode(code) { status = code; },
  });
  return { status, json };
}

const store = seedStore();
for (const [id, dossier] of Object.entries(FIXTURE.dossiers)) {
  store.seed(Number(id), dossier);
}

const mocks = makeRecordingMocks();
const env = { XAI_API_KEY: 'test-key', XAI_PLACE_SEARCH_MODEL: 'test-place-model', TIMESYNCHER_WORKER_TOKEN: 'test' };

const workerBody = {
  targets: targets.map((t) => ({ ...t, tripId: FIXTURE.tripId, placeId: t.rowId })),
  skipExisting: false,
  timeBudgetMs: 52000,
  enableTestImpls: true,
};

const { status: pass1Status, json: pass1 } = await postWorkerFill(workerBody, { env, storeImpl: store, mocks });
assert.equal(pass1Status, 200);
assert.equal(pass1.ok, true);

const assertions = [];

function record(placeId, label, ok, detail = '') {
  assertions.push({ placeId, label, ok, detail });
  assert.ok(ok, `place ${placeId} ${label}${detail ? `: ${detail}` : ''}`);
}

for (const id of [610, 604, 606]) {
  const placeCalls = mocks.calls.byPlace.get(id) || {};
  record(id, 'pass1 review writer invoked', (placeCalls.rebuildWriter || 0) >= 1, JSON.stringify(placeCalls));
  const row = pass1.results.find((r) => r.rowId === id);
  record(id, 'pass1 not falsely skipped', row?.skipped !== 'existing_dossier', JSON.stringify(row));
  const saved = await store.getDossier(tripPlaceDossierKey(FIXTURE.tripId, id));
  const placeCtx = placeFromTarget({ ...targets.find((t) => t.rowId === id), tripId: FIXTURE.tripId, placeId: id });
  record(id, 'pass1 saved reviews pass validity gate', dossierReviewsPassValidityGate(saved, placeCtx), JSON.stringify(saved?.reviews?.[0]?.claims));
}

for (const id of [609]) {
  const key = tripPlaceDossierKey(FIXTURE.tripId, id);
  const saved = await store.getDossier(key);
  record(id, 'car dossier strips reviews', (saved.reviews || []).length === 0);
}

const dossiersAfterPass1 = {};
for (const id of TARGET_IDS) {
  if (id === 601) continue;
  dossiersAfterPass1[id] = await store.getDossier(tripPlaceDossierKey(FIXTURE.tripId, id));
}

for (const id of [604, 606, 610]) {
  record(id, 'pass1 keeps four reviews', (dossiersAfterPass1[id]?.reviews || []).length >= 4);
}

const shared = applyStoredDossiersToSharedTripSync(
  {
    places: FIXTURE.places.map((p) => ({
      ...p,
      title: p.name,
      sourceRecord: p.sourceRecord || { category: p.category?.name || p.category_name || p.category },
    })),
    thingOverrides: {},
  },
  dossiersAfterPass1,
);

for (const id of [602, 604, 605, 606, 607]) {
  const o = shared.thingOverrides[`place:${id}`];
  const desc = o?.longDetails || o?.description || '';
  record(id, 'description served after fill', desc.length >= 80, desc.slice(0, 80));
}

for (const id of [610, 604, 606]) {
  const o = shared.thingOverrides[`place:${id}`];
  record(id, 'public review1 served', Boolean(o?.review1), o?.review1?.slice?.(0, 40));
}

const o610 = shared.thingOverrides['place:610'];
record(610, 'Carbone address served', addressIsSpecific(o610?.address || ''), o610?.address);
record(610, 'Carbone address not missing', !o610?.missingFields?.includes('address'), o610?.missingFields?.join(','));
record(610, 'Carbone logo on override', Boolean(o610?.logoUrl), o610?.logoUrl);
record(
  610,
  'Carbone happy hour captured or flagged',
  Boolean(o610?.happyHourDetails) || o610?.missingFields?.includes('happyHour'),
  o610?.happyHourDetails,
);

const o603 = shared.thingOverrides['place:603'];
record(603, 'Belleclaire address specific or flagged', addressIsSpecific(o603?.address || '') || o603?.missingFields?.includes('address'), o603?.address);
record(603, 'Belleclaire Broadway address', /2175\s+Broadway/i.test(o603?.address || ''), o603?.address);

const o611 = shared.thingOverrides['place:611'];
record(611, 'Blue Note not Dizzy address', !/Broadway at 60th/i.test(o611?.address || ''), o611?.address);
record(611, 'Blue Note address or shortcoming', addressIsSpecific(o611?.address || '') || o611?.missingFields?.includes('address'), o611?.address);
record(611, 'Blue Note phone or shortcoming', Boolean(o611?.phone) || o611?.missingFields?.includes('phone'), o611?.phone);
record(611, 'Blue Note bluenote website', /bluenotejazz\.com/i.test(o611?.website || ''), o611?.website);
record(611, 'Blue Note logo on override', /bluenotejazz\.com/i.test(o611?.logoUrl || ''), o611?.logoUrl);
record(611, 'Blue Note ccabKey target', placeFromTarget(targets.find((t) => t.rowId === 611)).sourceRecord?.website?.includes('bluenotejazz'), placeFromTarget(targets.find((t) => t.rowId === 611)).sourceRecord?.website);

const o609 = shared.thingOverrides['place:609'];
record(609, 'car has no reviewThemes', o609?.reviewThemes == null);

const flightPlace = FIXTURE.places.find((p) => p.id === 601);
const flightSummary = pickFlightListRowSummaryText(flightPlace?.sourceRecord?.description || flightPlace?.description || '');
record(601, 'flight list row summary useful', /Route:/i.test(flightSummary) && /Airline:/i.test(flightSummary), flightSummary);

for (const id of [610, 604, 606]) {
  const saved = await store.getDossier(tripPlaceDossierKey(FIXTURE.tripId, id));
  const placeCtx = placeFromTarget({ ...targets.find((t) => t.rowId === id), tripId: FIXTURE.tripId, placeId: id });
  const norm = normalizeDossierEvidence({ ...saved }, placeCtx);
  record(id, 'pass2 should skip writer before fill', !dossierReviewsShouldRunWriter(saved, norm, placeCtx), `hash=${saved?.reviewsEvidencePageHash?.slice?.(0, 12)}`);
}

const beforePass2ByPlace = new Map(
  [...mocks.calls.byPlace.entries()].map(([id, row]) => [id, row.rebuildWriter || 0]),
);
const { json: pass2 } = await postWorkerFill(workerBody, { env, storeImpl: store, mocks });
assert.equal(pass2.ok, true);

for (const id of [610, 604, 606]) {
  const after = mocks.calls.byPlace.get(id)?.rebuildWriter || 0;
  const before = beforePass2ByPlace.get(id) || 0;
  record(id, 'pass2 zero review rebuild writer calls', after - before === 0, `delta=${after - before}`);
}

const carbonePlace = placeFromTarget({
  ...targets.find((t) => t.rowId === 610),
  tripId: FIXTURE.tripId,
  placeId: 610,
});
const budgetStore = seedStore();
const budgetDossier = JSON.parse(JSON.stringify(FIXTURE.dossiers['610']));
delete budgetDossier.fieldHashes;
delete budgetDossier.reviewsEvidencePageHash;
budgetStore.seed(610, budgetDossier);
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
  budgetElapsed < 5000,
  `elapsedMs=${budgetElapsed} partial=${budgetResult.partial} resumable=${budgetResult.resumable} skipped=${budgetResult.skipped}`,
);

console.log('test_live_shared_gate_b_fill_regression_682 assertions:');
for (const row of assertions) {
  console.log(JSON.stringify(row));
}
console.log('test_live_shared_gate_b_fill_regression_682: ok');
