import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { dossierBuilderPrompt, fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { dossierPresented, passbPresentedHardTextViolations } from '../src/vacation/passb-dossier-presented.mjs';
import { preservePresentedDossierText } from '../src/vacation/dossier-text-builder.mjs';
import { applyDossierFields, prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';
import { saveThingEvidenceDossier, loadThingEvidenceDossier } from '../src/vacation/thing-evidence-dossier-store.mjs';
import { fixtureBuild, fixtureJudge, memoryStore, recorded } from './lib/passb-text-builder-test-support.mjs';

const place = { id: 602, title: "Zabar's", category: 'store', website: 'https://www.zabars.com/' };
const noNetwork = async () => { throw new Error('unexpected_network'); };
const source = () => structuredClone(recorded.dossiers[602]);

async function run({ seed, buildImpl, judgeImpl = fixtureJudge } = {}) {
  const storeImpl = memoryStore();
  if (seed) await saveThingEvidenceDossier('test:text', seed, { env: {}, storeImpl });
  const result = await fetchXaiPlaceRatings(place, {
    env: {}, storeImpl, dossierKey: 'test:text', forceRefresh: true, reuseSavedPages: true,
    fetchImpl: noNetwork, gatherImpl: source,
    buildImpl, judgeImpl, extractReviewsImpl: async () => ({ reviews: [] }),
  });
  return { result, saved: await loadThingEvidenceDossier('test:text', { env: {}, storeImpl }) };
}

test('page-rich saved dossier receives exact rejection feedback and rebuilds presented text', async () => {
  const options = [];
  const { result, saved } = await run({ buildImpl: async (dossier, opts) => {
    options.push(opts);
    return fixtureBuild(602, dossier, { repaired: Boolean(opts.textProblems?.length) });
  } });
  assert.equal(options.length, 2);
  assert.ok(options[1].textProblems.includes('summary:missing'));
  assert.match(options[1].prompt, /12-28 words.*exact Thing name/);
  assert.equal(result.failed, undefined);
  const counts = computeDossierFieldCounts(saved, place);
  assert.equal(counts.summary.status, 'ok');
  assert.equal(counts.description.status, 'ok');
  const hydrated = applyDossierFields({ category: 'store' }, saved);
  assert.deepEqual(passbPresentedHardTextViolations({ ...place, ...hydrated }), []);
  assert.equal(dossierPresented(saved, place), true);
});

test('no reviews keeps a supported description and appends the no-reviews note', () => {
  const d = source();
  d.fieldCounts = { reviews: { count: 0, status: 'missing' } };
  const f = fixtureBuild(602, d).findings;
  for (const field of Object.values(f)) field.claims.forEach((claim) => { claim.supported = true; });
  const built = prepareDossierFindings(d, f);
  assert.match(built.fields.description.value, /No reviews were found for this place\.$/);
  assert.equal(computeDossierFieldCounts(built, place).description.status, 'ok');
});

test('few reviews append limited number of reviews without inventing reviews', () => {
  const d = source();
  d.fieldCounts = { reviews: { count: 2, status: 'short' } };
  const f = fixtureBuild(602, d).findings;
  for (const field of Object.values(f)) field.claims.forEach((claim) => { claim.supported = true; });
  const built = prepareDossierFindings(d, f);
  assert.match(built.fields.description.value, /limited number of reviews/);
  assert.doesNotMatch(built.fields.description.value, /No reviews were found/);
  assert.equal(built.reviews.length, 0);
});

test('store regression shape: an accepted saved narrative survives a weaker refresh and persists', async () => {
  const good = await run({ buildImpl: async (d) => fixtureBuild(602, d) });
  assert.equal(dossierPresented(good.saved, place), true);
  const next = await run({ seed: good.saved, buildImpl: async (d) => fixtureBuild(602, d, { repaired: false }) });
  assert.equal(dossierPresented(next.saved, place), true);
  assert.equal(next.saved.fields.summary.value, good.saved.fields.summary.value);
  assert.equal(next.result.failed, undefined);
});

test('rejected paraphrases cannot turn into accepted text through repair', async () => {
  const { result, saved } = await run({ buildImpl: async (d) => fixtureBuild(602, d), judgeImpl: async () => [] });
  assert.equal(result.error, 'presented_fields_not_ok');
  assert.equal(dossierPresented(saved, place), false);
});

test('factual repairs keep the real product context and include saved review material', () => {
  const prompt = dossierBuilderPrompt(source(), { includeReviews: false });
  assert.doesNotMatch(prompt, /This product is a flight/);
  assert.match(prompt, /No price is required|no price is required/);
  assert.match(prompt, /limited number of reviews/);
  assert.match(prompt, /using ONLY the saved dossier pages/);
  const input = JSON.parse(prompt.split('\n').at(-1));
  assert.equal(input.fields.summary, undefined);
  assert.equal(input.fields.description, undefined);
});

test('a changed source hash cannot preserve old narrative support', async () => {
  const good = await run({ buildImpl: async (d) => fixtureBuild(602, d) });
  const built = structuredClone(good.saved);
  built.pages[0].text = 'This page now records a closure and no longer supports the old shop description.';
  built.pages[0].sha256 = createHash('sha256').update(built.pages[0].text).digest('hex');
  built.fields = {};
  assert.equal(preservePresentedDossierText(good.saved, built, place), built);
  assert.equal(built.fields.summary, undefined);
});

test('text citations retain their source identity when persistence keeps older pages first', async () => {
  const storeImpl = memoryStore();
  const original = source();
  const oldText = 'An unrelated venue page kept as historical evidence.';
  const old = { url: 'https://unrelated.example/', text: oldText, fetchedAt: '2026-10-20T00:00:00Z', sha256: createHash('sha256').update(oldText).digest('hex') };
  await saveThingEvidenceDossier('test:positions', { ...original, pages: [old, ...original.pages], fields: {} }, { env: {}, storeImpl });
  const incoming = { ...original, pages: original.pages.slice(0, 2) };
  const findings = fixtureBuild(602, incoming).findings;
  for (const field of Object.values(findings)) field.claims.forEach((claim) => { claim.supported = true; });
  const built = prepareDossierFindings(incoming, findings);
  await saveThingEvidenceDossier('test:positions', built, { env: {}, storeImpl });
  const saved = await loadThingEvidenceDossier('test:positions', { env: {}, storeImpl });
  assert.equal(saved.pages[0].url, old.url);
  for (const key of ['summary', 'description']) {
    const urls = saved.fields[key].claims[0].pages.map((id) => saved.pages[Number(id.slice(1)) - 1].url);
    assert.deepEqual(urls, incoming.pages.map((page) => page.url));
  }
});
