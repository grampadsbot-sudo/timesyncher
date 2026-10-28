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
import { descriptionNamesThing } from './thing-dossier-fields.mjs';
import { claimTextSupportedByPage, claimTextContradictsPage, claimTextWasRejected, claimTextVerdictEligible, isFillerSummaryText } from './dossier-claim-support.mjs';
import { rewriteDossierCitations } from './dossier-page-integrity.mjs';

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function summaryEssenceFromBody(body = '') {
  const text = String(body || '').trim();
  if (!text) return '';
  const sentence = text.match(/[^.!?]+[.!?]+/);
  return (sentence ? sentence[0] : text).replace(/\s+/g, ' ').trim();
}

function savedDatedPage(page) {
  try {
    const url = new URL(page?.url);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && typeof page.fetchedAt === 'string' && Number.isFinite(Date.parse(page.fetchedAt));
  } catch { return false; }
}

function recitClaim(claim, pages) {
  const match = /^p([1-9]\d*)$/.exec(String(claim?.pages?.[0] || ''));
  const citedIndex = match ? Number(match[1]) - 1 : -1;
  const index = claim?.sourceUrl
    ? pages[citedIndex]?.url === claim.sourceUrl ? citedIndex : pages.findIndex((page) => page.url === claim.sourceUrl)
    : citedIndex;
  const page = pages[index];
  if (claim?.supported !== true || !savedDatedPage(page) || page.claimSupportOk === false
    || !claimTextVerdictEligible(claim.text || claim.claim, page.inputClaimVerdicts)
    || claimTextWasRejected(claim.text || claim.claim, page.rejectedClaimTexts)
    || !claimTextSupportedByPage(claim.text || claim.claim, page.text)) return {
    ...claim, supported: false,
    ...(claim?.supported === true && savedDatedPage(page) ? { verificationDowngraded: true } : {}),
  };
  return { ...claim, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true };
}

function composeFromPages(claims, pages, thing, { includePageExcerpts = true } = {}) {
  const parts = [];
  const citations = [];
  const append = (claim) => {
    const body = String(claim.text || claim.claim || '').trim();
    if (parts.includes(body)) return;
    if (!body || recitClaim({ ...claim, text: body }, pages).supported !== true) return;
    parts.push(body);
    citations.push({ ...claim, text: body });
  };
  for (const claim of claims || []) {
    const cited = recitClaim(claim, pages);
    if (cited.supported === true) append(cited);
  }
  if (includePageExcerpts) {
    for (const [index, page] of (pages || []).entries()) {
      if (!savedDatedPage(page) || page.summaryExcerptAllowed === false) continue;
      const bit = String(page?.text || '').replace(/\s+/g, ' ').trim();
      if (!bit) continue;
      if (parts.some((part) => part.includes(bit.slice(0, 40)))) continue;
      append({ text: bit, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true });
    }
  }
  const body = parts.join(' ');
  const value = thing && body && !descriptionNamesThing(body, thing) ? `${thing}: ${body}` : body;
  return { value, claims: citations, bodyWords: wordCount(body) };
}


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
    const sha256 = createHash('sha256').update(text).digest('hex');
    remap.set(`p${index + 1}`, `p${pages.length + 1}`);
    pages.push({ ...page, text, sha256 });
  }
  return rewriteDossierCitations({ ...dossier, pages }, remap);
}

