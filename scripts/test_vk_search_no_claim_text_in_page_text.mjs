import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';

const source = { url: 'https://www.yelp.com/biz/garden', fetchedAt: '2026-10-28T00:00:00Z', title: 'Source title', text: 'Original returned text', snippet: 'Original snippet' };
const dossier = vkSearchResultToDossier({ sources: [source], summaryClaims: [{ claim: 'Fabricated rooftop swimming pool', sourceUrl: source.url }], hoursHint: '9am–5pm', priceHint: '$50', happyHourHint: 'Cocktails at 4pm', rating: { primary: 4.8, primarySource: 'yelp' }, reviewCount: { yelp: 123 }, voicePass: { claimSupportOk: true }, itineraryNoteCandidate: 'Bring your swimsuit' }, { title: 'Never Inject This Thing Name' });
const original = [source.title, source.text, source.snippet].join('\n');
assert.equal(dossier.pages[0].text, original);
assert.equal(dossier.pages[0].sha256, createHash('sha256').update(original).digest('hex'));
assert.equal(dossier.ratingEvidence, undefined);
assert.equal(dossier.yelpRating, undefined);
console.log('saved source bytes and hash preserved; unsupported rating omitted');
