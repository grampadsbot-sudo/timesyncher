import assert from 'node:assert/strict';
import { vkSearchResultToDossier, personFramedReview } from '../src/vacation/dossier-vk-search.mjs';

const url = 'https://reviews.example/place';
const page = 'Guests said the pasta was silky and rich. One wrote the staff remembered our names. Another said book two weeks ahead. A fourth said the patio is loud on weekends.';
const quotes = ['the pasta was silky and rich', 'the staff remembered our names', 'book two weeks ahead', 'the patio is loud on weekends'];
const synth = [
  'The handmade pasta is the main draw, with many visits praising rich sauces and silky noodles as the reason to come back.',
  'Service comes across as personal and warm across the set, with staff often recalling regulars and their usual orders.',
  'Tables go fast, so most of the set recommends booking about two weeks out, especially for weekend dinners.',
  'The main watch-out is noise on the weekend patio, which several visits found too loud for an easy conversation.',
];
const base = {
  thingName: 'Test Trattoria',
  sources: [{ url, title: 'Reviews', text: page, fetchedAt: '2026-10-29T00:00:00Z' }],
  voicePass: { claimSupportOk: true },
  reviewsLabel: 'Representative reviews written from 4 reviews',
};
const lines = Object.fromEntries(synth.flatMap((s, i) => [[`review${i + 1}`, s], [`review${i + 1}Theme`, `T${i + 1}`],
  [`review${i + 1}SourceUrl`, url], [`review${i + 1}Claims`, [{ text: quotes[i], sourceUrl: url }]]]));

const ok = vkSearchResultToDossier({ ...base, ...lines }, {});
assert.equal(ok.reviews?.length, 4, 'four synthesized lines with page-supported claims map onto the dossier');
assert.deepEqual(ok.reviews[0].claims[0], { text: quotes[0], sourceUrl: url, pages: ['p1'], supported: true });
assert.equal(ok.reviews[0].representative, true);
assert.equal(ok.reviewsLabel, 'Representative reviews written from 4 reviews');
assert.equal(ok.reviews[0].rating, undefined, 'no per-review star rating is invented');

const noClaims = vkSearchResultToDossier({ ...base, ...lines, review2Claims: [] }, {});
assert.equal(noClaims.reviews, undefined, 'a line without supporting claims blocks the set');
const offPage = vkSearchResultToDossier({ ...base, ...lines, review1Claims: ['not on the page at all'] }, {});
assert.equal(offPage.reviews, undefined, 'a claim the saved page does not support is rejected');

for (const framed of [
  'Tripadvisor reviewer on Test Trattoria: the pasta was silky and rich, and we would happily come back for the sauces again.',
  'One guest writes that the pasta was silky and rich and that the room felt warm and lively all evening long.',
  'A Yelp reviewer says the pasta was silky and rich, which matches what most of the set reports about the kitchen.',
  'If you have never been, I highly recommend it: the pasta was silky and rich and the staff made our night special.',
  'Guests rave: “the pasta was silky and rich” is the line that keeps coming up across the set of reviews here.',
]) {
  assert.ok(personFramedReview(framed), `person-framed line detected: ${framed}`);
  const d = vkSearchResultToDossier({ ...base, ...lines, review1: framed }, {});
  assert.equal(d.reviews, undefined, `person-framed line fails the set: ${framed}`);
}
for (const s of synth) assert.equal(personFramedReview(s), false, `synthesized line passes: ${s}`);

const pasted = vkSearchResultToDossier({ ...base, ...lines, review3: 'Another said book two weeks ahead. A fourth said the patio is loud on weekends.' }, {});
assert.equal(pasted.reviews, undefined, 'a verbatim copy of page review text is not a representative line');

const starred = vkSearchResultToDossier({ ...base, ...lines, review1Stars: '5' }, {});
assert.equal(starred.reviews[0].rating, 5);
const trip = Object.fromEntries([1, 2, 3, 4].flatMap((n) => [[`review${n}Source`, 'Trip.com'], [`review${n}Score10`, ['9.2', '7', '4.4', '10'][n - 1]]]));
const tripDossier = vkSearchResultToDossier({ ...base, ...lines, ...trip }, {});
assert.deepEqual(tripDossier.reviews.map((r) => r.rating), [5, 4, 2, 5], 'Trip.com /10 maps to whole stars by halving');
assert.equal(tripDossier.reviews[0].starsEvidence, '9.2/10', 'exact /10 score is kept');
const notTrip = vkSearchResultToDossier({ ...base, ...lines, review1Source: 'Yelp', review1Score10: '9' }, {});
assert.equal(notTrip.reviews[0].rating, undefined, 'a /10 score only maps for Trip.com');
const tripRated = vkSearchResultToDossier({ ...base, ...lines, review1Source: 'Trip.com', review1Rating: '9.0/10', review1Stars: '5', review2Source: 'Trip.com', review2Rating: '5.4/10' }, {});
assert.equal(tripRated.reviews[0].starsEvidence, '9.0/10');
assert.equal(tripRated.reviews[1].rating, 3, 'Trip.com x/10 rating maps when stars are absent');

const ratedPage = `${page} Yelp rating 4.5 from 200 reviews.`;
const rated = { ...base, ...lines, sources: [{ ...base.sources[0], text: ratedPage }],
  rating: { ratingEvidence: { site: 'yelp', average: 4.5, count: 200, scale: 5, quote: 'Yelp rating 4.5 from 200 reviews', sourceUrl: url } } };
const near = vkSearchResultToDossier({ ...rated, review1Stars: 5, review2Stars: 5, review3Stars: 4, review4Stars: 4 }, {});
assert.deepEqual(near.reviews.map((r) => r.rating), [5, 5, 4, 4], 'stars whose mean is within 0.5 of the venue rating are kept');
const far = vkSearchResultToDossier({ ...rated, review1Stars: 2, review2Stars: 2, review3Stars: 3, review4Stars: 2 }, {});
assert.equal(far.reviews.length, 4, 'lines stay when stars disagree with the venue rating');
assert.ok(far.reviews.every((r) => r.rating === undefined), 'stars whose mean is off the venue rating by more than 0.5 are dropped');
console.log('ok vk search review lines');
