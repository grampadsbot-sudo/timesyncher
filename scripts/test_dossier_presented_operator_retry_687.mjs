import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { dossierPresented, passbPresentedHardTextViolations } from '../src/vacation/passb-dossier-presented.mjs';
import { searchPlaceFromStoredDossier } from '../src/vacation/shared-trip-dossier-overlay.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { dossierPersistedFillIsNoOp } from '../src/vacation/xai-dossier-fill-state.mjs';

const target = {
  tripId: 'offline-trip', placeId: 'offline-presented', title: 'Harbor Bistro',
  category: 'restaurant', website: 'https://harbor.example/',
};
const key = tripPlaceDossierKey(target.tripId, target.placeId);
const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables. No reviews found.';
const body = `${summary} ${description}`;
const page = {
  url: target.website, text: body, fetchedAt: '2026-10-26T12:00:00.000Z',
  sha256: createHash('sha256').update(body).digest('hex'),
};
const field = (value, supported = true) => ({
  value, url: page.url,
  claims: [{ text: value, pages: ['p1'], supported }],
});
const exhausted = ['reviews', 'price', 'hours', 'happyHour', 'address', 'phone', 'website', 'neighborhood', 'coordinates', 'ratings']
  .flatMap((name) => [1, 2, 3].map((attempt) => ({ kind: 'gap_top_up', field: name, attempt, status: 'failed' })));
function seed() {
  const dossier = {
    thing: target.title, pages: [page], captureCheckpoint: 'done',
    attempts: [{ kind: 'page', status: 'ok', url: page.url }, ...exhausted],
    fields: { summary: field(summary, false), description: field(description, false) },
  };
  const { hashes, sources } = computeDossierFieldHashes(dossier);
  return { ...dossier, fieldHashes: hashes, fieldSources: sources };
}

function fixture({ repair = true, reject = false } = {}) {
  let saved = seed();
  let builds = 0;
  let judges = 0;
  const storeImpl = {
    async getDossier() { return structuredClone(saved); },
    async putDossier(_key, incoming) {
      const merged = mergeDossierForPersistence(saved, incoming);
      const { hashes, sources } = computeDossierFieldHashes(merged);
      saved = structuredClone({ ...merged, fieldHashes: hashes, fieldSources: sources });
    },
  };
  const run = async () => (await runThingEvidenceDossierStagingTargets([target], {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    fetchImpl: async () => assert.fail('no provider requests'),
    gatherImpl: async () => assert.fail('reuse the saved usable page'),
    extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
    buildImpl: async (dossier, options) => {
      if (options.reviewsOnly) return { payload: {}, structuredText: '{}', findings: {} };
      builds += 1;
      assert.equal(options.reviewsOnly, false);
      assert.equal(dossier.pages[0].sha256, page.sha256);
      assert.equal((await storeImpl.getDossier(key)).pages[0].sha256, page.sha256);
      return { payload: {}, structuredText: '{}', findings: {
        summary: field(repair ? summary : `Option: ${summary}`), description: field(description),
      } };
    },
    judgeImpl: async (_dossier, claims) => {
      if (claims.length) judges += 1;
      return claims.map(({ id }) => ({ id, supported: !reject }));
    },
  })).results[0];
  return { run, saved: () => saved, counts: () => ({ builds, judges }), storeImpl };
}

test('operator limit 1 repairs hydrated presented failure despite ok raw counts, fresh hashes and exhausted top-ups', async () => {
  const batch = await resolvePassBOperatorTargets({ limit: 1 }, { authMode: 'operator' });
  assert.equal(batch.targets.length, 1);
  const f = fixture();
  const before = f.saved();
  const counts = computeDossierFieldCounts(before, target);
  assert.equal(counts.summary.status, 'ok');
  assert.equal(counts.description.status, 'ok');
  assert.deepEqual(passbPresentedHardTextViolations({ ...target, summary, description }), []);
  assert.equal(dossierPresented(before, target), false);
  assert.ok(passbPresentedHardTextViolations({ ...target, ...searchPlaceFromStoredDossier(target, before) }).includes('blank_summary'));
  const result = await f.run();
  assert.deepEqual(f.counts(), { builds: 1, judges: 1 }, 'silent done with unchanged unsupported text is a failure');
  assert.equal(result.failed, false);
  assert.equal(result.skipped, undefined);
  assert.equal(result.pagesAdded, 0);
  assert.equal(result.pageCount, 1);
  assert.equal(dossierPresented(f.saved(), target), true);
  assert.equal(dossierPersistedFillIsNoOp(before, before, target), false);
  await f.run();
  assert.deepEqual(f.counts(), { builds: 1, judges: 1 }, 'successful repair is reused');
});

for (const reject of [false, true]) test(`failed presented repair names current rules and exhausts unchanged evidence (judge rejection=${reject})`, async () => {
  const f = fixture({ repair: false, reject });
  const result = await f.run();
  assert.equal(result.failed, true);
  assert.equal(result.status, 'failed');
  assert.ok(result.presentedReasons.includes(reject ? 'summary:missing' : 'summary_banned_prefix'));
  assert.equal(result.skipped, undefined);
  assert.equal(result.pagesAdded, 0);
  assert.equal(dossierPresented(f.saved(), target), false);
  assert.deepEqual(f.counts(), { builds: 2, judges: 2 }, 'existing builder repair and judge run once each');
  const repeat = await f.run();
  assert.equal(repeat.failed, true);
  assert.ok(repeat.presentedReasons.includes(reject ? 'blank_summary' : 'summary_banned_prefix'));
  assert.deepEqual(f.counts(), { builds: 2, judges: 2 }, 'exhausted evidence cannot loop through paid text rebuilds');
});

test('new saved evidence permits one more bounded text repair after exhaustion', async () => {
  const f = fixture({ repair: false });
  await f.run();
  const next = f.saved();
  next.pages = [...next.pages, { ...page, url: `${target.website}menu` }];
  await f.storeImpl.putDossier(key, next);
  const result = await f.run();
  assert.equal(result.failed, true);
  assert.ok(result.presentedReasons.includes('summary_banned_prefix'));
  assert.deepEqual(f.counts(), { builds: 4, judges: 4 });
  await f.run();
  assert.deepEqual(f.counts(), { builds: 4, judges: 4 });
});
