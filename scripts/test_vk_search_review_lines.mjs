import assert from 'node:assert/strict';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';

const url = 'https://reviews.example/place';
const page = 'Guests said the pasta was silky and rich. One wrote the staff remembered our names. Another said book two weeks ahead. A fourth said the patio is loud on weekends.';
const quotes = ['the pasta was silky and rich', 'the staff remembered our names', 'book two weeks ahead', 'the patio is loud on weekends'];
const base = {
  thingName: 'Test Trattoria',
  sources: [{ url, title: 'Reviews', text: page, fetchedAt: '2026-10-29T00:00:00Z' }],
  voicePass: { claimSupportOk: true },
  reviewThemes: { source: url, praise: quotes.slice(0, 3), watchOuts: quotes.slice(3) },
};
const lines = Object.fromEntries(quotes.flatMap((q, i) => [[`review${i + 1}`, `Diners note ${q}, which sets the tone.`], [`review${i + 1}Theme`, `T${i + 1}`]]));

const ok = vkSearchResultToDossier({ ...base, ...lines }, {});
assert.equal(ok.reviews?.length, 4, 'four page-supported review lines map onto the dossier');
assert.deepEqual(ok.reviews[0].claims[0], { text: quotes[0], sourceUrl: url, pages: ['p1'], supported: true });
assert.equal(ok.reviews[0].rating, undefined, 'no per-review star rating is invented');

const unsupported = vkSearchResultToDossier({ ...base, ...lines, review2: 'Diners loved a dish the page never mentions.' }, {});
assert.equal(unsupported.reviews, undefined, 'one unquoted line blocks the whole set');

const offPage = vkSearchResultToDossier({ ...base, ...lines, reviewThemes: { ...base.reviewThemes, praise: ['not on the page at all', ...quotes.slice(1, 3)] }, review1: 'Diners say not on the page at all.' }, {});
assert.equal(offPage.reviews, undefined, 'an excerpt the page does not support is rejected');
console.log('ok vk search review lines');
