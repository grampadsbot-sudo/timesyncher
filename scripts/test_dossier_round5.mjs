import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { xaiGrokPlaceSearchModelId } from './vacation-app-reply-rules.mjs';
import { condenseText, dossierForModel, xaiCallUsd, logXaiUsage } from '../src/vacation/dossier-cost.mjs';
import { extractReviewsByCode, finalizeReviewSet } from '../src/vacation/dossier-review-extract.mjs';
import { gatherThingEvidence } from '../src/vacation/thing-evidence-dossier.mjs';
import { prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';

const TAVILY_URL = `https://${['api', 'tavily', 'com'].join('.')}/search`;

const reviewPageText = [
  'Arthouse Hotel on Tripadvisor.',
  'Rated 4.5 out of 5 from 1234 reviews on Tripadvisor.',
  'Review 1 (5/5) Sep 2026: Lovely rooftop bar and very friendly staff, we would stay again.',
  'Review 2 (4/5) Aug 2026: Rooms were small but spotless and the location was perfect.',
].join('\n');
const reviewPage = {
  url: 'https://www.tripadvisor.com/Hotel_Review-arthouse',
  fetchedAt: '2026-10-22T00:00:00Z',
  text: reviewPageText,
  sha256: createHash('sha256').update(reviewPageText).digest('hex'),
  via: 'brave',
  braveRating: { average: 4.5, count: 1234, scaleMax: 5, quote: 'Rated 4.5 out of 5 from 1234 reviews on Tripadvisor.', url: 'https://www.tripadvisor.com/Hotel_Review-arthouse', source: 'Tripadvisor' },
  braveReviews: [
    { text: 'Lovely rooftop bar and very friendly staff, we would stay again.', date: 'Sep 2026', rating: 5 },
    { text: 'Rooms were small but spotless and the location was perfect.', date: 'Aug 2026', rating: 4 },
  ],
};

const dossier = await gatherThingEvidence({ title: 'Arthouse Hotel', category: 'hotel' }, {
  destination: 'NYC',
  env: { TAVILI_API_KEY: 'k' },
  fetchImpl: async (url) => {
    assert.equal(String(url).includes('brave'), false);
    if (String(url) === TAVILY_URL) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [{ url: 'https://a.example/arthouse', title: 'Arthouse Hotel', content: 'Arthouse Hotel is a hotel on the Upper West Side with a rooftop bar.' }],
        }),
      };
    }
    return { ok: false, status: 404 };
  },
  extractImpl: async () => [],
});
assert.ok(dossier.pages.some((p) => p.via === 'tavily-search'));
assert.equal(dossier.attempts.some((a) => /brave/i.test(String(a.kind || a.provider || ''))), false);

const withReviews = { ...dossier, pages: [...dossier.pages, reviewPage] };
const code = extractReviewsByCode(withReviews).filter((r) => r.method === 'code:brave');
assert.equal(code.length, 2);
const set = finalizeReviewSet(withReviews, code, [], []);
assert.equal(set.length, 2);

const built = prepareDossierFindings({ ...withReviews, reviewSet: set }, {});
assert.equal(built.rating, 4.5);
assert.equal(built.reviewsAvailable, 1234);

const long = `${'Filler text about nothing in particular here. '.repeat(400)} Arthouse Hotel has a great rooftop bar, open daily 5 pm to 1 am.`;
const short = condenseText(long, 'Arthouse Hotel', { maxChars: 300 });
assert.ok(short.length <= 300 && /rooftop bar/.test(short));
const slim = dossierForModel({ thing: 'Arthouse Hotel', pages: [{ url: 'u', text: long }, reviewPage], reviewSet: [] }, { perPage: 500, total: 2000 });
assert.equal(slim.pages.length, 2);
assert.ok(slim.pages[0].text.length <= 500);
assert.equal(slim.pages[1].braveReviews, undefined);

const model = xaiGrokPlaceSearchModelId({ XAI_PLACE_SEARCH_MODEL: 'dossier-test-model' });
assert.equal(xaiCallUsd(model, { input_tokens: 100000, output_tokens: 100000 }).usd, 0.375);
assert.equal(xaiCallUsd(model, { input_tokens: 1e6, output_tokens: 1e6 }).usd, 7.5);
const d = {};
logXaiUsage(d, 'builder', model, { usage: { input_tokens: 8000, output_tokens: 2000 } });
logXaiUsage(d, 'judge', model, { usage: { input_tokens: 4000, output_tokens: 400 } });
assert.equal(d.xaiUsage.length, 2);
assert.equal(d.xaiUsd, 0.021);
console.log('test_dossier_round5: ok');
