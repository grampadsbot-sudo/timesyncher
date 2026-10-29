import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';

const thing = 'A Very Long Thing Name That Cannot Supply Any Sourced Words';
const body = 'Seasonal vegetables are served beside a quiet terrace with shaded paths and comfortable seating for visitors throughout the warmer months. Guests can enjoy lunch after exploring nearby galleries and shops before returning for a peaceful afternoon meal in the sunny garden.';

test('adapter: uncited subject label', () => {
  const page = { url: 'https://garden.test/info', text: body, fetchedAt: '2026-10-28T00:00:00Z' };
  const dossier = vkSearchResultToDossier({ sources: [page] }, { title: thing });
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

test('adapter: label cannot meet word minimums', () => {
  const page = { url: 'https://garden.test/info', text: 'Fresh seasonal vegetables served beside shaded garden paths.', fetchedAt: '2026-10-28T00:00:00Z' };
  assert.ok(!vkSearchResultToDossier({ sources: [page] }, { title: thing }).fields.summary?.value);
  const short = body.split(/\s+/).slice(0, 39).join(' ');
  const page2 = { url: 'https://garden.test/info', text: short, fetchedAt: '2026-10-28T00:00:00Z' };
  assert.ok(!vkSearchResultToDossier({ sources: [page2] }, { title: thing }).fields.description?.value);
});

test('adapter: an existing name needs no label', () => {
  const page = { url: 'https://garden.test/info', text: `Garden walks around ${thing} offer relaxing afternoons. ${body}`, fetchedAt: '2026-10-28T00:00:00Z' };
  const dossier = vkSearchResultToDossier({ sources: [page] }, { title: thing });
  assert.equal(dossier.fields.summary.value.startsWith(`${thing}: `), false);
});

test('seed: uncited subject label', () => {
  const page = { url: 'https://garden.test/info', text: body, fetchedAt: '2026-10-28T00:00:00Z' };
  const claims = [{ text: body, sourceUrl: page.url, pages: ['p1'], supported: true }];
  const dossier = mergeBotPrimaryPresentedFields({}, { pages: [page], fields: { summary: { value: '', claims }, description: { value: '', claims } } }, { title: thing });
  assert.ok(dossier.fields.description?.value.startsWith(`${thing}: `));
  for (const key of ['summary', 'description']) {
    const field = dossier.fields[key];
    if (!field?.value) continue;
    assert.ok(field.value.startsWith(`${thing}: `));
    for (const claim of field.claims) {
      assert.equal(claim.text.includes(thing), false);
      assert.ok(body.includes(claim.text));
    }
  }
});

test('seed: short sourced prose presents without word minimums', () => {
  const shortText = 'Fresh seasonal vegetables served beside shaded garden paths.';
  const page = { url: 'https://garden.test/info', text: shortText, fetchedAt: '2026-10-28T00:00:00Z' };
  const claims = [{ text: shortText, sourceUrl: page.url, pages: ['p1'], supported: true }];
  const dossier = mergeBotPrimaryPresentedFields({}, { pages: [page], fields: { summary: { value: '', claims } } }, { title: thing });
  assert.ok(dossier.fields.summary?.value);
  const short = body.split(/\s+/).slice(0, 39).join(' ');
  const page2 = { url: 'https://garden.test/info', text: short, fetchedAt: '2026-10-28T00:00:00Z' };
  const claims2 = [{ text: short, sourceUrl: page2.url, pages: ['p1'], supported: true }];
  const dossier2 = mergeBotPrimaryPresentedFields({}, { pages: [page2], fields: { description: { value: '', claims: claims2 } } }, { title: thing });
  assert.ok(dossier2.fields.description?.value);
});

test('seed: an existing name needs no label', () => {
  const text = `Garden walks around ${thing} offer relaxing afternoons. ${body}`;
  const page = { url: 'https://garden.test/info', text, fetchedAt: '2026-10-28T00:00:00Z' };
  const claims = [{ text, sourceUrl: page.url, pages: ['p1'], supported: true }];
  const dossier = mergeBotPrimaryPresentedFields({}, { pages: [page], fields: { summary: { value: '', claims } } }, { title: thing });
  const field = dossier.fields.summary || dossier.fields.description;
  assert.equal(field.value.startsWith(`${thing}: `), false);
});

test('seed keeps claim-supported description after subject-label uncap', () => {
  const short = body.split(/\s+/).slice(0, 39).join(' ');
  const page = { url: 'https://garden.test/info', text: short, fetchedAt: '2026-10-28T00:00:00Z' };
  const claim = { text: short, sourceUrl: page.url, pages: ['p1'], supported: true };
  const field = { value: `${thing}: ${short}`, claims: [claim] };
  const dossier = mergeBotPrimaryPresentedFields({}, { thing, pages: [page], fields: { description: field, summary: field } }, { title: thing });
  assert.equal(dossier.fields.description?.value, `${thing}: ${short}`);
});
