import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { normalizeDossierEvidence } from '../src/vacation/dossier-evidence-hydrate.mjs';
import { dossierPresented } from '../src/vacation/passb-dossier-presented.mjs';
import { gatherThingEvidence, dossierPagesVerified, mergeDossierForPersistence } from '../src/vacation/thing-evidence-dossier.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { tripPlaceDossierKey } from '../src/vacation/thing-evidence-dossier-store.mjs';

const target = {
  tripId: 'offline-trip', placeId: 'offline-bistro', title: 'Harbor Bistro',
  category: 'restaurant', website: 'https://harbor.example/', destination: 'Boston',
};
const key = tripPlaceDossierKey(target.tripId, target.placeId);
const env = { XAI_API_KEY: 'offline-fixture', BRAVE_SEARCH_API_KEY: 'offline-fixture' };
const staleReason = 'gather_failed:Tavily extract failed with HTTP 432.';
const summary = 'Harbor Bistro serves grilled fish and seasonal vegetables beside the waterfront, with a daily lunch dish.';
const description = 'Harbor Bistro serves grilled fish and seasonal vegetables in a waterfront dining room. Its lunch menu includes a daily fish dish alongside the seasonal plates. Diners can choose lunch by the harbor or settle into the dining room for a meal built around fish and vegetables. No reviews found.';
const text = `${summary} ${description}`;
const field = (value) => ({ value, claims: [{ text: 'Harbor Bistro serves grilled fish.', pages: ['p1'], supported: true }] });
const page = (url, body) => ({
  url, text: body, fetchedAt: '2026-10-26T12:00:00.000Z',
  sha256: createHash('sha256').update(body).digest('hex'),
});
const oldAttempt = {
  kind: 'page', provider: 'Tavily', stage: 'extract', status: 'failed',
  url: target.website, startedAt: '2026-10-25T12:00:00.000Z',
  error: 'Tavily extract failed with HTTP 432.', httpStatus: 432,
};

function fixture(initial, { hits = true, status = 200, official = true } = {}) {
  let saved = structuredClone(initial);
  let gathers = 0;
  let builds = 0;
  let extracts = 0;
  const queries = [];
  const storeImpl = {
    async getDossier() { return structuredClone(saved); },
    async putDossier(_key, incoming) {
      const merged = mergeDossierForPersistence(saved, incoming);
      const { hashes, sources } = computeDossierFieldHashes(merged);
      saved = structuredClone({ ...merged, fieldHashes: hashes, fieldSources: sources });
    },
  };
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/web/search')) {
      assert.ok(parsed.hostname.endsWith('search.brave.com'));
      const query = parsed.searchParams.get('q');
      queries.push(query);
      return {
        ok: status === 200, status,
        json: async () => ({ web: { results: hits && query === 'site:harbor.example' ? [{
          url: target.website, title: target.title, description: text,
          extra_snippets: ['The lunch menu includes a daily fish dish.'],
        }] : [] } }),
      };
    }
    assert.equal(url, target.website, 'only the official page may be fetched directly');
    return { ok: false, status: 403 };
  };
  const options = {
    env, storeImpl, operatorFill: true, skipExisting: true, fetchImpl,
    gatherImpl: async (place, gatherOptions) => {
      gathers += 1;
      return gatherThingEvidence(place, {
        ...gatherOptions, braveImpl: null,
        resolveImpl: async () => [{ address: '93.184.216.34' }],
        extractImpl: async () => { extracts += 1; throw new Error(oldAttempt.error); },
      });
    },
    buildImpl: async (dossier) => {
      builds += 1;
      assert.ok(dossier.pages.length);
      assert.equal(dossier.emptySource, null);
      assert.equal(dossierPagesVerified(dossier), true);
      const persisted = await storeImpl.getDossier(key);
      assert.ok(persisted.pages.some((row) => row.sha256 === dossier.pages[0].sha256), 'save evidence before writing text');
      return { payload: {}, structuredText: '{}', findings: { summary: field(summary), description: field(description) } };
    },
    judgeImpl: async (_dossier, claims) => claims.map(({ id }) => ({ id, supported: true })),
    extractReviewsImpl: async () => ({ reviews: [], keep: [] }),
  };
  return {
    run: async () => (await runThingEvidenceDossierStagingTargets([
      official ? target : { ...target, website: undefined },
    ], options)).results[0],
    saved: () => saved, queries,
    counts: () => ({ gathers, builds, extracts }),
  };
}

function emptySaved(extra = {}) {
  return {
    thing: target.title, pages: [], attempts: [oldAttempt], fields: {},
    emptySource: staleReason, captureCheckpoint: 'after_gather', ...extra,
  };
}

