import assert from 'node:assert/strict';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';

const place = { id: 602, title: "Zabar's", name: "Zabar's", category: 'store' };
const fetchedAt = '2026-10-28T04:40:00Z';
const rejectedText = 'REJECTED PRIOR NARRATIVE MUST NOT REAPPEAR in any composed field.';
const excerpt = "Zabar's gourmet market on Broadway stocks smoked fish, cheeses, baked goods, and upstairs cafe sandwiches for Upper West Side locals.";
const padding = ' The cafe upstairs serves hot food throughout the day.'.repeat(15);
const page = {
  url: 'https://www.zabars.com/directions.html',
  text: `${excerpt}${padding}`,
  fetchedAt,
};

const persisted = {
  thing: place.title,
  pages: [page],
  fields: {
    description: {
      value: '',
      claims: [{
        text: rejectedText,
        sourceUrl: 'https://stale-refill.example/bad',
        pages: ['p99'],
        supported: false,
      }],
    },
  },
};

const bot = {
  thing: place.title,
  pages: [page],
  fields: {
    description: {
      value: '',
      claims: [{
        text: 'Bot claim with no matching saved page citation.',
        sourceUrl: 'https://bot-unverifiable.example/nope',
        pages: ['p99'],
        supported: true,
      }],
    },
  },
};

const merged = mergeBotPrimaryPresentedFields(persisted, bot, place);
const field = merged.fields?.description;
assert.ok(field?.value, 'description recomposes when prior claims are all rejected and value is blank');
assert.ok(field.claims?.length, 'composed description keeps citations');
assert.ok(!field.value.includes(rejectedText), 'rejected prior text must not reappear');
assert.ok(field.value.includes(excerpt.trim()), 'value uses a verified page excerpt');
assert.ok(field.value.length < String(page.text).length, 'must not dump whole page text');
for (const claim of field.claims) {
  const cited = merged.pages[Number(claim.pages[0].slice(1)) - 1];
  assert.equal(claim.supported, true);
  assert.equal(claim.sourceUrl, cited.url);
  assert.ok(cited.text.includes(claim.text));
  assert.ok(!claim.text.includes(rejectedText));
}

const zabarsAbout =
  "Zabar's is a gourmet food store on the Upper West Side known for smoked fish, coffee and bagels. Nav Home Cart.";
const junkPage = {
  url: 'https://x.test/w',
  text: 'How to install replacement window screens using a spline tool. Measure the frame.',
  fetchedAt,
};
const onTopicPage = {
  url: 'https://zabars.com/about',
  text: zabarsAbout,
  fetchedAt,
};
const mixedPages = [onTopicPage, junkPage];
const mixedPersisted = {
  thing: place.title,
  pages: mixedPages,
  fields: {
    description: {
      value: '',
      claims: [{
        text: rejectedText,
        sourceUrl: 'https://stale-refill.example/bad',
        pages: ['p99'],
        supported: false,
      }],
    },
  },
};
const mixedBot = {
  thing: place.title,
  pages: mixedPages,
  fields: {
    description: {
      value: '',
      claims: [{
        text: 'Bot claim with no matching saved page citation.',
        sourceUrl: 'https://bot-unverifiable.example/nope',
        pages: ['p99'],
        supported: true,
      }],
    },
  },
};
const mixedMerged = mergeBotPrimaryPresentedFields(mixedPersisted, mixedBot, place);
const mixedField = mixedMerged.fields?.description;
assert.ok(mixedField?.value, 'mixed pages: description composes from on-topic page only');
assert.ok(
  mixedField.value.includes("Zabar's is a gourmet food store"),
  'mixed pages: Zabar\'s sentence present',
);
assert.ok(
  !mixedField.value.includes('replacement window screens'),
  'mixed pages: off-topic window-screens sentence must not appear',
);

console.log(JSON.stringify({ ok: true, checked: 'bot-primary-seed-602-relock', descriptionWords: field.value.split(/\s+/).length }));
