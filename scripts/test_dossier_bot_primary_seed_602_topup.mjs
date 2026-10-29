import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isSkippedTopUpSentence, mergeBotPrimaryPresentedFields } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { loadVkSearchCensusResult, vkSearchResultToDossier } from '../src/vacation/dossier-vk-search.mjs';
import { computeDossierFieldCounts } from '../src/vacation/thing-evidence-dossier-field-counts.mjs';
import { descriptionNamesThing } from '../src/vacation/thing-dossier-fields.mjs';
import { claimTextSupportedByPage } from '../src/vacation/dossier-claim-support.mjs';
import { rewriteDossierCitations } from '../src/vacation/dossier-page-integrity.mjs';

const place = { id: 602, title: "Zabar's", name: "Zabar's", category: 'store' };
const env = { VK_SEARCH_CENSUS_DIR: 'scripts/fixtures/vk-search-census/results' };

assert.equal(isSkippedTopUpSentence('Foo Deli - Menu - soups, salads, and sandwiches'), true);
assert.equal(isSkippedTopUpSentence('Shop artisan gifts today!'), true);
assert.equal(isSkippedTopUpSentence('Zabar\'s is a landmark deli on the Upper West Side.'), false);

function ensureVerifiedPages(dossier = {}) {
  const pages = [];
  const remap = new Map();
  for (const [index, page] of (dossier.pages || []).entries()) {
    try {
      const url = new URL(page?.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    } catch { continue; }
    const text = String(page?.text || '');
    if (!text.trim()) continue;
    remap.set(`p${index + 1}`, `p${pages.length + 1}`);
    pages.push({ ...page, text, sha256: createHash('sha256').update(text).digest('hex') });
  }
  return rewriteDossierCitations({ ...dossier, pages }, remap);
}

function pageTextSentences(pageText) {
  return String(pageText || '').replace(/\s+/g, ' ').match(/[^.!?\n]{1,600}(?:[.!?]+|$)/g) || [];
}

const fixture = JSON.parse(readFileSync('scripts/fixtures/live-shared-gate-b-fill-regression.json', 'utf8'));
const persisted = fixture.dossiers['602'];
const bot = vkSearchResultToDossier(loadVkSearchCensusResult(place, { env }), place);
const merged = mergeBotPrimaryPresentedFields(ensureVerifiedPages(persisted), ensureVerifiedPages(bot), place);
merged.thing = place.title;

const field = merged.fields?.description;
assert.ok(field?.value, 'description must be composed');
const counts = computeDossierFieldCounts(merged, place);
assert.equal(counts.description?.status, 'ok', 'description must meet presented bar (>=40 words)');

const value = String(field.value);
assert.ok(!value.includes('<'), 'description must not contain HTML tags');
assert.ok(!value.includes('&#x27;') && !value.includes('&amp;'), 'description must not contain raw HTML entities');
assert.ok(!/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/.test(value), 'description must not include phone lines');
assert.ok(!/\bfax\s*:/i.test(value), 'description must not include fax lines');
assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(value), 'description must not include email lines');
assert.ok(!/replacement window screens|spline tool/i.test(value), 'description must not include off-topic window-screen text');

const pages = merged.pages || [];
for (const sentence of pageTextSentences(value)) {
  const bit = sentence.trim();
  if (!bit) continue;
  const named = descriptionNamesThing(bit, place.title);
  const supported = pages.some((page) => claimTextSupportedByPage(bit, page.text));
  assert.ok(named || supported, `sentence must name Zabar's or be page-supported: ${bit.slice(0, 80)}`);
}

console.log(JSON.stringify({
  ok: true,
  checked: 'bot-primary-seed-602-topup',
  descriptionWords: value.split(/\s+/).length,
  description: value,
}));
