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
import { BANNED_VALUE_RE } from './search-place-output.mjs';

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function pageTextSentences(pageText) {
  return String(pageText || '').replace(/\s+/g, ' ').match(/[^.!?\n]{1,600}(?:[.!?]+|$)/g) || [];
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function substantiveDescriptionSentences(value, thing) {
  return pageTextSentences(value).filter((sentence) => {
    const bit = decodeHtmlEntities(sentence).trim();
    if (!bit) return false;
    if (thing && !descriptionNamesThing(bit, thing)) return false;
    return !isFillerSummaryText(bit, thing);
  });
}

function descriptionLacksSubstance(value, thing) {
  const words = wordCount(value);
  const sentences = substantiveDescriptionSentences(value, thing);
  if (words >= 40 && sentences.length >= 3) return false;
  if (words >= 40 && sentences.length >= 2 && !isFillerSummaryText(value, thing)) return false;
  return sentences.length < 3 || words < 40;
}

function descriptionTopUpComplete(value, thing) {
  const sentences = substantiveDescriptionSentences(value, thing);
  return wordCount(value) >= 40 && sentences.length >= 3;
}

export function isSkippedTopUpSentence(sentence) {
  const s = String(sentence || '').trim();
  const lower = s.toLowerCase();
  if (!s || s.length > 480) return true;
  if (BANNED_VALUE_RE.test(s)) return true;
  if (/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/.test(s)) return true;
  if (/\bfax\s*:/i.test(s)) return true;
  if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return true;
  if (/^online menus, items, descriptions and prices/i.test(s)) return true;
  if (/^menus for .+ - singleplatform/i.test(lower)) return true;
  if (/^.{0,80}\s[-|]\s*menu\b/i.test(s)) return true;
  if (/\border (?:online|now|your .{0,20}) from\b/i.test(lower)) return true;
  if (/\bshop .{0,40}today!?$/i.test(s)) return true;
  if (/today!$/i.test(s)) return true;
  if (/call us:|email us:|directions & parking|main store hours/i.test(lower)) return true;
  if (/^(?:nav|home|cart|sign in)\b/i.test(s)) return true;
  if ((s.match(/,/g) || []).length >= 4) return true;
  return false;
}

function pickSavedPageSentence(page, index, pages, thing, usedBodies) {
  if (!savedDatedPage(page) || page.summaryExcerptAllowed === false) return null;
  for (const raw of pageTextSentences(page.text)) {
    const bit = decodeHtmlEntities(raw).trim();
    if (!bit || isSkippedTopUpSentence(bit)) continue;
    if (thing && !descriptionNamesThing(bit, thing)) continue;
    if (isFillerSummaryText(bit, thing)) continue;
    if (usedBodies.has(bit) || [...usedBodies].some((part) => part.includes(bit.slice(0, 40)) || bit.includes(part.slice(0, 40)))) continue;
    const cited = recitClaim({ text: bit, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true }, pages);
    if (cited.supported !== true) continue;
    return cited;
  }
  return null;
}

function topUpDescriptionFromSavedPages(composed, pages, thing) {
  let value = String(composed.value || '').trim();
  const claims = [...(composed.claims || [])];
  if (!value || isFillerSummaryText(value, thing) || !descriptionLacksSubstance(value, thing)) {
    return composed;
  }
  const parts = claims.map((claim) => String(claim.text || claim.claim || '').trim()).filter(Boolean);
  const usedBodies = new Set(parts);
  for (const [index, page] of (pages || []).entries()) {
    if (descriptionTopUpComplete(parts.join(' '), thing)) break;
    const cited = pickSavedPageSentence(page, index, pages, thing, usedBodies);
    if (!cited) continue;
    const body = String(cited.text || '').trim();
    usedBodies.add(body);
    parts.push(body);
    claims.push(cited);
  }
  value = parts.join(' ');
  if (!value || isFillerSummaryText(value, thing)) return composed;
  if (thing && !descriptionNamesThing(value, thing)) value = `${thing}: ${value}`;
  return { value, claims, bodyWords: wordCount(value) };
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

function composeFromClaims(claims, pages, thing) {
  const parts = [];
  const citations = [];
  const append = (claim) => {
    const body = String(claim.text || claim.claim || '').trim();
    if (!body || parts.includes(body)) return;
    if (recitClaim({ ...claim, text: body }, pages).supported !== true) return;
    parts.push(body);
    citations.push({ ...claim, text: body });
  };
  for (const claim of claims || []) {
    const cited = recitClaim(claim, pages);
    if (cited.supported === true) append(cited);
  }
  if (!citations.length) {
    for (const [index, page] of (pages || []).entries()) {
      if (!savedDatedPage(page) || page.summaryExcerptAllowed === false) continue;
      for (const sentence of pageTextSentences(page.text)) {
        const bit = sentence.trim();
        if (!bit) continue;
        if (thing && !descriptionNamesThing(bit, thing)) continue;
        if (isFillerSummaryText(bit, thing)) continue;
        if (parts.some((part) => part.includes(bit.slice(0, 40)))) continue;
        const before = parts.length;
        append({ text: bit, sourceUrl: page.url, pages: [`p${index + 1}`], supported: true });
        if (parts.length > before) break;
      }
    }
  }
  const body = parts.join(' ');
  if (!body || !citations.length) return { value: '', claims: [], bodyWords: 0 };
  let value = body;
  if (isFillerSummaryText(value, thing)) return { value: '', claims: [], bodyWords: 0 };
  if (thing && !descriptionNamesThing(value, thing)) value = `${thing}: ${value}`;
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
  const summaryClaimRows = bot.fields?.summary?.claims?.length ? bot.fields.summary.claims : claimRows;
  const ensure = (key, claimSource = claimRows) => {
    let existing = String(merged.fields?.[key]?.value || '').trim();
    if (thing && existing.startsWith(`${thing}: `)) existing = existing.slice(thing.length + 2);
    if (existing && !claimSource.length) {
      if (thing && !descriptionNamesThing(existing, thing)) merged.fields[key] = { ...merged.fields[key], value: `${thing}: ${existing}` };
      return;
    }
    const priorField = merged.fields?.[key];
    if (priorField?.claims?.length && !priorField.claims.some((claim) => claim.supported === true)
      && String(priorField.value || '').trim()) return;
    const { bodyWords, ...composed } = composeFromClaims(claimSource, pages, thing);
    const compositionFailed = !bodyWords || !composed.claims.length || !String(composed.value || '').trim()
      || isFillerSummaryText(composed.value, thing);
    if (compositionFailed) {
      if (priorField && String(priorField.value || '').trim()) {
        let keep = String(priorField.value || '').trim();
        if (thing && !descriptionNamesThing(keep, thing)) keep = `${thing}: ${keep}`;
        merged.fields[key] = { ...priorField, value: keep };
      }
      return;
    }
    if (key === 'summary') {
      const descriptionValue = String(merged.fields?.description?.value || '').trim();
      if (descriptionValue && composed.value === descriptionValue && descriptionValue.length > 320) {
        if (priorField && String(priorField.value || '').trim()) {
          let keep = String(priorField.value || '').trim();
          if (thing && !descriptionNamesThing(keep, thing)) keep = `${thing}: ${keep}`;
          merged.fields[key] = { ...priorField, value: keep };
        }
        return;
      }
    }
    let fieldComposed = composed;
    if (key === 'description') {
      fieldComposed = topUpDescriptionFromSavedPages(composed, pages, thing);
    }
    merged.fields = {
      ...(merged.fields || {}),
      [key]: fieldComposed,
    };
  };
  ensure('description');
  ensure('summary', summaryClaimRows);
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
