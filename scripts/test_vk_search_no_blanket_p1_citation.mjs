import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';

const sources = [
  { url: 'https://garden.test/first', fetchedAt: '2026-10-28T00:00:00Z', text: 'The garden house serves fresh seasonal vegetables beside the sunny terrace each afternoon.' },
  { url: 'https://garden.test/second', fetchedAt: '2026-10-28T00:00:00Z', text: 'At the garden house, guests can explore the shaded paths and enjoy a quiet meal after visiting nearby galleries and shops. The dining room overlooks flowering trees while the terrace offers comfortable seating throughout the warmer months of the year.' },
];
const place = { title: 'Garden House' };
const secondClaim = 'guests can explore the shaded paths and enjoy a quiet meal after visiting nearby galleries and shops';
const botDescription = {
  value: `${sources[0].text} ${sources[1].text}`,
  claims: [
    { text: sources[0].text, sourceUrl: sources[0].url, supported: true },
    { text: secondClaim, sourceUrl: sources[1].url, supported: true },
  ],
};

function assertDescriptionIntegrity(dossier) {
  const field = dossier.fields.description;
  assert.ok(field?.value);
  assert.ok(field.claims.some((claim) => claim.sourceUrl === sources[1].url));
  for (const claim of field.claims) {
    const page = dossier.pages[Number(claim.pages[0].slice(1)) - 1];
    assert.equal(claim.sourceUrl, page.url);
    assert.ok(page.text.includes(claim.text));
    assert.ok(field.value.includes(claim.text));
  }
  assert.equal(field.claims.some((claim) => claim.text.includes(place.title)), false);
}

for (const mode of ['adapter excerpts', 'adapter claims and excerpts', 'seed ensure']) {
  test(mode, () => {
    const dossier = mode === 'seed ensure'
      ? mergeBotPrimaryPresentedFields({}, { pages: sources, fields: { description: botDescription } }, place)
      : vkSearchResultToDossier({
        sources,
        voicePass: { claimSupportOk: true },
        summaryClaims: mode.includes('claims') ? [{ claim: sources[0].text, sourceUrl: sources[0].url, supported: true }] : [],
        fields: { description: botDescription },
      }, place);
    assertDescriptionIntegrity(dossier);
  });
}

test('no bot-written fields: adapter does not compose description', () => {
  const dossier = vkSearchResultToDossier({
    sources,
    voicePass: { claimSupportOk: true },
    summaryClaims: [{ claim: sources[0].text, sourceUrl: sources[0].url, supported: true }],
  }, place);
  assert.equal(dossier.fields.description, undefined);
});