test('operator limit 1 retries a saved Tavily 432 once, saves Brave fallback pages, and builds supported text', async () => {
  const f = fixture(emptySaved());
  const result = await f.run();
  assert.equal(f.counts().gathers, 1);
  assert.equal(f.counts().extracts, 1);
  assert.equal(f.counts().builds, 1);
  assert.equal(result.failed, false);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pagesAdded, 1);
  assert.ok(f.queries.includes('site:harbor.example'));
  const saved = f.saved();
  assert.ok(saved.pages.some((row) => row.via === 'brave-snippet' && row.text.includes('daily fish dish')));
  assert.ok(saved.attempts.some((row) => row.startedAt === oldAttempt.startedAt));
  assert.ok(saved.attempts.some((row) => row.stage === 'extract_fallback' && row.status === 'ok'));
  assert.equal(saved.emptySource, null);
  assert.equal(dossierPresented(saved, target), true);
  await f.run();
  assert.equal(f.counts().gathers, 1, 'successful recovery reuses saved pages');
  assert.equal(f.counts().extracts, 1);
});

for (const status of [200, 429]) test(`empty operator recovery names fresh Brave failure at HTTP ${status} and stops retrying`, async () => {
  const f = fixture(emptySaved(), { hits: false, status });
  const result = await f.run();
  assert.equal(f.counts().gathers, 1);
  assert.equal(f.counts().builds, 0);
  assert.equal(result.failed, true);
  assert.equal(result.error, 'brave_extract_fallback_no_pages');
  assert.notEqual(result.error, staleReason);
  assert.equal(result.emptySource, f.saved().emptySource);
  assert.equal(result.pageCount, 0);
  assert.equal(f.queries.filter((query) => query === 'Harbor Bistro Boston').length, 1, 'one broader recovery search');
  const before = { ...f.counts(), searches: f.queries.length };
  const repeated = await f.run();
  assert.equal(repeated.failed, true);
  assert.equal(repeated.error, result.error);
  assert.deepEqual({ ...f.counts(), searches: f.queries.length }, before, 'exhausted recovery must not loop');
});

test('a historical no-match cannot override the fresh zero-hit recovery reason', async () => {
  const f = fixture(emptySaved({
    attempts: [oldAttempt, { kind: 'brave', step: 'match', status: 'no_match' }],
  }), { hits: false, official: false });
  const result = await f.run();
  assert.equal(f.counts().gathers, 1);
  assert.equal(result.error, 'brave_zero_hits');
});

test('a saved page rejected as another venue triggers bounded gather instead of returning zero pages', async () => {
  const wrong = page('https://other.example/', 'Other Restaurant serves dinner in its own dining room.');
  const initial = emptySaved({ pages: [wrong], attempts: [], emptySource: 'gather_no_pages' });
  assert.equal(normalizeDossierEvidence(initial, target).pages.length, 0, 'identity normalization explains the one-to-zero result');
  const f = fixture(initial);
  const result = await f.run();
  assert.equal(f.counts().gathers, 1);
  assert.equal(result.failed, false);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pagesAdded, 0, 'replacing an unusable page does not inflate page count growth');
  assert.ok(f.saved().pages.some((row) => row.sha256 === wrong.sha256), 'cumulative storage retains the original evidence');
  assert.equal(dossierPresented(normalizeDossierEvidence(f.saved(), target), target), true);
  await f.run();
  assert.equal(f.counts().gathers, 1, 'the replacement page remains usable on the next fill');
});

test('a usable saved page survives operator text rebuild without re-gathering', async () => {
  const valid = page(target.website, text);
  const f = fixture(emptySaved({ pages: [valid], attempts: [], emptySource: null }));
  const result = await f.run();
  assert.equal(result.failed, false);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pagesAdded, 0);
  assert.deepEqual(f.counts(), { gathers: 0, builds: 1, extracts: 0 });
  assert.ok(f.saved().pages.some((row) => row.sha256 === valid.sha256));
});

test('a rejected saved page with empty recovery returns a fresh failure and does not restart', async () => {
  const wrong = page('https://other.example/', 'Other Restaurant serves dinner in its own dining room.');
  const f = fixture(emptySaved({ pages: [wrong], attempts: [], emptySource: 'gather_no_pages' }), { hits: false });
  const result = await f.run();
  assert.equal(result.failed, true);
  assert.equal(result.error, 'brave_extract_fallback_no_pages');
  assert.equal(result.pageCount, 0);
  const searches = f.queries.length;
  await f.run();
  assert.equal(f.counts().gathers, 1);
  assert.equal(f.counts().builds, 0);
  assert.equal(f.queries.length, searches);
});

test('an older exhausted gather gets one attempt through the revised fallback', async () => {
  const f = fixture(emptySaved({ attempts: [oldAttempt, {
    kind: 'gather', step: 'operator_empty_gather_retry', status: 'failed',
  }] }));
  const result = await f.run();
  assert.equal(result.failed, false);
  assert.equal(f.counts().gathers, 1);
  assert.ok(f.saved().attempts.some((attempt) => attempt.gatherVersion === 3 && attempt.status === 'ok'));
  await f.run();
  assert.equal(f.counts().gathers, 1);
});
