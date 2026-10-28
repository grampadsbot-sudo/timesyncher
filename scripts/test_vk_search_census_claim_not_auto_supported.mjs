import assert from 'node:assert/strict';
import test from 'node:test';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';

const source = { url: 'https://census.test/menu', fetchedAt: '2026-10-28T00:00:00Z', text: 'The garden serves fresh seasonal vegetables beside a quiet shaded terrace each afternoon.' };
for (const [name, page, claim] of [
  ['unrelated', source, 'The hotel offers a rooftop pool and free breakfast.'],
  ['missing date', { ...source, fetchedAt: undefined }, source.text],
  ['invalid date', { ...source, fetchedAt: 'invalid' }, source.text],
  ['wrong number', source, 'The garden serves 900 seasonal vegetables beside a quiet terrace.'],
]) {
  test(name, () => {
    const dossier = vkSearchResultToDossier({ sources: [page], summaryClaims: [{ claim, sourceUrl: page.url }], voicePass: { claimSupportOk: true } }, { title: 'Census Garden' });
    const supported = Object.values(dossier.fields).flatMap((field) => field.claims || []).filter((row) => row.supported === true);
    assert.equal(supported.some((row) => row.text.includes(claim)), false);
  });
}
test('literal claim survives', () => {
  const dossier = vkSearchResultToDossier({ sources: [source], summaryClaims: [{ claim: source.text, sourceUrl: source.url }] }, { title: 'Census Garden' });
  assert.ok(Object.values(dossier.fields).some((field) => field.claims.some((claim) => claim.text === source.text && claim.supported === true)));
});
test('shared verifier requires numeric, price and time tokens', async () => {
  const { claimTextSupportedByPage } = await import('../src/vacation/dossier-claim-support.mjs');
  assert.equal(claimTextSupportedByPage('The cafe serves fresh seasonal vegetables.', 'Fresh seasonal vegetables are on the cafe menu.'), true);
  assert.equal(claimTextSupportedByPage('Fresh vegetables cost $25 at 5pm', 'Fresh vegetables cost $20 at 5pm'), false);
  assert.equal(claimTextSupportedByPage('Fresh vegetables cost $25 at 5pm', 'Fresh vegetables cost $25 at 6pm'), false);
  assert.equal(claimTextSupportedByPage('Fresh vegetables cost 25 dollars', 'Fresh vegetables cost 125 dollars'), false);
  assert.equal(claimTextSupportedByPage('Mon–Sat 8am–7:30pm', 'Mon–Sat 8am–7:30pm'), true);
  assert.equal(claimTextSupportedByPage('', source.text), false);
});
test('shared verifier normalizes hours while preserving exact numbers and minutes', async () => {
  const { claimTextSupportedByPage } = await import('../src/vacation/dossier-claim-support.mjs');
  for (const [claimTime, pageTime] of [
    ['8am', '8'], ['7:30pm', '7:30'], ['8:00', '8'], ['8:00am', '8'],
    ['8', '8am'], ['7:30', '7:30pm'], ['8', '8:00'], ['8', '8:00am'],
  ]) {
    assert.equal(claimTextSupportedByPage(`The cafe opens daily at ${claimTime}.`, `Daily cafe hours begin at ${pageTime}.`), true, `${claimTime} matches ${pageTime}`);
  }
  for (const [claimTime, pageTime] of [
    ['5am', '6'], ['5', '6pm'], ['7:30pm', '7:31'], ['7:30', '7:00pm'],
    ['25', '125'], ['125', '25'], ['$25', '$125'], ['$25', '$26'],
  ]) {
    assert.equal(claimTextSupportedByPage(`The cafe opens daily at ${claimTime}.`, `Daily cafe hours begin at ${pageTime}.`), false, `${claimTime} differs from ${pageTime}`);
  }
});
