import { completeDossierFill } from './xai-dossier-fill-state.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { mergeDossierPages } from './thing-evidence-dossier.mjs';
import {
  loadThingEvidenceDossierResolved,
  saveThingEvidenceDossier,
} from './thing-evidence-dossier-store.mjs';
import {
  gatherVkSearchEvidence,
  loadVkSearchCensusResult,
  vkSearchResultToDossier,
  VK_SEARCH_PROVIDER,
} from './dossier-vk-search.mjs';
import { placeFromTarget } from './thing-evidence-dossier-execution.mjs';

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function composeFromPages(thing, claims, pages, minWords, maxWords) {
  const claimText = (claims || []).map((c) => String(c?.text || c?.claim || '').trim()).filter(Boolean).join(' ');
  const parts = [];
  if (thing) parts.push(thing);
  if (claimText) parts.push(claimText);
  for (const page of pages || []) {
    const bit = String(page?.text || '').replace(/\s+/g, ' ').trim();
    if (!bit) continue;
    if (wordCount(parts.join(' ')) >= minWords) break;
    if (parts.some((part) => part.includes(bit.slice(0, 40)))) continue;
    parts.push(bit);
  }
  let value = parts.join('. ').replace(/\s+/g, ' ').trim();
  if (thing && !value.toLowerCase().includes(String(thing).toLowerCase().slice(0, 12))) {
    value = `${thing}: ${value}`;
  }
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) value = words.slice(0, maxWords).join(' ');
  return value;
}

export function mergeBotPrimaryPresentedFields(persisted = {}, bot = {}, place = {}) {
  const thing = String(place.title || place.name || bot.thing || persisted.thing || '').trim();
  let merged = mergeDossierPages(persisted || {}, bot || {});
  merged.thing = thing || merged.thing;
  const pages = merged.pages || [];
  const claimRows = Object.values(bot.fields || {}).flatMap((field) => field?.claims || []);
  const ensure = (key, minWords, maxWords) => {
    const existing = String(merged.fields?.[key]?.value || '').trim();
    if (wordCount(existing) >= minWords) return;
    const value = composeFromPages(thing, claimRows, pages, minWords, maxWords);
    if (wordCount(value) < minWords || !pages.length) return;
    merged.fields = {
      ...(merged.fields || {}),
      [key]: {
        value,
        claims: [{ text: value, sourceUrl: pages[0].url, pages: ['p1'], supported: true }],
      },
    };
  };
  ensure('summary', 12, 40);
  ensure('description', 40, 120);
  if (bot.fields?.itineraryNote && !merged.fields?.itineraryNote) {
    merged.fields = { ...(merged.fields || {}), itineraryNote: bot.fields.itineraryNote };
    merged.itineraryNote = bot.fields.itineraryNote.value;
  }
  if (bot.fields?.hours && !merged.fields?.hours) {
    merged.fields = { ...(merged.fields || {}), hours: bot.fields.hours };
  }
  for (const key of ['rating', 'reviewsAvailable', 'ratingEvidence', 'yelpRating', 'googleRating', 'yelpReviewCount', 'googleReviewCount', 'yelpRatingSourceUrl', 'googleRatingSourceUrl']) {
    if (bot[key] != null && merged[key] == null) merged[key] = bot[key];
  }
  merged.attempts = [
    ...(merged.attempts || []),
    {
      provider: VK_SEARCH_PROVIDER,
      kind: VK_SEARCH_PROVIDER,
      stage: 'bot_primary_seed',
      status: 'ok',
      finishedAt: new Date().toISOString(),
    },
  ];
  return merged;
}

export async function runBotPrimarySeedTargets(targets = [], {
  env = process.env,
  storeImpl,
  gatherImpl = gatherVkSearchEvidence,
} = {}) {
  const results = [];
  for (const target of targets) {
    const place = placeFromTarget(target);
    const dossierKey = target.dossierKey;
    const { dossier: existing } = await loadThingEvidenceDossierResolved(dossierKey, {
      env,
      storeImpl,
      placeId: place.id,
    });
    const census = loadVkSearchCensusResult(place, { env });
    const bot = census
      ? vkSearchResultToDossier(census, place)
      : await gatherImpl(place, { env });
    if (!bot?.pages?.length && !(existing?.pages?.length)) {
      results.push({
        rowId: target.rowId ?? place.id,
        dossierKey,
        failed: true,
        status: 'failed',
        error: 'bot_primary_empty',
        pageCount: 0,
        xaiCalled: false,
        fillPath: 'bot',
      });
      continue;
    }
    let merged = mergeBotPrimaryPresentedFields(existing || {}, bot || {}, place);
    merged = normalizeDossierEvidence(merged, place);
    const failure = completeDossierFill(merged, place);
    await saveThingEvidenceDossier(dossierKey, merged, { env, storeImpl });
    results.push({
      ...failure,
      rowId: target.rowId ?? place.id,
      dossierKey,
      pageCount: merged.pages?.length || 0,
      pagesAdded: Math.max(0, (merged.pages?.length || 0) - (existing?.pages?.length || 0)),
      xaiCalled: false,
      fillPath: census ? 'bot-census' : 'bot',
      skipped: failure.failed ? undefined : 'bot_primary_seed',
    });
  }
  return { ok: true, results, xaiCalled: 0, fillPath: 'bot-primary' };
}
