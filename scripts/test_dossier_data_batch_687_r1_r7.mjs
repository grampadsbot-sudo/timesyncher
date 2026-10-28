#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dossierBuilderEvidenceHints, dossierForModel } from '../src/vacation/dossier-cost.mjs';
import { hydrateScalarFieldsFromEvidence, normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierBuilderPrompt } from '../src/vacation/xai-grok-place-ratings.mjs';
import {
  prepareDossierFindings,
  ratingQuoteSupportsAggregate,
} from '../src/vacation/thing-dossier-fields.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { buildNycThingEvidenceDossierTargets } from './build_nyc_thing_evidence_dossiers.mjs';
import { placeFromTarget } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import {
  bindSharedThingEvidenceDossier,
  loadThingEvidenceDossier,
  loadTripPlaceDossiersFromStore,
  loadTripPlaceDossiersFromDisk,
  saveThingEvidenceDossier,
  tripPlaceDossierKey,
} from '../src/vacation/thing-evidence-dossier-store.mjs';

function page(url, textBody) {
  const body = textBody.trim();
  return {
    url,
    fetchedAt: new Date().toISOString(),
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

assert.equal(
  ratingQuoteSupportsAggregate('Rated 4.2 out of 5 from 5,747 reviews on Trustindex.', 4.2, 5747),
  true,
);
assert.equal(
  ratingQuoteSupportsAggregate('Call 212-475-8592 for reservations; menu from 4.2 to 5747 dollars.', 4.2, 5747),
  false,
);

const hoursDossier = {
  thing: 'Blue Note Jazz Club',
  pages: [page('https://www.bluenotejazz.net/', 'Blue Note Jazz Club jazz shows nightly in Greenwich Village.')],
  fields: { hours: { value: 'Mon-Sun 8pm-12am', claims: [{ text: '8pm', pages: ['p1'], supported: true }] } },
};
const slim = dossierForModel(hoursDossier, { perPage: 400, total: 2000, want: 'facts' });
assert.equal(slim.evidenceHints?.hours, 'Mon-Sun 8pm-12am');
assert.match(dossierBuilderPrompt(hoursDossier, { includeReviews: true }), /evidenceHints/);

const shortSummary = 'Blue Note Jazz Club is a classic Greenwich Village jazz room for late sets and touring artists nightly.';
const summaryCounts = computeDossierFieldCounts({
  thing: 'Blue Note Jazz Club',
  pages: hoursDossier.pages,
  fields: { summary: { value: shortSummary } },
}, { title: 'Blue Note Jazz Club' });
assert.equal(summaryCounts.summary.status, 'ok');
assert.equal(shortSummary.split(/\s+/).length, 18);

const place = {
  title: 'Hotel Belleclaire',
  category: 'hotel',
  lat: 40.7829,
  lng: -73.9805,
  neighborhood: 'Upper West Side',
};
const hydrated = hydrateScalarFieldsFromEvidence({
  thing: place.title,
  pages: [page('https://www.hotelbelleclaire.com/', 'Hotel Belleclaire on the Upper West Side near Central Park.')],
  fields: {},
}, place);
assert.equal(hydrated.fields.neighborhood?.value, 'Upper West Side');
assert.equal(Number(hydrated.fields.lat?.value), 40.7829);
assert.equal(Number(hydrated.fields.lng?.value), -73.9805);

const ratingQuote = 'Rated 4.2 out of 5 from 5,747 reviews on Trustindex.';
const ratingPage = page(
  'https://trustindex.example/ratings',
  `Blue Note Jazz Club on Trustindex. ${ratingQuote}`,
);
ratingPage.braveRating = {
  average: 4.2,
  count: 5747,
  scaleMax: 5,
  quote: ratingQuote,
  url: ratingPage.url,
};
const built = prepareDossierFindings(
  { thing: 'Blue Note Jazz Club', pages: [ratingPage] },
  {
    rating: {
      average: 4.2,
      count: 5747,
      scaleMax: 5,
      quote: ratingQuote,
      url: ratingPage.url,
    },
  },
);
assert.equal(built.rating, 4.2);
assert.equal(built.reviewsAvailable, 5747);

const normalized = normalizeDossierEvidence(hydrated, place);
assert.equal(normalized.fieldCounts.coordinates.status, 'ok');
assert.equal(normalized.fieldCounts.neighborhood.status, 'ok');

const targets = buildNycThingEvidenceDossierTargets();
assert.equal(targets.length, 100);
assert.equal(new Set(targets.map((target) => target.placeId)).size, 100);
const inventory = {};
for (const target of targets) {
  const category = ['event', 'activity', 'attraction'].includes(target.category) ? 'attraction' : target.category;
  inventory[category] = (inventory[category] || 0) + 1;
  const resolved = placeFromTarget(target);
  assert.equal(resolved.id, target.rowId);
  assert.equal(resolved.trip_id, 99);
  assert.equal(resolved.url, target.url);
  assert.equal(resolved.address, target.address);
  assert.equal(resolved.lat ?? null, target.lat ?? target.sourceRecord.lat ?? null);
  assert.equal(resolved.sourceRecord.longDetails, target.sourceRecord.longDetails);
}
assert.deepEqual(inventory, { flight: 16, store: 15, hotel: 22, attraction: 15, car: 7, restaurant: 25 });
const customTargets = buildNycThingEvidenceDossierTargets({
  rows: [{ id: 'fresh' }],
  placesById: { fresh: { title: 'New venue', category: 'store', address: '45 North St' } },
  tripId: 'different-trip',
});
assert.equal(customTargets[0].tripId, 'different-trip');
assert.equal(customTargets[0].title, 'New venue');
assert.throws(() => buildNycThingEvidenceDossierTargets({ rows: [{ id: 'missing' }], placesById: {} }), /missing dossier inventory/);

const rows = new Map();
const storeImpl = {
  async getDossier(key) { return structuredClone(rows.get(key) || null); },
  async putDossier(key, dossier) { rows.set(key, structuredClone(dossier)); },
};
const sharedPlace = {
  id: 'one', trip_id: 'first', title: 'Harbor Store', category: 'store',
  address: '12 Harbor St, Boston, MA', url: 'https://harbor.example/',
};
const old = { thing: sharedPlace.title, pages: [page(sharedPlace.url, 'Harbor Store sells local books and maps along the waterfront.')], attempts: [{ kind: 'page', status: 'ok' }] };
await saveThingEvidenceDossier(tripPlaceDossierKey('first', 'one'), old, { storeImpl });
const sharedKey = await bindSharedThingEvidenceDossier(sharedPlace, { storeImpl });
assert.match(sharedKey, /^shared:store:/);
assert.deepEqual((await loadThingEvidenceDossier(sharedKey, { storeImpl })).pages, old.pages);
assert.equal((await loadThingEvidenceDossier(sharedKey, { storeImpl })).tripUseCount, 1);
assert.equal(await bindSharedThingEvidenceDossier(sharedPlace, { storeImpl }), sharedKey);
assert.equal((await loadThingEvidenceDossier(sharedKey, { storeImpl })).attempts.length, 1);
const second = { ...sharedPlace, id: 'two', trip_id: 'second' };
assert.equal(await bindSharedThingEvidenceDossier(second, { storeImpl }), sharedKey);
const library = await loadThingEvidenceDossier(sharedKey, { storeImpl });
assert.equal(library.tripUseCount, 2);
assert.deepEqual(library.tripIds, ['first', 'second']);
await saveThingEvidenceDossier(tripPlaceDossierKey('second', 'two'), { ...library, captureCheckpoint: 'updated' }, { storeImpl });
const fromFirst = await loadTripPlaceDossiersFromStore(['one'], { tripId: 'first', storeImpl });
assert.equal(fromFirst.one.captureCheckpoint, 'updated');
assert.equal((await loadThingEvidenceDossier(sharedKey, { storeImpl })).attempts.length, 1);
assert.notEqual(await bindSharedThingEvidenceDossier({ ...sharedPlace, id: 'other', address: '99 Other St, Boston, MA' }, { storeImpl }), sharedKey);
for (const category of ['flight', 'car']) {
  const light = { ...sharedPlace, id: category, category };
  assert.equal(await bindSharedThingEvidenceDossier(light, { storeImpl }), tripPlaceDossierKey('first', category));
  assert.equal(await bindSharedThingEvidenceDossier({ ...light, trip_id: 'second' }, { storeImpl }), tripPlaceDossierKey('second', category));
}

const scratch = mkdtempSync(join(tmpdir(), 'dossier-library-test-'));
try {
  const dir = join(scratch, 'dossiers');
  const env = { TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR: dir };
  await saveThingEvidenceDossier(tripPlaceDossierKey('first', 'one'), old, { env });
  const diskKey = await bindSharedThingEvidenceDossier(sharedPlace, { env });
  assert.equal(diskKey, sharedKey);
  const diskDossiers = loadTripPlaceDossiersFromDisk(['one'], 'first', env);
  assert.deepEqual(diskDossiers.one.pages, old.pages);
  const command = new URL('./build_nyc_thing_evidence_dossiers.mjs', import.meta.url).pathname;
  const preflightEnv = {
    NODE_OPTIONS: process.env.NODE_OPTIONS || '',
    XAI_API_KEY: 'test',
    TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR: join(scratch, 'must-not-write'),
  };
  const noModel = spawnSync(process.execPath, [command], { encoding: 'utf8', env: preflightEnv });
  assert.equal(noModel.status, 1);
  assert.equal(JSON.parse(noModel.stderr).code, 'XAI_PLACE_SEARCH_MODEL_MISSING');
  const noBrave = spawnSync(process.execPath, [command], { encoding: 'utf8', env: { ...preflightEnv, XAI_PLACE_SEARCH_MODEL: 'test-model' } });
  assert.equal(noBrave.status, 1);
  assert.equal(JSON.parse(noBrave.stderr).code, 'missing_search_keys');
  assert.equal(existsSync(preflightEnv.TIMESYNCHER_THING_EVIDENCE_DOSSIER_DIR), false, 'preflight must fail before dossier mutation');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log('test_dossier_data_batch_687_r1_r7: ok');
