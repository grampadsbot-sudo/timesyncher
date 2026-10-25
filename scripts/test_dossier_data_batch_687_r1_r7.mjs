#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { dossierBuilderEvidenceHints, dossierForModel } from '../src/vacation/dossier-cost.mjs';
import { hydrateScalarFieldsFromEvidence, normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierBuilderPrompt } from '../src/vacation/xai-grok-place-ratings.mjs';
import {
  prepareDossierFindings,
  ratingQuoteSupportsAggregate,
} from '../src/vacation/thing-dossier-fields.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';

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

console.log('test_dossier_data_batch_687_r1_r7: ok');
