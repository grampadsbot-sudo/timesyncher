import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
const root = new URL('./fixtures/vk-search-census/results/', import.meta.url);
let positive = 0, rejected = 0;
for (const file of readdirSync(root).filter(name => name.endsWith('.json'))) {
  const result = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
  if (!result.rating?.ratingEvidence) continue;
  // Exercise the evidence fallback even when a separately supported primary exists.
  delete result.rating.primary;
  const expected = result.rating.ratingEvidence;
  const dossier = vkSearchResultToDossier(result);
  assert.equal(dossier.ratingEvidence?.average, expected.average, `valid average ${file}`);
  assert.equal(dossier.ratingEvidence?.count, expected.count, `valid count ${file}`);
  assert.equal(dossier.ratingEvidence?.scaleMax, expected.scale, `valid scale ${file}`);
  positive++;
  for (const mutation of [{average: 1.1}, {count: 999999}, {average: 1.1, count: 999999}, {scale: expected.scale === 5 ? 10 : 5}]) {
    const altered = structuredClone(result);
    Object.assign(altered.rating.ratingEvidence, mutation);
    assert.equal(vkSearchResultToDossier(altered).ratingEvidence, undefined, `unsupported tuple ${file} ${JSON.stringify(mutation)}`);
    rejected++;
  }
}
assert.ok(positive >= 21, 'saved numeric evidence positives were exercised');
const trip = JSON.parse(readFileSync(new URL('623.json', root), 'utf8'));
assert.equal(vkSearchResultToDossier(trip).rating, 4.2);
assert.equal(vkSearchResultToDossier(trip).reviewsAvailable, 121);
console.log(JSON.stringify({ok: true, positive, rejected, tripCom: '8.4/10 => 4.2/5, 121 reviews'}));
