import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { computePassBDossierMetrics, resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { buildPassBSharedDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { runThingEvidenceDossierStagingTargets, placeFromTarget } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { loadThingEvidenceDossierResolved, tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';

for (const withLedger of [false, true]) for (const reject of [false, true]) {
  test(`operator result agrees with persisted metrics, saved ledger=${withLedger}, rejected text=${reject}`, async () => {
    const all = buildPassBSharedDossierTargets();
    const offset = all.findIndex((target) => target.category === 'restaurant');
    const { targets } = await resolvePassBOperatorTargets({ offset, limit: 1, skipExisting: true }, { authMode: 'operator' });
    assert.equal(targets.length, 1);
    const target = targets[0];
    const summary = `${target.title} serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.`;
    const description = `${target.title} serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables. No reviews found.`;
    const body = `${summary} ${description}`;
    const page = {
      url: target.url, text: body, fetchedAt: '2026-10-26T12:00:00.000Z',
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    const exhausted = ['reviews', 'price', 'hours', 'happyHour', 'address', 'phone', 'website', 'neighborhood', 'coordinates', 'ratings']
      .flatMap((field) => [1, 2, 3].map((attempt) => ({ kind: 'gap_top_up', field, attempt, status: 'failed' })));
    const key = tripPlaceDossierKey(target.tripId, target.placeId);
    const field = (value) => ({ value, claims: [{ text: value, pages: ['p1'], supported: true }] });
    const rows = new Map([[key, {
      thing: target.title, pages: [page], fields: {}, captureCheckpoint: 'after_gather',
      attempts: withLedger ? [{ kind: 'page', status: 'ok', url: page.url }, ...exhausted] : [],
      shortcomings: [...new Set(exhausted.map((row) => row.field))].map((field) => ({
        field, reason: 'offline exhausted top-up', attempts: [1, 2, 3].map((attempt) => ({ attempt })),
      })),
      reviews: [
        'The fish arrived freshly grilled and the vegetables kept their texture through lunch.',
        'Lunch service was attentive while the dining room stayed busy beside the waterfront.',
        'The daily fish dish made a satisfying meal with a generous helping of vegetables.',
        'Waterfront seats offered a pleasant place to linger over the seasonal lunch plates.',
      ].map((text) => ({ text, rating: 4, claims: field(text).claims })),
    }]]);
    const storeImpl = {
      async getDossier(key) { return structuredClone(rows.get(key) || null); },
      async putDossier(key, incoming) {
        const saved = rows.has(key) ? mergeDossierForPersistence(rows.get(key), incoming) : incoming;
        const { hashes, sources } = computeDossierFieldHashes(saved);
        rows.set(key, structuredClone({ ...saved, fieldHashes: hashes, fieldSources: sources }));
      },
    };
    let builds = 0;
    const run = async () => (await runThingEvidenceDossierStagingTargets(targets, {
      env: {}, storeImpl, skipExisting: true, operatorFill: true,
      fetchImpl: async () => assert.fail('offline only'),
      gatherImpl: async () => ({ thing: target.title, pages: [], attempts: [] }),
      extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
      buildImpl: async () => {
        builds += 1;
        const findings = { summary: field(summary), description: field(description) };
        if (!reject) {
          findings.itineraryNote = field(`${target.title} — order the grilled fish beside the waterfront.`);
        }
        return { payload: {}, structuredText: '{}', findings };
      },
      judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: !reject })),
    })).results[0];
    const result = await run();
    const { dossier: saved } = await loadThingEvidenceDossierResolved(key, { env: {}, storeImpl, placeId: target.placeId });
    const metrics = await computePassBDossierMetrics({ env: {}, storeImpl, tripId: target.tripId });
    const metric = metrics.fillTargets.find((row) => row.placeId === target.placeId);
    assert.equal(saved.pages.length, 1);
    if (result.failed) {
      assert.equal(result.status, 'failed');
      assert.ok(result.presentedReasons?.length, 'rejection must name the current presented failure');
      assert.notEqual(result.checkpoint, 'done');
      if (reject) assert.ok(result.presentedReasons.includes('summary:missing'));
      if (!saved.attempts?.length) assert.ok(result.presentedReasons.includes('no_gather_attempts'));
      const count = builds;
      await run();
      assert.equal(builds, count + 2, 'the next call retries failed text with one bounded repair');
    } else {
      assert.equal(result.checkpoint, 'done');
      assert.equal(result.presentedReasons, undefined);
      assert.equal(dossierPresented(saved, placeFromTarget(target)), true, 'done must satisfy the metrics predicate on stored evidence');
      assert.equal(metrics.byType.restaurant.presented, 1);
      assert.equal(metric.needsFill, false, 'successful exhausted row must leave the fill queue');
    }
  });
}
