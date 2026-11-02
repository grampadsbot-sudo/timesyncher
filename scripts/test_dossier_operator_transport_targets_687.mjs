import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import * as inventory from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { computePassBDossierMetrics, resolvePassBOperatorTargets } from '../src/vacation/passb-dossier-metrics.mjs';
import { runThingEvidenceDossierStagingTargets, placeFromTarget } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { tripPlaceDossierKey, saveThingEvidenceDossier, loadThingEvidenceDossier } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';

test('operator metrics and one-row walk reach all existing shared and trip-attached Things', async () => {
  const all = inventory.buildNycThingEvidenceDossierTargets();
  const shared = inventory.buildPassBSharedDossierTargets();
  const metrics = await computePassBDossierMetrics({ env: {}, storeImpl: memoryStore() });
  assert.equal(metrics.fillTargets.length, all.length);
  assert.equal(metrics.passBSharedInventory.total, shared.length);
  assert.deepEqual(metrics.fillTargets.slice(0, shared.length).map((row) => row.placeId), shared.map((row) => row.placeId));
  for (const type of ['flight', 'car', 'restaurant', 'store', 'hotel', 'attraction']) {
    const targets = metrics.fillTargets.filter((row) => row.type === type);
    assert.equal(targets.length, metrics.inventory.byType[type]);
    assert.ok(targets.every((row) => row.needsFill && row.pageCount === 0));
  }
  const visited = [];
  for (const metric of metrics.fillTargets) {
    const resolved = await resolvePassBOperatorTargets({ offset: metric.offset, limit: 500, targets: [{ placeId: 'ignored' }] }, { authMode: 'operator' });
    assert.equal(resolved.targets.length, 1);
    assert.equal(resolved.batch.total, all.length);
    assert.equal(resolved.targets[0].placeId, metric.placeId);
    assert.equal(resolved.targets[0].sharedLibrary, !['flight', 'car'].includes(metric.type));
    visited.push(resolved.targets[0].placeId);
  }
  assert.deepEqual([...visited].sort(), all.map((row) => row.placeId).sort());
  assert.equal((await resolvePassBOperatorTargets({ offset: all.length }, { authMode: 'operator' })).targets.length, 0);
  const worker = await resolvePassBOperatorTargets({ usePassBInventory: true }, { authMode: 'worker' });
  assert.equal(worker.targets.length, shared.length);
});

test('alternate fixture inventory preserves trip identities and shared membership', () => {
  const rows = [{ id: 'f', cat: 'flight' }, { id: 'c', cat: 'car' }, { id: 'r', cat: 'restaurant' }];
  const placesById = Object.fromEntries(rows.map((row) => [row.id, { title: `Fixture ${row.cat}`, category: row.cat }]));
  const targets = inventory.buildPassBOperatorDossierTargets({ rows, placesById, tripId: 'fixture-trip' });
  assert.deepEqual(targets.map((row) => row.placeId), ['r', 'f', 'c']);
  assert.deepEqual(targets.map((row) => row.sharedLibrary), [true, false, false]);
  assert.ok(targets.every((row) => row.tripId === 'fixture-trip'));
});

for (const type of ['flight', 'car']) test(`operator repairs a page-present ${type} through its trip dossier`, async () => {
  const target = inventory.buildNycThingEvidenceDossierTargets().find((row) => row.category === type);
  const place = placeFromTarget(target);
  const summary = `${place.title} provides a booking with a stated route, schedule and fare recorded on the saved provider page.`;
  const description = `${place.title} provides a booking with a stated route, schedule and fare recorded on the saved provider page. The booking information includes departure and arrival locations along with the travel dates. The provider explains the fare conditions and the included services, so the recorded details describe the specific booking rather than an unrelated restaurant or attraction.`;
  const text = `${summary} ${description}`;
  const pages = [{ url: 'https://provider.example/booking', text, fetchedAt: '2026-10-26T12:00:00Z', sha256: createHash('sha256').update(text).digest('hex') }];
  const storeImpl = memoryStore();
  const key = tripPlaceDossierKey(target.tripId, target.placeId);
  await saveThingEvidenceDossier(key, { thing: place.title, pages, fields: {}, attempts: [{ kind: 'page', status: 'ok' }] }, { env: {}, storeImpl });
  const before = await computePassBDossierMetrics({ env: {}, storeImpl });
  const metric = before.fillTargets.find((row) => row.placeId === target.placeId);
  assert.ok(metric);
  assert.equal(metric.pageCount, 1);
  assert.equal(metric.needsFill, true);
  const resolved = await resolvePassBOperatorTargets({ offset: metric.offset }, { authMode: 'operator' });
  let builds = 0;
  const result = await runThingEvidenceDossierStagingTargets(resolved.targets, {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    gatherImpl: async () => assert.fail('saved transport pages must be reused'),
    fetchImpl: async () => assert.fail('offline transport fixture only'),
    buildImpl: async () => {
      builds += 1;
      const field = (value) => ({ value, claims: [{ text: value, pages: ['p1'] }] });
      return { payload: {}, structuredText: '', findings: { summary: field(summary), description: field(description) } };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id, text: claim }) => ({ id, supported: text.includes(claim) })),
  });
  assert.equal(builds, 1);
  assert.equal(result.results[0].failed, false);
  const saved = await loadThingEvidenceDossier(key, { env: {}, storeImpl });
  assert.equal(dossierPresented(saved, place), true);
  assert.equal(computeDossierFieldCounts(saved, place).reviews.status, 'ok');
  const after = await computePassBDossierMetrics({ env: {}, storeImpl });
  assert.equal(after.byType[type].presented, 1);
  assert.ok([...storeImpl.rows.keys()].every((storedKey) => storedKey.startsWith('trip:')));
});
