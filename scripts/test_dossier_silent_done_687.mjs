import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { completeDossierFill, dossierPersistedFillIsNoOp, saveFailedDossierAttempt, saveResumablePartial } from '../src/vacation/xai-dossier-fill-state.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { target, page, summary, description, field, judge } from './lib/dossier-round4-test-support.mjs';

const place = { ...target, id: target.placeId, category: 'flight' };
const key = `trip:${target.tripId}:place:${place.id}`;
const supported = (value) => ({ ...field(value), claims: field(value).claims.map((claim) => ({ ...claim, supported: true })) });
function dossier() {
  const raw = {
    thing: place.title, pages: [page()], captureCheckpoint: 'done',
    attempts: [{ kind: 'page', status: 'ok' }],
    fields: { summary: supported(summary), description: supported(description), itineraryNote: supported('Try the grilled fish.'), price: supported(40) },
  };
  const { hashes, sources } = computeDossierFieldHashes(raw);
  return { ...raw, fieldHashes: hashes, fieldSources: sources };
}
function memoryStore(initial, corruptOnDone = null) {
  let saved = structuredClone(initial);
  return {
    async getDossier(rowKey) { return rowKey === key ? structuredClone(saved) : null; },
    async putDossier(_key, incoming) {
      const raw = incoming.captureCheckpoint === 'done' && corruptOnDone ? corruptOnDone(incoming) : incoming;
      const { hashes, sources } = computeDossierFieldHashes(raw);
      saved = structuredClone({ ...raw, fieldHashes: hashes, fieldSources: sources });
    },
  };
}
const unexpected = async () => assert.fail('offline reuse must not call a provider');
const options = (storeImpl) => ({
  env: {}, storeImpl, dossierKey: key, fetchImpl: unexpected, gatherImpl: unexpected,
  buildImpl: unexpected, judgeImpl: judge, extractReviewsImpl: unexpected,
});
function assertBlocked(result, saved) {
  assert.equal(result.failed, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.stopReason, 'silent_done_blocked');
  assert.equal(result.skipped, undefined);
  assert.equal(result.checkpoint || saved.captureCheckpoint, 'failed-presented');
  assert.equal(saved.captureCheckpoint, 'failed-presented');
}

for (const [label, corrupt] of [
  ['missing payload', (raw) => ({ ...raw, pages: [] })],
  ['missing attempt ledger', (raw) => ({ ...raw, attempts: [] })],
  ['unpresented fields', (raw) => ({ ...raw, fields: {} })],
]) test(`completion rejects done with ${label}`, () => {
  const raw = corrupt(dossier());
  assert.equal(dossierPresented(raw, place), false);
  assertBlocked(completeDossierFill(raw, place), raw);
});

test('saved payload reuse can finish with zero added pages', async () => {
  const storeImpl = memoryStore(dossier());
  const result = await fetchXaiPlaceRatings(place, options(storeImpl));
  assert.equal(result.skipped, true);
  assert.notEqual(result.failed, true);
  assert.equal(result.parsed.evidenceDossier.captureCheckpoint, 'done');
  const run = await runThingEvidenceDossierStagingTargets([{ ...target, category: place.category, dossierKey: key }], {
    ...options(storeImpl), operatorFill: true, skipExisting: true,
  });
  assert.equal(run.results[0].checkpoint, 'done');
  assert.equal(run.results[0].pagesAdded, 0);
  assert.equal(run.results[0].failed, false);
  assert.equal(dossierPresented(await storeImpl.getDossier(key), place), true);
});

for (const earlyNoop of [true, false]) test(`product ${earlyNoop ? 'early no-op' : 'skipBuilder'} blocks weak light records`, async () => {
  const raw = dossier();
  raw.attempts = [];
  raw.fields.summary = supported('Short note');
  raw.fields.description = supported('Short details');
  if (!earlyNoop) delete raw.fields.price;
  const hashed = computeDossierFieldHashes(raw);
  const saved = { ...raw, fieldHashes: hashed.hashes, fieldSources: hashed.sources };
  assert.equal(dossierPersistedFillIsNoOp(saved, normalizeDossierEvidence(saved, place), place), earlyNoop);
  const storeImpl = memoryStore(saved);
  const result = await fetchXaiPlaceRatings(place, options(storeImpl));
  assert.equal(result.skipped, false);
  assertBlocked({ ...result, skipped: result.skipped || undefined }, await storeImpl.getDossier(key));
});

for (const [label, corrupt, pagesAdded] of [
  ['payload lost at storage boundary', (raw) => ({ ...raw, pages: [] }), 0],
  ['fields lost at storage boundary', (raw) => ({ ...raw, fields: {} }), 1],
]) test(`operator checks persisted payload: ${label}`, async () => {
  const storeImpl = memoryStore(null, corrupt);
  const run = await runThingEvidenceDossierStagingTargets([{ ...target, category: place.category, dossierKey: key }], {
    ...options(storeImpl), operatorFill: true,
    gatherImpl: async () => dossier(),
    buildImpl: async () => ({ findings: { summary: field(summary), description: field(description), itineraryNote: field('Try the grilled fish.') } }),
  });
  assertBlocked(run.results[0], await storeImpl.getDossier(key));
  assert.equal(run.results[0].pagesAdded, pagesAdded);
});

for (const save of [saveResumablePartial, (raw, persisted, opts) => saveFailedDossierAttempt(persisted, raw, { ...opts, error: new Error('offline failure') })]) {
  test(`${save.name || 'failed attempt'} cannot preserve a stale done checkpoint`, async () => {
    const raw = { ...dossier(), pages: [] };
    const storeImpl = memoryStore(raw);
    const result = await save(raw, raw, { key, place, env: {}, storeImpl });
    assertBlocked(result, await storeImpl.getDossier(key));
  });
}
