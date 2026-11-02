import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { dossierFillHardFailure } from '../src/vacation/xai-dossier-fill-state.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';

const page = (url, text) => ({ url, text, fetchedAt: '2026-10-27T05:00:00Z', sha256: createHash('sha256').update(text).digest('hex') });
const field = (value, id) => ({ value, claims: [{ text: value, pages: [id] }] });

for (const category of ['flight', 'restaurant']) for (const size of category === 'flight' ? [1, 76] : [1, 3]) {
  for (const oldFailure of [false, true]) test(`${category} ${size}-page dossier, oldFailure=${oldFailure}, exposes factual evidence and passes unchanged presented judge`, async () => {
    const flight = category === 'flight';
    const title = flight ? 'Coastal Air SEA → BOS' : 'Harbor Bistro';
    const summary = flight
      ? 'Coastal Air SEA → BOS links Seattle and Boston nonstop, with an early departure and an afternoon arrival.'
      : 'Harbor Bistro pairs a waterfront dining room with grilled fish and seasonal vegetables for lunch beside the harbor.';
    const description = flight
      ? 'Coastal Air SEA → BOS connects Seattle and Boston on a nonstop service between the two airports. The morning departure reaches Boston during the afternoon, with economy seating available on the route. Published departure and arrival times describe the same direct service, without a connecting airport or a change of aircraft.'
      : 'Harbor Bistro sits beside the waterfront, with a dining room facing the harbor. Grilled fish comes with seasonal vegetables at lunch, alongside a changing selection of dishes. The dining room accommodates both lunch and dinner, with tables looking toward the water and a separate entrance beside the harbor walkway.';
    const detail = flight
      ? 'Seattle to Boston nonstop. Morning departure, afternoon arrival. Economy seating. No connection or change of aircraft.'
      : 'Waterfront dining room. Grilled fish with seasonal vegetables. Lunch and dinner. Harbor walkway entrance. Tables facing the water.';
    const source = { thing: title, fields: {}, attempts: [{ kind: 'page', status: 'ok' }], pages: Array.from({ length: size }, (_, index) => page(`https://evidence.example/${index}`, index === size - 1 ? detail : 'Navigation and accessibility information for the company website.')) };
    if (oldFailure) source.attempts.push({ kind: 'builder', step: 'operator_presented_text_retry', status: 'failed', evidenceHash: createHash('sha256').update(JSON.stringify({ textBuildVersion: 3, pages: source.pages.map(({ url, sha256 }) => [url, sha256]).sort() })).digest('hex') });
    const place = { title, category, id: `fixture-${category}-${size}`, trip_id: 'fixture-trip' };
    console.log(JSON.stringify({ category, size, before: dossierFillHardFailure(source, place).presentedReasons }));
    const storeImpl = memoryStore();
    storeImpl.rows.set(`trip:fixture-trip:place:${place.id}`, structuredClone(source));
    let builds = 0;
    let seenCategory;
    const result = await fetchXaiPlaceRatings(place, {
      env: {}, storeImpl, reuseSavedPages: true, forceRefresh: true,
      fetchImpl: async () => assert.fail('offline fixture cannot fetch'),
      gatherImpl: async () => assert.fail('reuse saved evidence'),
      extractReviewsImpl: async () => ({ reviews: [] }),
      buildImpl: async (_dossier, { prompt }) => {
        builds += 1;
        const input = JSON.parse(prompt.split('\n').at(-1));
        seenCategory = input.category;
        assert.ok(input.pages.reduce((sum, row) => sum + row.text.length, 0) <= 16000);
        const cited = input.pages.find((row) => row.text.includes(detail));
        return { payload: {}, structuredText: '', findings: cited ? {
          summary: field(summary, cited.id), description: field(description, cited.id),
        } : {} };
      },
      judgeImpl: async (dossier, claims) => claims.map(({ id, pages }) => ({ id, supported: pages.every((pid) => dossier.pages[Number(pid.slice(1)) - 1].text === detail), reason: 'Offline paraphrases supported by the cited factual page.' })),
    });
    const built = result.parsed.evidenceDossier;
    console.log(JSON.stringify({ category, size, after: dossierFillHardFailure(built, place).presentedReasons || [], builds }));
    assert.equal(dossierPresented(built, place), true);
    assert.equal(result.failed, undefined);
    assert.equal(builds, 1);
    assert.equal(seenCategory, category);
    assert.equal(built.fields.summary.claims[0].pages[0], `p${size}`);
  });
}
