import assert from 'node:assert/strict';
import {
  recitBotPrimaryFields,
  mergeBotPrimaryPresentedFields,
} from '../src/vacation/dossier-bot-primary-seed.mjs';

const fetchedAt = '2026-10-28T00:00:00Z';
const unrelated = { url: 'https://example.org/unrelated', text: 'The bookstore opens at noon.', fetchedAt };
const value = 'This hotel has a rooftop pool and free breakfast.';
const unsupported = { text: value, sourceUrl: 'https://example.org/absent', pages: ['p99'], supported: false };
const counterexample = recitBotPrimaryFields({
  pages: [unrelated],
  fields: { description: { value, claims: [unsupported] } },
});
console.log(JSON.stringify({ case: 'review-counterexample', claims: counterexample.fields.description.claims }));
for (const claim of counterexample.fields.description.claims) {
  assert.notEqual(claim.supported, true, 'recit must never manufacture support');
  assert.notEqual(claim.sourceUrl, unrelated.url, 'recit must never substitute an unrelated page');
}

const first = { url: 'https://example.org/first', text: `First supported claim. ${value}`, fetchedAt };
const second = { url: 'https://example.org/second', text: 'Second supported claim.', fetchedAt };
const claims = [
  { text: 'First supported claim.', sourceUrl: first.url, pages: ['p1'], supported: true, judge: 'first-judge' },
  { text: 'Second supported claim.', sourceUrl: second.url, pages: ['p2'], supported: true },
  unsupported,
];
const input = { pages: [second, first], fields: { description: { value, claims, unit: 'preserved' } } };
const snapshot = structuredClone(input);
const reordered = recitBotPrimaryFields(input);
assert.deepEqual(input, snapshot, 'recit must not mutate its input');
assert.equal(reordered.fields.description.unit, 'preserved');
assert.equal(reordered.fields.description.claims.length, 2, 'only supported per-source claims survive in a mixed field');
assert.deepEqual(reordered.fields.description.claims[0], { ...claims[0], pages: ['p2'] });
assert.deepEqual(reordered.fields.description.claims[1], { ...claims[1], pages: ['p1'] });
assert.equal(reordered.fields.description.claims.some((claim) => claim.sourceUrl === unsupported.sourceUrl), false);

const byId = recitBotPrimaryFields({
  pages: [second, first],
  fields: { summary: { value, claims: [{ text: value, pages: ['p2'], supported: true }] } },
});
assert.deepEqual(byId.fields.summary.claims, [{ text: value, sourceUrl: first.url, pages: ['p2'], supported: true }]);
const idReordered = recitBotPrimaryFields({ ...byId, pages: [first, second] });
assert.deepEqual(idReordered.fields.summary.claims[0].pages, ['p1']);
assert.equal(idReordered.fields.summary.claims[0].supported, true);

const rejected = [
  { text: value, supported: true },
  { ...unsupported, supported: true, pages: ['p1'] },
  { text: value, pages: ['p99'], supported: true },
  { text: value, pages: ['p99', 'p1'], supported: true },
  { text: value, sourceUrl: first.url, pages: ['p1'], supported: false },
  { text: value, sourceUrl: first.url, pages: ['p1'] },
  { text: value, sourceUrl: first.url, pages: ['p1'], supported: 'true' },
];
for (const claim of rejected) {
  const result = recitBotPrimaryFields({ pages: [first], fields: { summary: { value, claims: [claim] } } });
  assert.deepEqual(result.fields.summary.claims, [{ ...claim, supported: false }]);
}
for (const date of [undefined, '', 'not-a-date']) {
  for (const citation of [{ sourceUrl: first.url }, { pages: ['p1'] }]) {
    const claim = { text: value, ...citation, supported: true };
    const result = recitBotPrimaryFields({
      pages: [{ ...first, fetchedAt: date }],
      fields: { summary: { value, claims: [claim] } },
    });
    assert.equal(result.fields.summary.claims[0].supported, false, 'a saved page must have a valid date');
  }
}
const noPages = recitBotPrimaryFields({ fields: { summary: { value, claims: [claims[0]] } } });
assert.equal(noPages.fields.summary.claims[0].supported, false);
const noClaims = { description: { value }, summary: { value, claims: [] } };
assert.deepEqual(recitBotPrimaryFields({ pages: [first], fields: noClaims }).fields, {
  description: { value: '' }, summary: { value: '', claims: [] },
});
const emptyValue = recitBotPrimaryFields({
  pages: [first], fields: { summary: { value: '', claims: [{ text: value, supported: true }] } },
});
assert.equal(emptyValue.fields.summary.claims[0].supported, false);