export function recitBotPrimaryFields(dossier = {}) {
  const inputClaims = Object.values(dossier.fields || {}).flatMap((field) => Array.isArray(field?.claims) ? field.claims : []);
  const rejectedClaims = inputClaims.filter((claim) => claim?.supported === false && claim.verificationDowngraded !== true);
  const rejected = rejectedClaims.map((claim) => claim?.text || claim?.claim).filter(Boolean);
  const pages = (dossier.pages || []).map((page) => ({
    ...page,
    rejectedClaimTexts: [...new Set([...(page.rejectedClaimTexts || []), ...rejected])],
  }));
  const fields = { ...(dossier.fields || {}) };
  for (const [key, field] of Object.entries(fields)) {
    if (!field || typeof field !== 'object') continue;
    const narrative = ['summary', 'description'].includes(key);
    const claims = (Array.isArray(field.claims) ? field.claims : []).map((claim) => recitClaim(claim, pages));
    const supported = claims.filter((claim) => claim.supported === true);
    let value = field.value;
    const contradictsValue = supported.some((claim) => {
      const page = pages[Number(claim.pages[0].slice(1)) - 1];
      return claimTextContradictsPage(value, page.text);
    });
    if (!supported.length) value = '';
    else if (supported.length !== claims.length || contradictsValue) {
      const body = supported.map((claim) => claim.text || claim.claim).join(' ');
      value = body.trim() ? body : '';
      if (value && ['summary', 'description'].includes(key) && dossier.thing
        && !descriptionNamesThing(value, dossier.thing)) value = `${dossier.thing}: ${value}`;
    }
    if (narrative && isFillerSummaryText(value, dossier.thing)) value = '';
    fields[key] = {
      ...field,
      value,
      ...(Array.isArray(field.claims) ? { claims: supported.length ? supported : claims } : {}),
    };
  }
  const next = { ...dossier, fields, pages: pages.map((page) => ({
    ...page,
    rejectedClaimTexts: [...new Set([...page.rejectedClaimTexts, ...rejected])],
    ...(rejectedClaims.some((claim) => claim?.sourceUrl === page.url
      || !claim?.sourceUrl && (claim?.pages || []).some((id) => pages[Number(String(id).slice(1)) - 1]?.url === page.url))
      ? { summaryExcerptAllowed: false } : {}),
  })) };
  if (fields.itineraryNote && !fields.itineraryNote.value) next.itineraryNote = '';
  return next;
}

export function mergeBotPrimaryPresentedFields(persisted = {}, bot = {}, place = {}) {
  const thing = String(place.title || place.name || bot.thing || persisted.thing || '').trim();
  persisted = recitBotPrimaryFields(persisted || {});
  bot = recitBotPrimaryFields(bot || {});
  let merged = recitBotPrimaryFields({
    ...mergeDossierPages(persisted, bot),
    fields: { ...(persisted.fields || {}), ...(bot.fields || {}) },
  });
  merged.thing = thing || merged.thing;
  const pages = merged.pages || [];
  const claimRows = Object.values(bot.fields || {}).flatMap((field) => field?.claims || []);
  const ensure = (key, { includePageExcerpts = true, fromDescription = false } = {}) => {
    let existing = String(merged.fields?.[key]?.value || '').trim();
    if (thing && existing.startsWith(`${thing}: `)) existing = existing.slice(thing.length + 2);
    if (existing) {
      if (thing && !descriptionNamesThing(existing, thing)) merged.fields[key] = { ...merged.fields[key], value: `${thing}: ${existing}` };
      return;
    }
    if (merged.fields?.[key]) merged.fields[key] = { ...merged.fields[key], value: '' };
    if (fromDescription) {
      const desc = String(merged.fields?.description?.value || '').trim();
      if (!desc) return;
      let essence = summaryEssenceFromBody(thing && desc.startsWith(`${thing}: `) ? desc.slice(thing.length + 2) : desc);
      if (!essence || isFillerSummaryText(essence, thing)) return;
      if (thing && !descriptionNamesThing(essence, thing)) essence = `${thing}: ${essence}`;
      const essenceBody = thing && essence.startsWith(`${thing}: `) ? essence.slice(thing.length + 2) : essence;
      const normalizedEssence = essenceBody.replace(/[.!?]+$/, '').trim();
      const claims = (merged.fields.description?.claims || []).filter((claim) => {
        const bit = String(claim.text || claim.claim || '').trim();
        return bit && (bit.includes(normalizedEssence) || normalizedEssence.includes(bit));
      });
      merged.fields = { ...(merged.fields || {}), [key]: { value: essence, claims: claims.length ? claims : [merged.fields.description.claims[0]] } };
      return;
    }
    const composed = composeFromPages(claimRows, pages, thing, { includePageExcerpts });
    if (!composed.claims.length || !String(composed.value || '').trim() || isFillerSummaryText(composed.value, thing)) return;
    merged.fields = {
      ...(merged.fields || {}),
      [key]: composed,
    };
  };
  ensure('description');
  ensure('summary', { fromDescription: true });
  if (!String(merged.fields?.summary?.value || '').trim()) ensure('summary', { includePageExcerpts: false });
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
    let merged = mergeBotPrimaryPresentedFields(ensureVerifiedPages(existing || {}), ensureVerifiedPages(bot || {}), place);
    merged = ensureVerifiedPages(merged);
    merged = normalizeDossierEvidence(merged, place);
    merged = recitBotPrimaryFields(merged);
    merged = existing ? mergeDossierForPersistence(existing, merged) : merged;
    merged = recitBotPrimaryFields(merged);
    merged = ensureVerifiedPages(merged);
    merged = normalizeDossierEvidence(merged, place);
    merged = recitBotPrimaryFields(merged);
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
