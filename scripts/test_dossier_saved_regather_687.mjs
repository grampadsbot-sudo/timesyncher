import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';

const target = {
  tripId: 'offline-trip', placeId: 'saved-regather', title: 'Harbor Bistro',
  category: 'restaurant', website: 'https://harbor.example/',
};
const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables. No reviews found.';
const field = (value) => ({ value, claims: [{ text: value, pages: ['p1'], supported: true }] });

for (const pageCount of [1, 2]) for (const reject of [false, true]) {
  test(`operator reuses ${pageCount} saved restaurant pages mentioning another venue, judge rejection=${reject}`, async () => {
    const body = `${summary} ${description} The nearby Other Restaurant is a separate business.`;
    const pages = Array.from({ length: pageCount }, (_, i) => ({
      url: `${target.website}${i ? 'menu' : ''}`, text: body,
      fetchedAt: '2026-10-26T12:00:00.000Z', sha256: createHash('sha256').update(body).digest('hex'),
    }));
    let saved = {
      thing: target.title, pages, fields: {}, captureCheckpoint: 'after_gather',
      attempts: [{ kind: 'page', status: 'ok', url: pages[0].url }],
    };
    const storeImpl = {
      async getDossier() { return structuredClone(saved); },
      async putDossier(_key, incoming) {
        const merged = mergeDossierForPersistence(saved, incoming);
        const { hashes, sources } = computeDossierFieldHashes(merged);
        saved = structuredClone({ ...merged, fieldHashes: hashes, fieldSources: sources });
      },
    };
    let gathers = 0, builds = 0, judges = 0;
    const run = async () => (await runThingEvidenceDossierStagingTargets([target], {
      env: {}, storeImpl, skipExisting: true, operatorFill: true,
      fetchImpl: async () => assert.fail('offline only'),
      gatherImpl: async () => { gathers += 1; return { thing: target.title, pages: [], attempts: [] }; },
      extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
      buildImpl: async (dossier) => {
        builds += 1;
        assert.deepEqual(dossier.pages.map((page) => page.sha256), pages.map((page) => page.sha256));
        assert.equal(dossier.emptySource, null);
        return { payload: {}, structuredText: '{}', findings: { summary: field(summary), description: field(description) } };
      },
      judgeImpl: async (_dossier, claims) => {
        judges += 1;
        return claims.map(({ id }) => ({ id, supported: !reject }));
      },
    })).results[0];
    const result = await run();
    assert.notEqual(result.error, 'gather_no_pages', 'saved target evidence must reach the builder');
    assert.equal(gathers, 0);
    assert.ok(builds > 0 && judges > 0);
    assert.equal(result.pageCount, pageCount);
    assert.equal(result.pagesAdded, 0);
    assert.deepEqual(saved.pages.map((page) => page.sha256), pages.map((page) => page.sha256));
    assert.equal(normalizeDossierEvidence(saved, target).pages.length, pageCount);
    if (reject) {
      assert.equal(result.failed, true);
      assert.ok(result.presentedReasons.includes('summary:missing'));
      const count = builds;
      await run();
      assert.equal(builds, count, 'unchanged rejected evidence is exhausted');
    } else {
      assert.equal(result.failed, false);
      assert.equal(result.checkpoint, 'done');
      assert.equal(dossierPresented(saved, target), true);
    }
  });
}

test('saved restaurant pages clear an old empty-source failure and permit the revised text repair once', async () => {
  const text = `${summary} ${description}`;
  const pages = [{ url: target.website, text, fetchedAt: '2026-10-26T12:00:00Z', sha256: createHash('sha256').update(text).digest('hex') }];
  const evidenceHash = createHash('sha256').update(JSON.stringify(pages.map(({ url, sha256 }) => [url, sha256]))).digest('hex');
  let saved = {
    thing: target.title, pages, fields: {}, emptySource: 'gather_no_pages',
    attempts: [{ kind: 'builder', step: 'operator_presented_text_retry', status: 'failed', evidenceHash }],
  };
  let builds = 0;
  const result = await runThingEvidenceDossierStagingTargets([target], {
    env: {}, operatorFill: true,
    storeImpl: {
      getDossier: async () => structuredClone(saved),
      putDossier: async (_key, dossier) => { saved = structuredClone(dossier); },
    },
    gatherImpl: async () => assert.fail('usable evidence must be reused'),
    fetchImpl: async () => assert.fail('no search during saved text repair'),
    buildImpl: async () => {
      builds += 1;
      return { payload: {}, structuredText: '', findings: { summary: field(summary), description: field(description) } };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true })),
  });
  assert.equal(builds, 1);
  assert.equal(result.results[0].failed, false);
  assert.equal(saved.emptySource, null);
  assert.equal(dossierPresented(saved, target), true);
});
