import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { buildDossierText } from '../src/vacation/dossier-text-builder.mjs';
import { judgeDossierFindings, dossierBuilderPrompt } from '../src/vacation/xai-grok-place-ratings.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { dossierFillHardFailure } from '../src/vacation/xai-dossier-fill-state.mjs';
import { saveThingEvidenceDossier, loadThingEvidenceDossier } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';

const field = (value) => ({ value, claims: [{ text: value, pages: ['p1'] }] });

for (const category of ['restaurant', 'attraction']) for (const pageCount of [1, 2]) {
  for (const missing of ['summary', 'description']) test(`${category}, ${pageCount} saved pages, retry returns only ${missing}`, async () => {
    const place = { title: category === 'restaurant' ? 'Harbor Bistro' : 'Harbor Museum', category, website: 'https://harbor.example/' };
    const summary = category === 'restaurant'
      ? `${place.title} serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.`
      : `${place.title} offers a waterfront visit with a daily changing selection of seasonal exhibitions and local craft displays.`;
    const description = category === 'restaurant'
      ? `${place.title} serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables.`
      : `${place.title} offers a waterfront visit with a daily changing selection of seasonal exhibitions and local craft displays. The main room contains displays made by local artists alongside a collection of regional photographs. Visitors can explore the collection throughout the day, with a separate area devoted to changing exhibitions and work from the surrounding community.`;
    const text = `${summary} ${description}`;
    const dossier = {
      thing: place.title, fields: {}, reviewSet: [],
      attempts: [{ kind: 'page', status: 'ok', startedAt: '2026-10-26T12:00:00Z' }],
      pages: Array.from({ length: pageCount }, (_, index) => ({ url: `${place.website}${index}`, text, fetchedAt: '2026-10-26T12:00:00Z', sha256: createHash('sha256').update(text).digest('hex') })),
    };
    let calls = 0;
    const result = await buildDossierText(dossier, place, {
      includeReviews: false,
      build: async (options) => {
        const input = JSON.parse(dossierBuilderPrompt(dossier, options).split('\n').at(-1));
        assert.equal(input.pages.length, pageCount);
        assert.ok(input.pages[0].text.includes(place.title));
        calls += 1;
        return { payload: {}, structuredText: '', findings: options.textProblems
          ? { [missing]: field(missing === 'summary' ? summary : description) }
          : { [missing === 'summary' ? 'description' : 'summary']: field(missing === 'summary' ? description : summary) } };
      },
      judgeFindings: (findings, skipReviewClaims) => judgeDossierFindings(dossier, findings, {
        env: {}, skipReviewClaims,
        judgeImpl: async (_dossier, claims) => claims.map((claim) => ({ id: claim.id, supported: text.includes(claim.text), reason: 'Offline exact saved evidence; production judge unchanged.' })),
      }),
    });
    const counts = computeDossierFieldCounts(result.built, place);
    const failure = dossierFillHardFailure(result.built, place);
    console.log(JSON.stringify({ category, pageCount, missing, counts: { summary: counts.summary.status, description: counts.description.status }, violations: failure.presentedReasons || [] }));
    assert.equal(calls, 2);
    assert.equal(dossierPresented(result.built, place), true);
    assert.match(result.built.fields.description.value, /No reviews were found/);
    const storeImpl = memoryStore();
    await saveThingEvidenceDossier('fixture:partial', result.built, { env: {}, storeImpl });
    assert.equal(dossierPresented(await loadThingEvidenceDossier('fixture:partial', { env: {}, storeImpl }), place), true);
  });
}

test('partial retries cannot replace supported text with rejected claims', async () => {
  const thing = 'Harbor Bistro';
  const summary = `${thing} serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.`;
  const text = `${summary} The lunch menu changes daily.`;
  const dossier = { thing, pages: [{ url: 'https://harbor.example/', text, fetchedAt: '2026-10-26T12:00:00Z', sha256: createHash('sha256').update(text).digest('hex') }], attempts: [{ kind: 'page', status: 'ok' }] };
  const place = { title: thing, category: 'restaurant' };
  const result = await buildDossierText(dossier, place, {
    build: async ({ textProblems }) => ({ findings: textProblems
      ? { description: field('An invented narrative. '.repeat(20)) }
      : { summary: field(summary) } }),
    judgeFindings: (findings) => judgeDossierFindings(dossier, findings, {
      env: {}, judgeImpl: async (_dossier, claims) => claims.map(({ id, text: claim }) => ({ id, supported: text.includes(claim) })),
    }),
  });
  assert.equal(dossierPresented(result.built, place), false);
  assert.equal(result.built.fields.summary.value, summary);
  assert.equal(result.built.fields.description, undefined);
});

for (const reject of [false, true]) test(`old text exhaustion reaches revised builder once, rejection=${reject}`, async () => {
  const target = { tripId: 'fixture-trip', placeId: 'fixture-text', title: 'Harbor Bistro', category: 'restaurant', website: 'https://harbor.example/' };
  const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
  const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables.';
  const text = `${summary} ${description}`;
  const pages = [{ url: target.website, text, fetchedAt: '2026-10-26T12:00:00Z', sha256: createHash('sha256').update(text).digest('hex') }];
  const evidenceHash = createHash('sha256').update(JSON.stringify({ textBuildVersion: 2, pages: pages.map(({ url, sha256 }) => [url, sha256]) })).digest('hex');
  const storeImpl = memoryStore();
  const key = tripPlaceDossierKey(target.tripId, target.placeId);
  await saveThingEvidenceDossier(key, {
    thing: target.title, pages, fields: {},
    attempts: [{ kind: 'page', status: 'ok' }, { kind: 'builder', step: 'operator_presented_text_retry', status: 'failed', evidenceHash }],
  }, { env: {}, storeImpl });
  let builds = 0;
  const run = () => runThingEvidenceDossierStagingTargets([target], {
    env: {}, operatorFill: true, storeImpl,
    fetchImpl: async () => assert.fail('saved text repair must not search'),
    gatherImpl: async () => assert.fail('saved pages must be reused'),
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (_dossier, options) => {
      builds += 1;
      return { payload: {}, structuredText: '', findings: options.textProblems?.length ? { description: field(description) } : { summary: field(summary) } };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: !reject })),
  });
  const result = (await run()).results[0];
  assert.equal(builds, 2);
  const saved = await loadThingEvidenceDossier(key, { env: {}, storeImpl });
  assert.equal(dossierPresented(saved, target), !reject);
  assert.equal(result.failed, reject);
  if (reject) {
    assert.equal(result.error, 'presented_fields_not_ok');
    assert.ok(result.presentedReasons.includes('summary:missing'));
    assert.ok(result.presentedReasons.includes('description:missing'));
    await run();
    assert.equal(builds, 4, 'next operator call retries a rejected repair once');
  }
});
