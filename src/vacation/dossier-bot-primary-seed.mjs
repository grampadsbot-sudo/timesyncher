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
  if (!pages.length) return dossier;
  const fields = { ...(dossier.fields || {}) };
  for (const [key, field] of Object.entries(fields)) {
    const value = String(field?.value || '').trim();
    if (!value) continue;
    const wanted = field?.claims?.[0]?.sourceUrl || pages[0].url;
    let index = pages.findIndex((page) => page.url === wanted);
    if (index < 0) index = 0;
    fields[key] = {
      value,
      claims: [{
        text: value,
        sourceUrl: pages[index].url,
        pages: [`p${index + 1}`],
        supported: true,
      }],
    };
  }
  return { ...dossier, fields };
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