const title = 'Source Hotel';
const pool = 'Source Hotel has a rooftop pool with city views.';
const breakfast = 'Source Hotel serves breakfast in the sunny ground floor cafe.';
const detail = 'Source Hotel offers quiet guest rooms beside the public garden and a staffed front desk throughout the day. Guests can reach the nearby subway station on foot and use the shared lounge after visiting local museums and theaters during their stay.';
const sourcePages = [
  { url: first.url, text: pool, fetchedAt },
  { url: second.url, text: breakfast, fetchedAt },
  { url: 'https://example.org/detail', text: detail, fetchedAt },
  { url: 'https://example.org/undated', text: 'UNDATED PAGE MUST NOT APPEAR' },
];
const mergeInput = {
  pages: sourcePages,
  fields: {
    summary: { value: '', claims: [
      { text: pool, sourceUrl: first.url, pages: ['p1'], supported: true },
      { text: breakfast, sourceUrl: second.url, pages: ['p2'], supported: true },
    ] },
    pool: { value: pool, claims: [{ text: pool, sourceUrl: first.url, pages: ['p1'], supported: true }] },
    breakfast: { value: breakfast, claims: [{ text: breakfast, pages: ['p2'], supported: true }] },
    bad: { value, claims: [unsupported, { text: 'FALSE CLAIM MUST NOT APPEAR', sourceUrl: first.url, supported: false }] },
    uncited: { value, claims: [{ text: 'UNCITED CLAIM MUST NOT APPEAR', supported: true }] },
    detailField: { value: detail, claims: [{ text: detail, sourceUrl: sourcePages[2].url, pages: ['p3'], supported: true }] },
  },
};
const composed = mergeBotPrimaryPresentedFields({ pages: [unrelated, sourcePages[1]] }, mergeInput, { title });
for (const key of ['summary', 'description']) {
  const field = composed.fields[key];
  assert.ok(field?.value, `${key} can be composed from dated source text`);
  assert.ok(field.value.includes(pool));
  assert.ok(field.value.includes(breakfast));
  assert.equal(/rooftop pool and free breakfast|FALSE CLAIM|UNCITED CLAIM|UNDATED PAGE/.test(field.value), false);
  assert.ok(field.claims.length >= 2, 'composed text keeps its per-source citations');
  for (const claim of field.claims) {
    const page = composed.pages[Number(claim.pages[0].slice(1)) - 1];
    assert.equal(claim.supported, true);
    assert.equal(claim.sourceUrl, page.url);
    assert.ok(Number.isFinite(Date.parse(page.fetchedAt)));
    assert.ok(page.text.includes(claim.text), 'each emitted text bit belongs to its own source');
    assert.ok(field.value.includes(claim.text), 'citations only describe text actually used');
  }
  assert.deepEqual(field.claims.find((claim) => claim.text === pool).pages, ['p3']);
  assert.deepEqual(field.claims.find((claim) => claim.text === breakfast).pages, ['p2']);
}
assert.ok(composed.fields.description.claims.some((claim) => claim.sourceUrl === sourcePages[2].url));
assert.equal(composed.fields.summary.claims.some((claim) => claim.sourceUrl === sourcePages[2].url), false);
const undatedOnly = mergeBotPrimaryPresentedFields({}, {
  pages: [{ ...sourcePages[2], fetchedAt: 'invalid' }], fields: {},
}, { title });
assert.equal(undatedOnly.fields?.summary, undefined);
assert.equal(undatedOnly.fields?.description, undefined);
const truncated = mergeBotPrimaryPresentedFields({}, {
  pages: [sourcePages[2], sourcePages[1]],
  fields: {
    summary: { value: '', claims: [{ text: breakfast, sourceUrl: second.url, pages: ['p2'], supported: true }] },
    description: { value: '', claims: [
      { text: detail, sourceUrl: sourcePages[2].url, pages: ['p1'], supported: true },
      { text: breakfast, sourceUrl: second.url, pages: ['p2'], supported: true },
    ] },
  },
}, { title });
assert.ok(truncated.fields.description.value.includes(detail));
assert.ok(truncated.fields.description.value.split(/\s+/).length > 40);
assert.ok(truncated.fields.summary.value.includes(breakfast));
assert.notEqual(truncated.fields.summary.value, truncated.fields.description.value);
assert.equal(truncated.fields.summary.claims.length, 1, 'summary keeps only its cited claims');
assert.ok(!truncated.fields.summary.value.includes(detail.split(/\s+/).slice(0, 8).join(' ')));
console.log(JSON.stringify({ ok: true, checked: 'bot-primary-recit-provenance', reorderedPages: ['p2', 'p1'], composedCitations: composed.fields.description.claims.length }));
