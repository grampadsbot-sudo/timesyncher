import assert from 'node:assert/strict';
import { test } from 'node:test';
import { braveDossierQueryStages } from '../src/vacation/dossier-brave-queries.mjs';
import { gatherThingEvidence, dossierPagesVerified } from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierFillHardFailure } from '../src/vacation/xai-dossier-fill-state.mjs';

const place = {
  title: 'Coastal Air SEA → BOS 08:20–16:40', category: 'flight',
  website: 'https://coastal.example/booking',
  sourceRecord: { airline: 'Coastal Air', flightNumber: 'CA241', route: 'SEA-BOS' },
};

test('flight queries use airline, flight number and route without a place address or booking-tab label', () => {
  const queries = braveDossierQueryStages(place, 'Flight options / Bookings tab').flatMap((stage) => stage.queries);
  assert.ok(queries.every((query) => query.includes('Coastal Air') && query.includes('SEA') && query.includes('BOS')));
  assert.ok(queries.some((query) => /nonstop route/.test(query)));
  assert.ok(queries.every((query) => !/flight status/.test(query)));
  assert.ok(queries.every((query) => !/Bookings tab|08:20|menu|reviews/.test(query)));
});

for (const extract of ['432', 'empty']) for (const via of ['query', 'fallback']) test(`flight ${extract} ${via} keeps dated flight-status search evidence`, async () => {
  const queries = [];
  const dossier = await gatherThingEvidence(place, {
    destination: 'Flight options / Bookings tab', env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: async () => {}, braveImpl: null,
    resolveImpl: async () => [{ address: '93.184.216.34' }],
    extractImpl: async () => { if (extract === '432') throw new Error('Tavily extract failed with HTTP 432.'); return []; },
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith('/web/search')) return { ok: false, status: 403 };
      const query = parsed.searchParams.get('q'); queries.push(query);
      const match = via === 'fallback' ? query === 'site:coastal.example' : /SEA BOS/.test(query) && !/Bookings tab|08:20/.test(query);
      return { ok: true, json: async () => ({ web: { results: match ? [{
        url: 'https://status.example/flights/CA241', title: 'Coastal Air CA241 SEA to BOS',
        description: 'CA241 connects Seattle and Boston with a nonstop flight.',
        extra_snippets: ['The route page lists the departure and arrival airports and the published schedule.'],
      }] : [] } }) };
    },
  });
  assert.ok(queries.length);
  if (via === 'fallback') assert.ok(dossier.attempts.some((row) => row.stage === 'extract_fallback' && row.status === 'ok'));
  assert.equal(dossier.pages.filter((page) => page.via !== 'thing-record').length, 1);
  assert.equal(dossierPagesVerified(dossier), true);
  assert.equal(dossier.pages[0].via, 'brave-snippet');
  assert.match(dossier.pages[0].text, /CA241[\s\S]*departure and arrival airports/);
});

test('flight with zero search hits retains a hard named failure', async () => {
  const dossier = await gatherThingEvidence(place, {
    env: { BRAVE_SEARCH_API_KEY: 'offline-fixture' }, sleepImpl: async () => {}, braveImpl: null,
    resolveImpl: async () => [{ address: '93.184.216.34' }], extractImpl: async () => [],
    fetchImpl: async (url) => new URL(url).pathname.endsWith('/web/search')
      ? { ok: true, json: async () => ({ web: { results: [] } }) } : { ok: false, status: 403 },
  });
  assert.equal(dossier.pages.length, 0);
  assert.equal(dossierFillHardFailure(dossier, place).error, 'brave_zero_hits');
});
