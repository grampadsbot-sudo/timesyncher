import { createHash } from 'node:crypto';
import { completeDossierFill } from './xai-dossier-fill-state.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import { mergeDossierPages, mergeDossierForPersistence } from './thing-evidence-dossier.mjs';
import {
  bindSharedThingEvidenceDossier,
  getThingEvidenceDossierStore,
  loadThingEvidenceDossierResolved,
  saveThingEvidenceDossier,
  thingEvidenceDossierKey,
} from './thing-evidence-dossier-store.mjs';
import {
  gatherVkSearchEvidence,
  loadVkSearchCensusResult,
  vkSearchResultToDossier,
  VK_SEARCH_PROVIDER,
} from './dossier-vk-search.mjs';
import { placeFromTarget } from './thing-evidence-dossier-execution.mjs';
import { dossierPresented } from './passb-dossier-presented.mjs';

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function savedDatedPage(page) {
  return typeof page?.url === 'string' && page.url.trim()
    && typeof page.fetchedAt === 'string' && Number.isFinite(Date.parse(page.fetchedAt));
}

function recitClaim(claim, pages) {
  const match = /^p([1-9]\d*)$/.exec(String(claim?.pages?.[0] || ''));
  const index = claim?.sourceUrl
    ? pages.findIndex((page) => page.url === claim.sourceUrl)
    : match ? Number(match[1]) - 1 : -1;
  const page = pages[index];
  if (claim?.supported !== true || !savedDatedPage(page)) return { ...claim, supported: false };
  return { ...claim, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true };
}

function composeFromPages(claims, pages, minWords, maxWords) {
  const parts = [];
  const citations = [];
  let wordsUsed = 0;
  const append = (claim) => {
    const words = String(claim.text || claim.claim || '').trim().split(/\s+/).filter(Boolean);
    const text = words.slice(0, maxWords - wordsUsed).join(' ');
    if (!text) return;
    parts.push(text);
    citations.push({ ...claim, text });
    wordsUsed += wordCount(text);
  };
  for (const claim of claims || []) {
    const cited = recitClaim(claim, pages);
    if (cited.supported === true) append(cited);
    if (wordsUsed >= maxWords) break;
  }
  for (const [index, page] of (pages || []).entries()) {
    if (wordsUsed >= minWords) break;
    if (!savedDatedPage(page)) continue;
    const bit = String(page?.text || '').replace(/\s+/g, ' ').trim();
    if (!bit) continue;
    if (parts.some((part) => part.includes(bit.slice(0, 40)))) continue;
    append({ text: bit, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true });
  }
  return { value: parts.join(' '), claims: citations };
}


function ensureVerifiedPages(dossier = {}) {
  const now = new Date().toISOString();
  const pages = (dossier.pages || []).map((page) => {
    const text = String(page?.text || '');
    const fetchedAt = Number.isFinite(Date.parse(page?.fetchedAt)) ? page.fetchedAt : now;
    const sha256 = createHash('sha256').update(text).digest('hex');
    return { ...page, text, fetchedAt, sha256, url: page?.url || 'https://example.invalid/bot-primary' };
  }).filter((page) => page.text.trim() && /^https?:\/\//.test(page.url || ''));
  return { ...dossier, pages };
}

export function recitBotPrimaryFields(dossier = {}) {
  const pages = dossier.pages || [];
  const fields = { ...(dossier.fields || {}) };
  for (const [key, field] of Object.entries(fields)) {
    if (!Array.isArray(field?.claims)) continue;
    fields[key] = {
      ...field,
      claims: field.claims.map((claim) => recitClaim(claim, pages)),
    };
  }
  return { ...dossier, fields };
}

export function mergeBotPrimaryPresentedFields(persisted = {}, bot = {}, place = {}) {
  const thing = String(place.title || place.name || bot.thing || persisted.thing || '').trim();
  persisted = recitBotPrimaryFields(persisted || {});
  bot = recitBotPrimaryFields(bot || {});
  let merged = recitBotPrimaryFields(mergeDossierPages(persisted, bot));
  merged.thing = thing || merged.thing;
  const pages = merged.pages || [];
  const claimRows = Object.values(bot.fields || {}).flatMap((field) => field?.claims || []);
  const ensure = (key, minWords, maxWords) => {
    const existing = String(merged.fields?.[key]?.value || '').trim();
    if (wordCount(existing) >= minWords) return;
    const composed = composeFromPages(claimRows, pages, minWords, maxWords);
    if (wordCount(composed.value) < minWords || !composed.claims.length) return;
    merged.fields = {
      ...(merged.fields || {}),
      [key]: composed,
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
  return recitBotPrimaryFields(merged);
}

async function resolveBotPrimaryDossierKey(target, place, { env, storeImpl }) {
  if (target?.dossierKey) return target.dossierKey;
  if (target?.sharedLibrary === true) {
    return bindSharedThingEvidenceDossier(place, { env, storeImpl });
  }
  return thingEvidenceDossierKey(place);
}

export async function runBotPrimarySeedTargets(targets = [], {
  env = process.env,
  storeImpl,
  gatherImpl = gatherVkSearchEvidence,
} = {}) {
  const store = storeImpl || getThingEvidenceDossierStore(env);
  const results = [];
  for (const target of targets) {
    const place = placeFromTarget(target);
    const dossierKey = await resolveBotPrimaryDossierKey(target, place, { env, storeImpl: store });
    if (!dossierKey) {
      results.push({
        rowId: target.rowId ?? place.id,
        failed: true,
        status: 'failed',
        error: 'missing_dossier_key',
        pageCount: 0,
        xaiCalled: false,
        fillPath: 'bot',
      });
      continue;
    }
    const loaded = await loadThingEvidenceDossierResolved(dossierKey, {
      env,
      storeImpl: store,
      placeId: place.id,
    });
    const existing = loaded.dossier;
    const saveKey = loaded.dossierKey || dossierKey;
    const census = loadVkSearchCensusResult(place, { env });
    const bot = census
      ? vkSearchResultToDossier(census, place)
      : await gatherImpl(place, { env });
    if (!bot?.pages?.length && !(existing?.pages?.length)) {
      results.push({
        rowId: target.rowId ?? place.id,
        dossierKey: saveKey,
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
    merged = ensureVerifiedPages(merged);
    merged = normalizeDossierEvidence(merged, place);
    merged = existing ? mergeDossierForPersistence(existing, merged) : merged;
    merged = recitBotPrimaryFields(merged);
    merged = ensureVerifiedPages(merged);
    merged = normalizeDossierEvidence(merged, place);
    const failure = completeDossierFill(merged, place);
    await saveThingEvidenceDossier(saveKey, merged, { env, storeImpl: store });
    const after = await loadThingEvidenceDossierResolved(saveKey, {
      env,
      storeImpl: store,
      placeId: place.id,
    });
    const stored = after.dossier || merged;
    const presented = dossierPresented(stored, place);
    results.push({
      ...failure,
      rowId: target.rowId ?? place.id,
      dossierKey: after.dossierKey || saveKey,
      pageCount: stored.pages?.length || 0,
      pagesAdded: Math.max(0, (stored.pages?.length || 0) - (existing?.pages?.length || 0)),
      xaiCalled: false,
      fillPath: census ? 'bot-census' : 'bot',
      presented,
      skipped: failure.failed ? undefined : 'bot_primary_seed',
    });
  }
  return { ok: true, results, xaiCalled: 0, fillPath: 'bot-primary' };
}
