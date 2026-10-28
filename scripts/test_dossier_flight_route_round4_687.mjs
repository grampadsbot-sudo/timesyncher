import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dossierSearchIdentity, braveDossierQueryStages, flightEvidenceMatchesTarget } from '../src/vacation/dossier-brave-queries.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { field, judge, webResponse, noSleep } from './lib/dossier-round4-test-support.mjs';

const target = { tripId: 'offline-trip', placeId: 'coastal-route', category: 'flight',
  title: 'Flight option: Coastal Air SEA-BOS 2026-06-23 08:20-16:40', website: 'https://coastal.example/routes',
  address: 'Flight options / Bookings tab', destination: 'Flight options / Bookings tab',
  sourceRecord: { airline: 'Coastal Air', route: 'SEA-BOS', description: 'Candidate only; not booked. Departure 08:20; arrival 16:40.' } };
const summary = 'Coastal Air SEA-BOS 2026-06-23 08:20-16:40 connects Seattle and Boston nonstop between the two airports.';
const description = 'Coastal Air SEA-BOS 2026-06-23 08:20-16:40 links Seattle and Boston on a nonstop route. The airline destination page identifies both SEA and BOS as the airports served by this connection. The supplied trip record places departure in the morning and arrival in the afternoon. Those times describe the proposed itinerary, while the airline route page establishes the airport pair.';
const facts = 'Coastal Air connects SEA and BOS nonstop. SEA is the Seattle airport and BOS is the Boston airport. The airline destination page lists this nonstop route between Seattle and Boston.';

test('candidate flight queries target airline and both airports, without date/time/status or duplicate airline', () => {
  const identity = dossierSearchIdentity(target, target.destination);
  assert.equal(identity, 'Coastal Air SEA BOS');
  const queries = braveDossierQueryStages(target, target.destination).flatMap((stage) => stage.queries);
  assert.ok(queries.some((query) => /nonstop route/.test(query)));
  assert.ok(queries.some((query) => /site:coastal.example/.test(query)));
  for (const query of queries) {
    assert.ok(!/2026|08:20|16:40|status|Bookings|reviews|hours/.test(query));
    assert.equal(query.match(/Coastal Air/g).length, 1);
  }
  assert.equal(flightEvidenceMatchesTarget({ text: facts }, target), true);
  assert.equal(flightEvidenceMatchesTarget({ text: 'Coastal Air SEA-LAX nonstop route' }, target), false);
});

for (const recover429 of [false, true]) test(`FL0 route pages become presented flight text, 429 recovery=${recover429}`, async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  storeImpl.rows.set(key, { thing: target.title, pages: [], fields: {}, emptySource: 'brave_extract_fallback_no_pages', attempts: [
    { kind: 'gather', step: 'operator_empty_gather_retry', gatherVersion: 4, status: 'failed' },
  ] });
  let requests = 0;
  const options = {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    gatherImpl: (place, opts) => gatherThingEvidence(place, {
      ...opts, sleepImpl: noSleep, braveImpl: () => assert.fail('flights do not need local reviews'),
      env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' },
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        assert.ok(parsed.pathname.endsWith('/web/search'), 'snippets suffice without an extract');
        requests += 1;
        if (recover429 && requests === 1) return webResponse([], 429, '0.1');
        assert.ok(!/status|2026|08:20/.test(parsed.searchParams.get('q')));
        return webResponse([{ url: target.website, title: 'Coastal Air SEA to BOS nonstop route', description: facts }]);
      },
    }),
    fetchImpl: async () => assert.fail('offline only'),
    buildImpl: async (dossier, { prompt }) => {
      const model = JSON.parse(prompt.split('\n').at(-1));
      const web = model.pages.find((row) => row.via === 'brave-snippet');
      const record = model.pages.find((row) => row.via === 'thing-record');
      assert.ok(web.text.includes(facts));
      assert.ok(record.text.includes('Candidate only; not booked'));
      assert.ok(prompt.includes('no booking is confirmed'));
      return { findings: { summary: field(summary, [web.id]), description: field(description, [web.id, record.id]) } };
    }, judgeImpl: judge,
  };
  const result = (await runThingEvidenceDossierStagingTargets([target], options)).results[0];
  assert.equal(result.failed, false);
  assert.equal(result.trace.pagesVerified, true);
  assert.equal(result.trace.gather.path, 'retry');
  assert.equal(result.trace.builder.blankedBy, null);
  assert.equal(result.trace.builder.judgeSupported, 2);
  assert.equal(result.trace.attempts.some((row) => row.httpStatus === 429), recover429);
  const saved = normalizeDossierEvidence(await storeImpl.getDossier(key), target);
  assert.equal(dossierPresented(saved, target), true, 'unchanged presented judge');
  assert.ok(!/reviews/i.test(saved.fields.description.value));
});

test('FL0 all-query zero hits returns a named hard reason and no invented record-only payload', async () => {
  const result = (await runThingEvidenceDossierStagingTargets([target], {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, storeImpl: memoryStore(), operatorFill: true,
    gatherImpl: (place, opts) => gatherThingEvidence({ ...place, url: undefined, website: undefined, sourceRecord: {} }, {
      ...opts, sleepImpl: noSleep, braveImpl: null, fetchImpl: async () => webResponse(),
    }),
    fetchImpl: async () => webResponse(), buildImpl: async () => assert.fail('no sources'),
  })).results[0];
  assert.equal(result.failed, true);
  assert.equal(result.emptySource, 'brave_zero_hits');
  assert.equal(result.pageCount, 0);
  assert.equal(result.trace.builder.ran, false);
  assert.ok(result.trace.attempts.every((row) => row.results === 0));
});

test('FL1 one saved route page and a current-version text failure rebuild without a new gather', async () => {
  const storeImpl = memoryStore();
  const key = `trip:${target.tripId}:place:${target.placeId}`;
  const { createHash } = await import('node:crypto');
  const savedPage = { url: target.website, text: facts, fetchedAt: '2026-10-27T05:00:00Z',
    sha256: createHash('sha256').update(facts).digest('hex') };
  storeImpl.rows.set(key, { thing: target.title, fields: {}, pages: [savedPage], attempts: [
    { kind: 'page', status: 'ok' },
    { kind: 'builder', step: 'operator_presented_text_retry', status: 'failed', evidenceHash: createHash('sha256').update(JSON.stringify({ textBuildVersion: 4, pages: [[savedPage.url, savedPage.sha256]] })).digest('hex') },
  ] });
  const result = (await runThingEvidenceDossierStagingTargets([target], {
    env: {}, storeImpl, operatorFill: true, skipExisting: true,
    fetchImpl: async () => assert.fail('no network'), gatherImpl: async () => assert.fail('reuse saved page'),
    buildImpl: async (dossier) => {
      assert.ok(dossier.pages.some((row) => row.via === 'thing-record'));
      return { findings: { summary: field(summary), description: field(description, ['p1', 'p2']) } };
    }, judgeImpl: judge,
  })).results[0];
  assert.equal(result.failed, false);
  assert.equal(result.trace.gather.path, 'reuse');
  assert.equal(result.trace.builder.ran, true);
  assert.equal(dossierPresented(normalizeDossierEvidence(await storeImpl.getDossier(key), target), target), true);
});
