import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';

const page = { url: 'https://garden.test/info', fetchedAt: '2026-10-28T00:00:00Z', text: 'Garden House serves seasonal vegetables beside a quiet terrace.' };
page.sha256 = createHash('sha256').update(page.text).digest('hex');
const falseText = 'The hotel offers a rooftop swimming pool and free breakfast.';
const bad = { text: falseText, sourceUrl: page.url, pages: ['p1'], supported: true };
const good = { text: page.text, sourceUrl: page.url, pages: ['p1'], supported: true };
const mem = new Map([['r3-stored', { thing: 'Garden House', pages: [page], fields: { summary: { value: falseText, claims: [bad] }, detail: { value: page.text, claims: [good] }, mixed: { value: `${falseText} ${page.text}`, claims: [bad, good] } } }]]);
const storeImpl = { async getDossier(key) { return mem.get(key) || null; }, async putDossier(key, value) { mem.set(key, structuredClone(value)); } };
await runBotPrimarySeedTargets([{ placeId: 'r3-stored', title: 'Garden House', category: 'restaurant', dossierKey: 'r3-stored' }], { env: { VK_SEARCH_CENSUS_DIR: '/missing' }, storeImpl, gatherImpl: async () => ({ pages: [], fields: {} }) });
const dossier = mem.get('r3-stored');
const rejected = Object.values(dossier.fields).flatMap((field) => field?.claims || []).filter((claim) => claim.text === falseText);
assert.ok(rejected.length);
for (const claim of rejected) {
  assert.equal(claim.supported, false);
  assert.equal(claim.sourceUrl, page.url);
}
assert.ok(!dossier.fields.summary.value);
assert.equal(dossier.fields.detail.claims[0].supported, true);
assert.equal(dossier.fields.detail.value, page.text);
assert.equal(dossier.fields.mixed.value.includes(falseText), false);
console.log('persisted claims reverified on their own pages; unsupported values removed');
