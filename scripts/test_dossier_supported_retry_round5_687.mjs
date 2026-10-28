import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchXaiPlaceRatings, dossierBuilderPrompt, judgeDossierFindings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { buildDossierText } from '../src/vacation/dossier-text-builder.mjs';
import { dossierTextEvidencePages } from '../src/vacation/dossier-text-evidence.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { createDossierFillTrace } from '../src/vacation/dossier-fill-trace.mjs';
import { memoryStore } from './lib/passb-text-builder-test-support.mjs';
import { target, page, field, summary, description, findings } from './lib/dossier-round4-test-support.mjs';

const lateFacts = `${summary} ${description}`;
const fullText = 'Harbor Bistro navigation and accessibility information. '.repeat(60) + lateFacts;
const unsupported = () => ({ summary: field('Harbor Bistro has a rooftop pool with panoramic city views and a luxurious private dining room.'),
  description: field('Harbor Bistro has a rooftop pool with panoramic city views. Guests can reserve a luxurious private dining room with a personal chef. Its rooftop terrace overlooks the city skyline, while the chef prepares a tasting menu for each party. The venue also offers a poolside cocktail bar with nightly entertainment.') });
const judge = async (dossier, claims) => claims.map(({ id, text }) => ({ id,
  supported: dossier.pages.some((p) => p.text.includes(text)),
  reason: text.includes('rooftop') ? 'The page never mentions a rooftop pool or private chef.' : 'The cited saved page states the fixture facts.',
}));

for (const recover of [true, false]) test(`G6 one-page rejected build retries once from full saved text, recovery=${recover}`, async () => {
  const storeImpl = memoryStore(), key = 'trip:offline-trip:place:harbor-dining';
  storeImpl.rows.set(key, { thing: target.title, pages: [page(fullText)], fields: {}, attempts: [{ kind: 'page', status: 'ok' }] });
  let builds = 0;
  const trace = createDossierFillTrace();
  const result = await fetchXaiPlaceRatings(target, {
    env: {}, storeImpl, dossierKey: key, forceRefresh: true, reuseSavedPages: true, trace,
    fetchImpl: async () => assert.fail('offline saved-page reuse'), gatherImpl: async () => assert.fail('no regather'),
    extractReviewsImpl: async () => ({ reviews: [] }),
    buildImpl: async (_dossier, { prompt, textProblems }) => {
      builds += 1;
      const input = JSON.parse(prompt.split('\n').at(-1));
      const hasFacts = input.pages.some((p) => p.text.includes(lateFacts));
      assert.equal(hasFacts, true, 'full saved factual bytes beyond 1200 characters reach the builder');
      assert.match(prompt, /existing fields identify the target; they are not evidence/);
      if (builds === 2) {
        assert.ok(textProblems.some((p) => p.includes('page never mentions a rooftop')));
        assert.match(prompt, /judge's rejection feedback/);
      }
      const output = recover && builds === 2 && hasFacts ? findings() : unsupported();
      return { findings: output, structuredText: JSON.stringify(output) };
    }, judgeImpl: judge,
  });
  assert.equal(builds, 2);
  assert.equal(trace.builder.attempts.length, 2);
  assert.equal(trace.builder.attempts[0].blankedBy, 'judge_rejected_all');
  assert.equal(trace.builder.blankedBy, recover ? null : 'judge_rejected_all');
  assert.equal(dossierPresented(result.parsed.evidenceDossier, target), recover);
  if (!recover) {
    assert.equal(result.failed, true);
    assert.equal(result.parsed.evidenceDossier.fields.summary, undefined);
    assert.equal(result.parsed.evidenceDossier.fields.description, undefined);
  }
});

test('an all-rejected narrative in a reviews-only build also receives the bounded factual retry', async () => {
  const dossier = { thing: target.title, pages: [page(lateFacts)], fields: {}, attempts: [] };
  const trace = createDossierFillTrace();
  let builds = 0;
  const result = await buildDossierText(dossier, target, {
    reviewsOnly: true, includeReviews: true, trace,
    build: async ({ textProblems }) => {
      builds += 1;
      if (builds === 2) assert.ok(textProblems.includes('judge_rejected_all'));
      return { findings: builds === 1 ? unsupported() : findings() };
    },
    judgeFindings: (output) => judgeDossierFindings(dossier, output, { env: {}, judgeImpl: judge }),
  });
  assert.equal(builds, 2);
  assert.equal(dossierPresented(result.built, target), true);
});

test('full short pages and bounded long-page excerpts preserve the existing total text budget', () => {
  const dossier = { thing: target.title, pages: [page(fullText)] };
  assert.equal(dossierTextEvidencePages(dossier)[0].text, fullText);
  const pages = Array.from({ length: 8 }, (_, i) => page(fullText.repeat(8), i));
  const selected = dossierTextEvidencePages({ thing: target.title, pages }, 16000);
  assert.ok(selected.reduce((sum, p) => sum + p.text.length, 0) <= 16000);
  const input = JSON.parse(dossierBuilderPrompt(dossier, { place: target }).split('\n').at(-1));
  assert.ok(input.pages[0].text.includes(lateFacts));
});
