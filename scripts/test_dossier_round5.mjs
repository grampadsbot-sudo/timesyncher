import assert from 'node:assert/strict';
import { xaiGrokPlaceSearchModelId } from './vacation-app-reply-rules.mjs';
import { bravePoiPage, pickBraveLocation, braveLocalEvidence } from '../src/vacation/dossier-brave.mjs';
import { condenseText, dossierForModel, xaiCallUsd, logXaiUsage } from '../src/vacation/dossier-cost.mjs';
import { extractReviewsByCode, finalizeReviewSet } from '../src/vacation/dossier-review-extract.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';

const poi = {
  title: 'Arthouse Hotel',
  rating: { ratingValue: 4.5, bestRating: 5, reviewCount: 1234, profile: { name: 'Tripadvisor', url: 'https://www.tripadvisor.com/Hotel_Review-arthouse' } },
  reviews: { results: [
    { comment: 'Lovely rooftop bar and very friendly staff, we would stay again.', date: 'Sep 2026', rating: { ratingValue: 5 } },
    { comment: 'Rooms were small but spotless and the location was perfect.', date: 'Aug 2026', rating: { ratingValue: 4 } },
    { comment: 'short' },
  ] },
};
const page = bravePoiPage(poi, { fetchedAt: '2026-10-22T00:00:00Z', id: 'abc' });
assert.equal(page.via, 'brave');
assert.equal(page.url, 'https://www.tripadvisor.com/Hotel_Review-arthouse');
assert.equal(page.braveReviews.length, 2);
assert.match(page.text, /Rated 4\.5 out of 5 from 1234 reviews on Tripadvisor\./);
assert.equal(bravePoiPage({ title: 'x' }), null);

assert.equal(pickBraveLocation([{ id: '1', title: 'Other Place' }, { id: '2', title: 'The Arthouse Hotel' }], 'Arthouse Hotel').id, '2');
assert.equal(pickBraveLocation([{ id: '1', title: 'Other Place' }], 'Arthouse Hotel'), undefined);

assert.equal((await braveLocalEvidence({ title: 'Arthouse Hotel' }, { env: {}, fetchImpl: () => { throw new Error('no'); } })).pages.length, 0);
const calls = [];
const fake = async (url) => {
  calls.push(url);
  if (url.includes('/web/search')) return { ok: true, json: async () => ({ locations: { results: [{ id: 'abc', title: 'Arthouse Hotel' }] } }) };
  if (url.includes('/local/pois')) return { ok: true, json: async () => ({ results: [poi] }) };
  return { ok: false, status: 404 };
};
const brave = await braveLocalEvidence({ title: 'Arthouse Hotel' }, { destination: 'NYC', env: { BRAVE_SEARCH_API_KEY: 'k' }, fetchImpl: fake });
assert.equal(brave.pages.length, 1);
assert.ok(calls[0].includes('result_filter=locations') && calls[1].includes('ids=abc'));

for (const [location, center] of [
  [{ sourceRecord: { coordinates: [40.78, -73.98] } }, null],
  [{ coordinates: [[40.78, -73.98]] }, null],
  [{ metadata: { destinationCenter: { lat: 40.78, lng: -73.98 } } }, null],
  [{}, { lat: 40.78, lng: -73.98 }],
]) {
  const localCalls = [];
  const local = await braveLocalEvidence({ title: 'Arthouse Hotel', ...location }, {
    destination: 'New York', center, env: { BRAVE_SEARCH_API_KEY: 'k' },
    fetchImpl: async (url) => {
      localCalls.push(new URL(url));
      return url.includes('/local/place_search')
        ? { ok: true, json: async () => ({ results: [{ id: 'abc', title: 'Arthouse Hotel' }] }) }
        : await fake(url);
    },
  });
  assert.equal(local.pages.length, 1);
  assert.equal(localCalls[0].pathname, '/res/v1/local/place_search');
  assert.equal(localCalls[0].searchParams.get('q'), 'Arthouse Hotel, New York');
  assert.equal(localCalls[0].searchParams.get('latitude'), '40.78');
  assert.equal(localCalls[0].searchParams.get('longitude'), '-73.98');
}

