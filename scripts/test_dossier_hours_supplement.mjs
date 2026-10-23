#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { dossierPageMentionsHours } from '../src/vacation/dossier-hours-evidence.mjs';
import {
  dossierHasHoursPageEvidence,
  gatherSupplementalHoursEvidence,
} from '../src/vacation/thing-evidence-dossier.mjs';
import { dossierGapRebuildFields } from '../src/vacation/thing-dossier-fields.mjs';
import { HOURS_NOT_FOUND } from '../src/vacation/dossier-hours-fields.mjs';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';

function page(url, text) {
  const body = text.trim();
  return {
    url,
    fetchedAt: '2026-10-22T12:00:00.000Z',
    text: body,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
}

assert.equal(dossierPageMentionsHours('Open Mon–Sat 11:30am–11pm.'), true);
assert.equal(dossierPageMentionsHours('Great vibes and friendly staff.'), false);
assert.equal(
  dossierHasHoursPageEvidence({ pages: [page('https://a.example', 'Hours: Tue–Sun 10am–9pm')] }),
  true,
);

const gapFields = dossierGapRebuildFields({
  fields: {
    hours: { value: HOURS_NOT_FOUND, claims: [], gap: true },
    summary: { value: 'x', claims: [{ text: 'x', pages: ['p1'], supported: true }] },
  },
}, { category: 'restaurant' });
assert.ok(gapFields.has('hours'));
assert.ok(gapFields.has('happyHourDetails'));

const searches = [];
const supplement = await gatherSupplementalHoursEvidence(
  { title: 'Village Vanguard', category: 'music', website: 'https://vanguard.example/' },
  { thing: 'Village Vanguard', pages: [page('https://review.example/v', 'Jazz fans love the room.')] },
  {
    env: {},
    searchImpl: async (query) => {
      searches.push(query);
      return {
        results: [{
          url: 'https://hours.example/vanguard',
          rawContent: 'Showtimes nightly at 8:30pm and 10:30pm. Box office opens at 7pm.',
        }],
      };
    },
    extractImpl: async () => [],
    fetchImpl: async () => ({ ok: false, status: 404 }),
    resolveImpl: async () => [{ address: '1.1.1.1' }],
  },
);
assert.ok(searches.length >= 1, 'supplemental search runs for missing hours pages');
assert.equal(supplement.pages.length, 1);
assert.equal(supplement.pages[0].url, 'https://hours.example/vanguard');
assert.ok(!searches.some((q) => q.includes('review.example')), 'does not re-fetch URLs already saved');

let builderCalls = 0;
const persisted = {
  thing: 'Village Vanguard',
  pages: [page('https://review.example/v', 'Jazz fans love the room.')],
  attempts: [],
  fields: {
    summary: {
      value: 'Legendary basement jazz club',
      claims: [{ text: 'legendary jazz club', pages: ['p1'], supported: true }],
      url: 'https://review.example/v',
    },
    hours: { value: HOURS_NOT_FOUND, claims: [], gap: true },
  },
};
persisted.fieldHashes = { summary: persisted.pages[0].sha256 };
persisted.fieldSources = { summary: 'https://review.example/v' };

const store = {
  rows: new Map([['trip:1:place:9', JSON.parse(JSON.stringify(persisted))]]),
  async getDossier(key) {
    const row = this.rows.get(key);
    return row ? JSON.parse(JSON.stringify(row)) : null;
  },
  async putDossier(key, dossier) {
    this.rows.set(key, JSON.parse(JSON.stringify(dossier)));
  },
};

const findings = {
  hours: {
    value: 'Sets nightly 8:30pm and 10:30pm; box office opens 7pm',
    claims: [{ text: 'sets nightly 8:30pm', pages: ['p2'], supported: true }],
  },
  happyHourFound: false,
};

await fetchXaiPlaceRatings(
  { id: 9, trip_id: 1, title: 'Village Vanguard', category: 'music' },
  {
    dossierKey: 'trip:1:place:9',
    storeImpl: store,
    env: { XAI_API_KEY: 'test' },
    gatherImpl: async () => ({ thing: 'Village Vanguard', pages: persisted.pages, attempts: [] }),
    buildImpl: async () => {
      builderCalls += 1;
      return { payload: {}, structuredText: '{}', findings };
    },
    judgeImpl: async (_dossier, items) => items.map((item) => ({ id: item.id, supported: true })),
    extractReviewsImpl: async () => ({ set: [], stats: {} }),
    searchImpl: async () => ({
      results: [{
        url: 'https://hours.example/vanguard',
        rawContent: 'Showtimes nightly at 8:30pm and 10:30pm. Box office opens at 7pm.',
      }],
    }),
    extractImpl: async () => [],
    fetchImpl: async () => ({ ok: false, status: 404 }),
    resolveImpl: async () => [{ address: '1.1.1.1' }],
    nowMs: Date.now(),
  },
);
assert.equal(builderCalls, 1, 'hours gap with new hours pages must re-run builder');
const saved = await store.getDossier('trip:1:place:9');
assert.match(String(saved.fields?.hours?.value || ''), /8:30pm/i);
assert.notEqual(saved.fields?.hours?.gap, true);

console.log('test_dossier_hours_supplement: ok');
