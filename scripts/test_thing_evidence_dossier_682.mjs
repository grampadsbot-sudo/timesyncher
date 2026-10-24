#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { braveWebSearch, normalizeBraveWebResults } from '../src/vacation/dossier-brave.mjs';
import { BRAVE_SEARCH_RES_V1 } from '../src/vacation/poi-search.mjs';
import { braveDossierQueryStages, topUpQueriesForField } from '../src/vacation/dossier-brave-queries.mjs';
import {
  computeDossierFieldCounts,
  deriveMissingFieldsFromShortcomings,
  recordFieldShortcoming,
} from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import {
  DOSSIER_MAX_PAGES,
  DOSSIER_PAGE_CHARS,
  gatherBraveEvidenceForQueries,
  gatherThingEvidence,
  mergeDossierPages,
} from '../src/vacation/thing-evidence-dossier.mjs';
import { extractReviewsByCode } from '../src/vacation/dossier-review-extract.mjs';
import { dossierRebuildFields } from '../src/vacation/thing-dossier-fields.mjs';

const place = { title: 'Sample Bistro', category: 'restaurant' };
const stages = braveDossierQueryStages(place, 'NYC');
assert.ok(stages.some((s) => s.stage === 'reviews'));
assert.ok(stages.some((s) => s.stage === 'happyHour'));
assert.equal(braveDossierQueryStages({ title: 'X', category: 'flight' }, 'NYC').some((s) => s.stage === 'happyHour'), false);

const top = topUpQueriesForField('hours', place, 'NYC', 0);
assert.ok(top[0].query.includes('hours'));

const normalized = normalizeBraveWebResults({
  web: { results: [{ url: 'https://yelp.com/biz/x', title: 'Sample', description: '4.5 out of 5 stars · great food' }] },
}, 'q');
assert.equal(normalized[0].rating, 4.5);

assert.equal(DOSSIER_PAGE_CHARS, 12000);
assert.ok(DOSSIER_MAX_PAGES >= 10);

const topUpOnly = await gatherBraveEvidenceForQueries(top, place, {
  env: {},
  fetchImpl: async () => ({ ok: false, status: 503 }),
});
assert.equal(topUpOnly.pages.length, 0);

let searchCalls = 0;
const dossier = await gatherThingEvidence(place, {
  destination: 'NYC',
  env: { BRAVE_SEARCH_API_KEY: 'test-key' },
  fetchImpl: async (url) => {
    if (url.includes(BRAVE_SEARCH_RES_V1)) {
      searchCalls += 1;
      return {
        ok: true,
        json: async () => ({
          web: {
            results: [{
              url: `https://example.com/${searchCalls}`,
              title: 'Sample Bistro review',
              description: 'We loved the rigatoni and the staff was friendly on our visit last month.',
            }],
          },
        }),
      };
    }
    return { ok: false, status: 403 };
  },
  extractImpl: async (urls) => urls.map((url) => ({ url, rawContent: 'Extracted review text says the pasta was excellent and worth the wait.' })),
  braveImpl: async () => ({ pages: [], attempts: [] }),
});
assert.ok(searchCalls > 0, 'gather uses web search only');
assert.ok(dossier.braveResults?.length >= 1);
assert.ok(dossier.pages.some((p) => p.via === 'tavily-extract' || p.via === 'direct' || p.via === 'brave-snippet'));
assert.ok(dossier.attempts.some((a) => a.step === 'web_search'));

const withSnippetReviews = {
  ...dossier,
  braveResults: [{
    url: 'https://yelp.com/x',
    snippets: ['I loved the spicy rigatoni here and would recommend it to friends visiting the city.'],
  }],
};
const code = extractReviewsByCode(withSnippetReviews);
assert.ok(code.some((r) => r.method === 'code:brave-snippet'));

const counts = computeDossierFieldCounts(dossier, place);
assert.ok(['missing', 'short'].includes(counts.reviews.status));
dossier.fieldCounts = counts;

const shortcomings = recordFieldShortcoming({}, 'reviews', 'limited number of reviews', { query: 'q', via: 'brave', result: 'ok' });
assert.deepEqual(deriveMissingFieldsFromShortcomings(shortcomings), ['reviews']);

const pageText = 'body'.repeat(200);
const page = {
  url: 'https://a.example',
  fetchedAt: new Date().toISOString(),
  text: pageText,
  sha256: createHash('sha256').update(pageText).digest('hex'),
};
const merged = mergeDossierPages({ thing: 'Sample', pages: [page], attempts: [] }, dossier);
const rebuild = dossierRebuildFields({ fieldHashes: { description: page.sha256 }, fieldSources: { description: page.url } }, merged, { maxAgeExpired: false, changedUrls: [] });
assert.equal(rebuild.has('itineraryNote') || rebuild.size === 0, true);

console.log('test_thing_evidence_dossier_682: ok');