const fallbackCalls = [];
const fallback = await braveLocalEvidence({ title: 'Arthouse Hotel', lat: 40.78, lng: -73.98 }, {
  destination: 'New York', env: { BRAVE_SEARCH_API_KEY: 'k' },
  fetchImpl: async (url) => {
    fallbackCalls.push(new URL(url).pathname);
    return url.includes('/local/place_search') ? { ok: false, status: 404 } : await fake(url);
  },
});
assert.equal(fallback.pages.length, 1, 'an unavailable place_search endpoint must still try web locations');
assert.deepEqual(fallbackCalls, ['/res/v1/local/place_search', '/res/v1/web/search', '/res/v1/local/pois']);
assert.ok(fallback.attempts.some((a) => a.step === 'place_search' && a.error === 'brave_http_404'));

for (const status of [401, 403, 429]) {
  let requests = 0;
  const denied = await braveLocalEvidence({ title: 'Arthouse Hotel', lat: 40.78, lng: -73.98 }, {
    env: { BRAVE_SEARCH_API_KEY: 'k' }, fetchImpl: async () => { requests += 1; return { ok: false, status }; },
  });
  assert.equal(requests, 1, 'authentication and rate-limit errors must stop without another request');
  assert.equal(denied.pages.length, 0);
  assert.equal(denied.attempts[0].error, `brave_http_${status}`);
}

const dossier = await gatherThingEvidence({ title: 'Arthouse Hotel' }, {
  destination: 'NYC', env: {},
  searchImpl: async () => ({ results: [{ url: 'https://a.example/arthouse', rawContent: 'Arthouse Hotel is a hotel on the Upper West Side with a rooftop bar.' }] }),
  extractImpl: async () => [], braveImpl: async () => brave,
});
assert.ok(dossier.pages.some((p) => p.via === 'brave'));
assert.ok(dossier.attempts.some((a) => a.kind === 'brave' && a.step === 'pois'));

const code = extractReviewsByCode(dossier).filter((r) => r.method === 'code:brave');
assert.equal(code.length, 2);
const set = finalizeReviewSet(dossier, code, [], []);
assert.equal(set.length, 2);
assert.deepEqual(set.map((r) => [r.page, r.pages]), code.map((r) => [r.page, [r.page]]));

const built = prepareDossierFindings({ ...dossier, reviewSet: set }, {});
assert.equal(built.rating, 4.5);
assert.equal(built.reviewsAvailable, 1234);

const long = `${'Filler text about nothing in particular here. '.repeat(400)} Arthouse Hotel has a great rooftop bar, open daily 5 pm to 1 am.`;
const short = condenseText(long, 'Arthouse Hotel', { maxChars: 300 });
assert.ok(short.length <= 300 && /rooftop bar/.test(short));
const slim = dossierForModel({ thing: 'Arthouse Hotel', pages: [{ url: 'u', text: long }, page], reviewSet: [] }, { perPage: 500, total: 2000 });
assert.equal(slim.pages.length, 2);
assert.ok(slim.pages[0].text.length <= 500);
assert.equal(slim.pages[1].braveReviews, undefined);
const slimReviews = dossierForModel({ ...dossier, reviewSet: set }).reviewSet;
assert.deepEqual(slimReviews.map((r) => [r.id, r.page]), set.map((r) => [r.id, r.page]));

const model = xaiGrokPlaceSearchModelId({ XAI_PLACE_SEARCH_MODEL: 'dossier-test-model' });
assert.equal(xaiCallUsd(model, { input_tokens: 100000, output_tokens: 100000 }).usd, 0.375);
assert.equal(xaiCallUsd(model, { input_tokens: 1e6, output_tokens: 1e6 }).usd, 7.5);
const d = {};
logXaiUsage(d, 'builder', model, { usage: { input_tokens: 8000, output_tokens: 2000 } });
logXaiUsage(d, 'judge', model, { usage: { input_tokens: 4000, output_tokens: 400 } });
assert.equal(d.xaiUsage.length, 2);
assert.equal(d.xaiUsd, 0.021);
console.log('test_dossier_round5: ok');
