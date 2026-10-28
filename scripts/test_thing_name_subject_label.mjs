import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';

const thing = 'A Very Long Thing Name That Cannot Supply Any Sourced Words';
const body = 'Seasonal vegetables are served beside a quiet terrace with shaded paths and comfortable seating for visitors throughout the warmer months. Guests can enjoy lunch after exploring nearby galleries and shops before returning for a peaceful afternoon meal in the sunny garden.';
for (const mode of ['adapter', 'seed']) {
  const compose = (text) => {
    const page = { url: 'https://garden.test/info', text, fetchedAt: '2026-10-28T00:00:00Z' };
    return mode === 'adapter' ? vkSearchResultToDossier({ sources: [page] }, { title: thing }) : mergeBotPrimaryPresentedFields({}, { pages: [page], fields: {} }, { title: thing });
  };
  test(`${mode}: uncited subject label`, () => {
    const dossier = compose(body);
    for (const key of ['summary', 'description']) {
      const field = dossier.fields[key];
      assert.ok(field?.value.startsWith(`${thing}: `));
      for (const claim of field.claims) {
        assert.equal(claim.text.includes(thing), false);
        assert.ok(body.includes(claim.text));
      }
    }
    assert.equal(dossier.pages[0].text, body);
  });
  test(`${mode}: short sourced prose presents without word minimums`, () => {
    assert.ok(compose('Fresh seasonal vegetables served beside shaded garden paths.').fields.summary?.value);
    const short = body.split(/\s+/).slice(0, 39).join(' ');
    assert.ok(compose(short).fields.description?.value);
  });
  test(`${mode}: an existing name needs no label`, () => {
    const dossier = compose(`Garden walks around ${thing} offer relaxing afternoons. ${body}`);
    assert.equal(dossier.fields.summary.value.startsWith(`${thing}: `), false);
  });
}
test('seed keeps claim-supported description after subject-label uncap', () => {
  const short = body.split(/\s+/).slice(0, 39).join(' ');
  const page = { url: 'https://garden.test/info', text: short, fetchedAt: '2026-10-28T00:00:00Z' };
  const claim = { text: short, sourceUrl: page.url, pages: ['p1'], supported: true };
  const field = { value: `${thing}: ${short}`, claims: [claim] };
  const dossier = mergeBotPrimaryPresentedFields({}, { thing, pages: [page], fields: { description: field, summary: field } }, { title: thing });
  assert.equal(dossier.fields.description?.value, `${thing}: ${short}`);
});
