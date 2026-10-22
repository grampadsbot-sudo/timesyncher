import assert from 'node:assert/strict';
import { fetchXaiPlaceRatings } from '../src/vacation/xai-grok-place-ratings.mjs';
const text = 'Testplace is a small diner on Main Street. It serves pancakes all day long to happy guests.';
const pages = [{ url: 'https://a.test/', fetchedAt: '2026-10-22T00:00:00Z', text, sha256: 'x' }];
const good = { description: { value: `Testplace ${'word '.repeat(45)}`.trim(), quote: 'It serves pancakes all day long', url: 'https://a.test/' } };
const bad = { description: { value: 'Testplace is fine.', quote: 'It serves waffles', url: 'https://a.test/' } };
const memStore = () => { const m = new Map(); return { getDossier: async (k) => m.get(k) || null, saveDossier: async (k, v) => { m.set(k, v); }, putDossier: async (k, v) => { m.set(k, v); } }; };
async function run(sequence) {
  const seen = [];
  const out = await fetchXaiPlaceRatings({ name: 'Testplace' }, {
    env: {}, storeImpl: memStore(), dossierKey: 'test:writer',
    gatherImpl: async () => ({ thing: 'Testplace', pages, attempts: [] }),
    buildImpl: async (_d, { feedback }) => { seen.push(feedback); const f = sequence[Math.min(seen.length - 1, sequence.length - 1)]; return { payload: {}, structuredText: JSON.stringify(f), findings: f }; },
  });
  return { out, seen };
}
let r = await run([{}, bad, good]);
assert.equal(r.seen.length, 3);
assert.match(r.seen[1][0], /empty/);
assert.ok(r.seen[2].some((row) => row.includes('not verbatim')));
assert.ok(r.seen[2].some((row) => row.includes('40-120')));
assert.deepEqual(r.out.writerAttempts.at(-1).problems, []);
r = await run([bad]);
assert.equal(r.seen.length, 3, 'at most 2 retries');
assert.equal(r.out.writerAttempts.length, 3); assert.ok(r.out.writerAttempts.at(-1).problems.length);
r = await run([good]);
assert.equal(r.seen.length, 1);
console.log('test_dossier_writer_retry: ok');
