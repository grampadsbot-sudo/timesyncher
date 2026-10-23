#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { braveWebSnippetPage } from '../src/vacation/dossier-brave.mjs';
import { extractReviewsByCode, summarizeCodeReviews } from '../src/vacation/dossier-review-extract.mjs';
import { detailFieldsFromPlace } from '../src/vacation/thing-detail-fields.mjs';
import { prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';
import { dossierSearchTopics } from '../src/vacation/thing-evidence-dossier.mjs';

function page(url, text, extra = {}) {
  const body = text.trim();
  return {
    url,
    fetchedAt: '2026-10-23T12:00:00.000Z',
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
    ...extra,
  };
}

const snippetPage = braveWebSnippetPage([
  {
    title: "Zabar's - Upper West Side",
    description: 'Guests praise the smoked fish counter and weekend crowds; some lines move slowly at checkout.',
    url: 'https://www.yelp.com/biz/zabars-new-york',
  },
  {
    title: "Zabar's reviews",
    description: 'A neighborhood staple for bagels, coffee, and picnic supplies with loyal regulars.',
    url: 'https://www.yelp.com/biz/zabars-new-york-2',
  },
], { query: 'site:yelp.com Zabar\'s reviews' });
assert.ok(snippetPage);
assert.equal(snippetPage.via, 'brave');
assert.equal(snippetPage.braveSnippets.length, 2);

const zabarSavedReviews = page(
  'https://www.yelp.com/biz/zabars-new-york-reviews',
  'Zabar\'s on Yelp. Rated 4.5 out of 5 from 28 reviews on Google.',
);
zabarSavedReviews.via = 'brave';
zabarSavedReviews.braveSnippets = Array.from({ length: 13 }, (_, index) => ({
  title: `Zabar's review ${index + 1}`,
  text: [
    'I loved the smoked fish counter and would recommend Zabar\'s for picnic supplies.',
    'Great bagels and coffee, though checkout lines can feel slow on Saturdays.',
    'The staff were friendly and helped me find good cheese for a Central Park picnic.',
    'Excellent rugelach and helpful advice on what to bring to a Broadway matinee.',
    'Overpriced compared with other delis, but the quality of lox is worth it for us.',
    'Disappointing wait at the hot food counter, yet the babka still tasted amazing.',
    'We loved the prepared foods section and thought the espresso bar was excellent.',
    'Rude service once, but most visits have been clean, organized, and delicious.',
    'Best place for breakfast supplies before a long walk through the Upper West Side.',
    'Noisy and crowded at noon, but the staff stayed patient and the food was good.',
    'Amazing selection of imported goods; I recommend the olive bar for quick snacks.',
    'Terrible parking nearby, yet the bakery case made the trip worthwhile for us.',
    'Friendly team behind the counter and the coffee beans roast was excellent today.',
  ][index],
}));
const zabarPages = [
  page('https://www.zabars.com/', 'Zabar\'s menu and hours.'),
  zabarSavedReviews,
];
const zabarDossier = { thing: "Zabar's", pages: zabarPages, attempts: [] };
const zabarStats = summarizeCodeReviews(zabarDossier);
assert.equal(zabarStats.count, 13, 'review count must come from saved pages, not model claims');

const inflated = prepareDossierFindings(zabarDossier, {
  rating: {
    average: 4.5,
    count: 28,
    scaleMax: 5,
    quote: 'Rated 4.5 out of 5 from 28 reviews on Google',
    url: zabarSavedReviews.url,
  },
});
assert.equal(inflated.reviewsRead, 13);
assert.equal(inflated.reviewsAvailable, 13, 'writer-inflated aggregate must yield to code count on saved pages');

const rosaHours = detailFieldsFromPlace({}, {
  category: 'restaurant',
  title: 'Rosa Mexicano - Lincoln Center',
  sourceRecord: {
    openingHours: {
      monday: { open: '11:30 AM', close: '10:00 PM' },
      tuesday: { open: '11:30 AM', close: '10:00 PM' },
    },
  },
});
assert.equal(rosaHours.hours.includes('[object Object]'), false);
assert.match(rosaHours.hours, /mon/i);

const jazzTopics = dossierSearchTopics({ category: 'activity', title: 'Village Vanguard' });
assert.equal(jazzTopics.some((row) => /happy hour/i.test(row.q)), false);
const restaurantTopics = dossierSearchTopics({ category: 'restaurant', title: 'Carbone' });
assert.equal(restaurantTopics.some((row) => /happy hour/i.test(row.q)), true);

const braveReviews = extractReviewsByCode({ pages: [snippetPage] }).filter((row) => row.method === 'code:brave-snippet');
assert.ok(braveReviews.length >= 2);

console.log('test_vk_682_brave_review_code_count: ok');
