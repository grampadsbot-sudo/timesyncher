import assert from 'node:assert/strict';
import { runBotPrimarySeedTargets, recitBotPrimaryFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { placeFromTarget } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { claimTextContradictsPage } from '../src/vacation/dossier-claim-support.mjs';

const place = placeFromTarget({
  rowId: 687,
  placeId: 687,
  tripId: 99,
  ccabKey: 'Cilantro UWS',
  category: 'restaurant',
});

const mem = new Map();
const storeImpl = {
  async getDossier(key) { return mem.get(String(key)) || null; },
  async putDossier(key, dossier) { mem.set(String(key), structuredClone(dossier)); },
};

const seeded = await runBotPrimarySeedTargets([{
  rowId: 687,
  placeId: 687,
  tripId: 99,
  dossierKey: 'trip:99:place:687',
  title: place.title,
  category: 'restaurant',
}], { env: {}, storeImpl });

assert.equal(seeded.results[0].fillPath, 'bot-census');
assert.equal(seeded.results[0].presented, true, '687 census seed must present after recit');
assert.equal(seeded.results[0].failed, undefined);

const stored = mem.get('trip:99:place:687');
const description = String(stored?.fields?.description?.value || '').trim();
const summary = String(stored?.fields?.summary?.value || '').trim();
assert.ok(description.split(/\s+/).filter(Boolean).length >= 40, 'description must stay >=40 words');
assert.ok(summary.length >= 12, 'summary must remain');
assert.equal(dossierPresented(stored, place), true);

const url = 'https://delivery.example/cilantro';
const addressClaim = '485 Columbus Ave, New York, NY 10024';
const pageBoilerplate = `Cilantro menu. Delivery unavailable tacos burritos nightly specials. ${addressClaim} Group order reviews.`;
const narrativeWithTacos = `Cilantro UWS serves tacos and burritos with lively neighborhood energy at ${addressClaim} for families exploring the Upper West Side museum district.`;
assert.equal(
  claimTextContradictsPage(narrativeWithTacos, pageBoilerplate),
  true,
  'synthetic field must still polarity-conflict with unavailable near tacos',
);
const shrunk = recitBotPrimaryFields({
  thing: place.title,
  pages: [{ url, text: pageBoilerplate, fetchedAt: '2026-10-29T00:00:00Z' }],
  fields: {
    description: {
      value: narrativeWithTacos,
      claims: [
        { text: addressClaim, sourceUrl: url, pages: ['p1'], supported: true },
      ],
    },
  },
});
const shrunkDesc = String(shrunk.fields.description.value || '').trim();
assert.notEqual(shrunkDesc, narrativeWithTacos, 'conflict token outside supported claim must shrink field');
assert.ok(
  shrunkDesc.length < narrativeWithTacos.length,
  'shrunk description must be shorter than full narrative (may clear as filler)',
);

const openClaim = 'The rooftop pool is open daily for hotel guests.';
const closedPage = 'Amenities update: the rooftop pool is closed for renovation this season.';
const positiveField = `Example Hotel welcomes visitors. ${openClaim} Rooms are refreshed each morning.`;
const negatedRecit = recitBotPrimaryFields({
  thing: 'Example Hotel',
  pages: [{ url: 'https://hotel.example/pool', text: closedPage, fetchedAt: '2026-10-29T00:00:00Z' }],
  fields: {
    summary: {
      value: positiveField,
      claims: [
        { text: openClaim, sourceUrl: 'https://hotel.example/pool', pages: ['p1'], supported: true },
      ],
    },
  },
});
assert.notEqual(negatedRecit.fields.summary.value, positiveField, 'genuine open vs closed claim must still contradict recit');

console.log(JSON.stringify({
  ok: true,
  checked: 'bot-census-687-recit-supported-tokens',
  presented: seeded.results[0].presented,
  descriptionWords: description.split(/\s+/).filter(Boolean).length,
}));
