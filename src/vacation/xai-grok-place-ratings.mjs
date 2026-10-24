import {
  postXaiPlaceRatingsResponses,
  xaiGrokPlaceSearchModelId,
} from '../../scripts/vacation-app-reply-rules.mjs';
import {
  changedDossierPageUrls,
  DEFAULT_DOSSIER_MAX_AGE_MS,
  gatherThingEvidence,
  mergeDossierPages,
  topUpDossierFields,
} from './thing-evidence-dossier.mjs';
import { normalizeDossierEvidence } from './dossier-evidence-hydrate.mjs';
import {
  dossierReviewsNeedRebuild,
  dossierReviewsPassValidityGate,
  dossierReviewsShouldRunWriter,
  preservePersistedDossierReviewsWhenFresh,
  rebuildDossierReviewsFromSavedEvidence,
  stampReviewsEvidencePageHash,
  stripDossierReviews,
} from './dossier-reviews-rebuild.mjs';
import { placeSupportsDossierReviews } from './dossier-brave-queries.mjs';
import {
  braveTopUpFieldsPending,
  computeDossierFieldCounts,
  deriveMissingFieldsFromShortcomings,
} from './thing-evidence-dossier-field-counts.mjs';
import {
  loadThingEvidenceDossierResolved,
  saveThingEvidenceDossier,
  thingEvidenceDossierKey,
} from './thing-evidence-dossier-store.mjs';
import {
  applyDossierFields,
  dossierRebuildFields,
  mergeSelectiveDossierFindings,
  claimCitesKnownPages,
  dossierPageById,
  dossierPageId,
  ensureBraveSnippetCitationPages,
  prepareDossierFindings,
  fitDescriptionWords,
  resolveClaimCitationPages,
} from './thing-dossier-fields.mjs';
import {
  beginDossierXaiUsageRun,
  commitDossierXaiUsageRun,
  dossierForModel,
  dossierForReviewWriter,
  logXaiUsage,
  promptChars,
} from './dossier-cost.mjs';
import { dedupeReviews, extractionPrompt, extractReviewsByCode, finalizeReviewSet } from './dossier-review-extract.mjs';
import {
  postDossierXai,
  xaiHttpErrorResumable,
} from './xai-dossier-http.mjs';
import { collectDossierClaims, dossierJudgePrompt } from './xai-dossier-judge-prompt.mjs';
import { dossierPersistedFillIsNoOp, saveResumablePartial } from './xai-dossier-fill-state.mjs';

export { collectDossierClaims, dossierJudgePrompt } from './xai-dossier-judge-prompt.mjs';
export { dossierPersistedFillIsNoOp } from './xai-dossier-fill-state.mjs';

export {
  parseXaiStructuredPayload,
  applyXaiPlaceRatingsToRecord,
  writeRepresentativeReviews,
  formatOtherRatingsLine,
  xaiThemesReviewPath,
  reviewThemesDistinctCount,
} from './xai-grok-place-ratings-helpers.mjs';

function outputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return (payload.output || []).flatMap((item) => item.content || [])
    .filter((block) => ['output_text', 'text'].includes(block.type)).map((block) => block.text || '').join('');
}

export function dossierWithPageIds(dossier = {}) {
  return { ...dossier, pages: (dossier.pages || []).map((page, index) => ({ id: dossierPageId(index), ...page })) };
}

const NON_REVIEW_REBUILD_FIELDS = new Set([
  'summary', 'description', 'price', 'hours', 'happyHourDetails', 'rating', 'knownFor', 'itineraryNote',
]);

export function dossierBuilderReviewsOnly(rebuildFields = new Set()) {
  const fields = rebuildFields instanceof Set ? rebuildFields : new Set(rebuildFields);
  return fields.has('reviews') && ![...NON_REVIEW_REBUILD_FIELDS].some((key) => fields.has(key));
}

export function dossierBuilderPrompt(dossier, { includeReviews = true, reviewsOnly = false } = {}) {
  const modelInput = reviewsOnly && includeReviews
    ? dossierForReviewWriter(dossier)
    : dossierForModel(dossier, includeReviews
      ? { perPage: 1200, total: reviewsOnly ? 10000 : 18000, want: 'both', reviewCap: 60, reviewWords: 55 }
      : { perPage: 1200, total: 16000, want: 'facts', reviewCap: 0, reviewWords: 40 });
  if (!includeReviews) {
    delete modelInput.reviewSet;
    delete modelInput.reviewsRead;
    delete modelInput.reviewExcerpts;
  }
  const lines = [
    'Build fields for this place using ONLY the saved dossier pages below (each has an id p1..pN). Never search or use remembered facts.',
    'Write in your own words: summaries of what the pages say, not copied phrases. Every factual statement you make must be listed as a claim.',
    'A claim is {text, pages}: text is one short factual statement you rely on; pages lists the id(s) of the saved pages that support it. A claim with no page id fails.',
    'Return summary, description, price as {value, claims}; omit unavailable fields. Price also carries unit.',
    'Hours: return hours as {value, claims} when opening hours appear on a saved page; each claim cites the page id that states those days/times. Omit hours when no page lists hours.',
    'Happy hour: return happyHourDays, happyHourTimes, and happyHourDeals as separate {value, claims} when a saved page states them; each claim cites its page id. Omit a subfield when that detail is missing. When no saved page mentions happy hour, set happyHourFound:false and omit happy-hour subfields—never invent happy hour.',
    'Description: 70-110 words (count them; over 120 or under 40 is discarded), using the exact place name, naming the place, drawn from its site, articles and especially reviews, covering what distinguishes it. Summary: one short decision-useful sentence, distinct from the description.',
    'Itinerary note: return itineraryNote as {value, claims} — one cited line (<=280 characters) for the trip itinerary row: what to do or order here, not just the place name.',
    'Price: positive visible amount, with unit (per night, rental total, fare, or per-person estimate), never confuse a menu item price with a hotel nightly rate.',
    'Return rating: {average,count,scaleMax,quote,url,starMix} only when a published average and count are on a page; the quote is the exact text showing those numbers.',
  ];
  if (includeReviews) {
    lines.push(
      'reviewSet in the JSON below is the full deduplicated set of reviews and opinions already extracted from these pages (each has id, page, text); its size is the real count read. Do not return reviewExcerpts.',
      'You MUST return reviews and knownFor (when a page supports one) and rating (when a published average is on a page), in addition to the fields above.',
      'A known-for item is one specific dish, drink, service or product (e.g. "spicy rigatoni vodka", "tableside guacamole", "hand-sliced nova"), never a broad phrase like "pre-theater dining", "great location", "atmosphere" or "live music".',
      'Return knownFor: [{item, claims}] only for an item a saved page names as a signature, specialty, famous or best-known dish, service or product (a menu marking it signature, an article, or reviews singling it out). Merely having an amenity, an on-site bar, or a neighbouring or tenant restaurant is NOT known-for. Each claim text should state that the page names it as a signature (e.g. "p3 calls the spicy rigatoni its signature dish"). Omit knownFor when no page does this.',
      'Review rating is an integer 1-5 stars (never a 10-point score).',
      'Return reviews: four {text,rating,verdict,claims} representative assessments in your own words, written from ALL of reviewSet (reflect its real spread of praise and complaints, not just a few entries); claims cite the page ids of the reviewSet entries they rest on. Each about 25+ words, distinct with no shared five-word phrases, not repeating the description. claims: the review-evidence statements it rests on, each citing page ids. At least one verdict:true assessment must evaluate how well the known-for item lives up to the claim using customer-review evidence. Do not write in a named customer voice.',
      'The four integer stars must reflect the actual review evidence and average within 0.5 of the fetched average. Do not generate stars from the average alone.',
      'No per-review sources or URLs: those are on the dossier evidence list. Insufficient evidence means omitted fields, never filler.',
    );
  } else {
    lines.push('This product is a flight, car rental, or decision row: do not return reviews, knownFor from review text, or reviewExcerpts.');
  }
  lines.push(JSON.stringify(dossierWithPageIds(modelInput)));
  return lines.join('\n');
}

export async function judgeDossierFindings(dossier, findings, {
  env, fetchImpl, timeoutMs, deadline = 0, judgeImpl, skipReviewClaims = false,
} = {}) {
  const judgedFindings = skipReviewClaims ? { ...findings, reviews: [] } : findings;
  const items = collectDossierClaims(judgedFindings);
  for (const item of items) {
    delete item.supported;
    delete item.judgeReason;
    if (Array.isArray(item.pages)) {
      const resolved = resolveClaimCitationPages(dossier, item.pages);
      if (resolved) item.pages = resolved;
    }
  }
  const ask = items.filter((item) => claimCitesKnownPages(dossier, item));
  for (const item of items) if (!ask.includes(item)) { item.supported = false; item.judgeReason = 'cites no saved dossier page'; }
  if (!ask.length) return { judged: 0, results: [] };
  let results;
  if (judgeImpl) {
    results = await judgeImpl(dossier, ask.map((item, index) => ({ id: `c${index + 1}`, text: item.text, pages: item.pages, ...(item.kind ? { kind: item.kind, item: item.item } : {}) })));
  } else {
    const payload = await postDossierXai(dossier, 'judge', env.XAI_DOSSIER_JUDGE_MODEL || xaiGrokPlaceSearchModelId(env),
      dossierJudgePrompt(dossier, ask), { env, fetchImpl, timeoutMs, deadline });
    try {
      results = JSON.parse(outputText(payload)).results;
    } catch {
      results = [];
    }
  }
  const byId = new Map((Array.isArray(results) ? results : []).map((row) => [String(row?.id), row]));
  ask.forEach((item, index) => {
    const row = byId.get(`c${index + 1}`);
    item.supported = row?.supported === true;
    item.judgeReason = String(row?.reason || (row ? '' : 'judge returned no verdict'));
  });
  return { judged: ask.length, results };
}

export async function extractDossierReviews(dossier, {
  env = process.env, fetchImpl, timeoutMs, deadline = 0, extractReviewsImpl, place = null,
} = {}) {
  const withSnippetPages = ensureBraveSnippetCitationPages(dossier);
  if (withSnippetPages.pages !== dossier.pages) dossier.pages = withSnippetPages.pages;
  const code = dedupeReviews(extractReviewsByCode(withSnippetPages, place)).slice(0, 150);
  let model = [];
  let keep = null;
  let status = 'skipped';
  try {
    if (extractReviewsImpl) {
      ({ reviews: model = [], keep = null } = await extractReviewsImpl(dossier, code));
      status = 'ok';
    } else if (env.XAI_API_KEY) {
      const slim = dossierForModel({ ...dossier, pages: (dossier.pages || []).map((p) => (p.via === 'brave' ? { ...p, text: '' } : p)) },
        { perPage: 1500, total: 16000, want: 'reviews' });
      const payload = await postDossierXai(dossier, 'extract', env.XAI_DOSSIER_EXTRACT_MODEL || xaiGrokPlaceSearchModelId(env),
        extractionPrompt(slim, code.slice(0, 60)), { env, fetchImpl, timeoutMs, deadline });
      const out = JSON.parse(outputText(payload));
      model = out.reviews || [];
      keep = Array.isArray(out.keep) ? out.keep : null;
      status = 'ok';
    }
  } catch {
    status = 'failed';
  }
  const set = finalizeReviewSet(dossier, code, model, keep, place);
  return { set, stats: { code: code.length, codeKept: keep ? keep.length : null, model: Array.isArray(model) ? model.length : 0, kept: set.length, status } };
}

async function callDossierBuilder(dossier, {
  env, fetchImpl, timeoutMs, deadline = 0, buildImpl, includeReviews = true, reviewsOnly = false,
} = {}) {
  if (buildImpl) return buildImpl(dossier, { reviewsOnly });
  const payload = await postDossierXai(
    dossier,
    'builder',
    xaiGrokPlaceSearchModelId(env),
    dossierBuilderPrompt(dossier, { includeReviews, reviewsOnly }),
    { env, fetchImpl, timeoutMs, deadline },
  );
  const structuredText = outputText(payload);
  let findings;
  try {
    findings = JSON.parse(structuredText);
  } catch {
    findings = {};
  }
  return { payload, structuredText, findings };
}

export function dossierCaptureComplete(dossier = {}) {
  return Boolean(dossier?.pages?.length && dossier.fields && Object.keys(dossier.fields).length);
}

export async function fetchXaiPlaceRatings(place = {}, {
  env = process.env, fetchImpl = globalThis.fetch, destination = '', timeoutMs = 120000,
  gatherImpl = gatherThingEvidence, searchImpl, resolveImpl, buildImpl, judgeImpl, extractReviewsImpl,
  dossierKey = '', maxAgeMs = DEFAULT_DOSSIER_MAX_AGE_MS, storeImpl, nowMs = Date.now(), center = null,
  forceRefresh = false, timeBudgetMs = 0,
} = {}) {
  const key = dossierKey || thingEvidenceDossierKey(place);
  const resolved = key
    ? await loadThingEvidenceDossierResolved(key, { env, storeImpl, placeId: place.id ?? place.placeId })
    : { dossier: null, dossierKey: key };
  let persisted = resolved.dossier;
  const deadline = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0;
  const outOfTime = () => deadline > 0 && Date.now() >= deadline;
  const remainingTimeoutMs = () => (deadline > 0 ? Math.max(1000, deadline - Date.now()) : timeoutMs);
  const gatherOpts = {
    env, fetchImpl, destination, resolveImpl, center,
  };
  const xaiOpts = () => ({ env, fetchImpl, timeoutMs: remainingTimeoutMs(), deadline });
  let merged;
  try {
  if (persisted?.pages?.length && !forceRefresh) {
    merged = normalizeDossierEvidence({ ...persisted }, place);
    merged = preservePersistedDossierReviewsWhenFresh(persisted, merged, place);
    if (!placeSupportsDossierReviews(place)) merged = stripDossierReviews(merged, place);
    const pagesChanged = (persisted.pages || []).length !== (merged.pages || []).length
      || changedDossierPageUrls(persisted.pages || [], merged.pages || []).length > 0;
    if (pagesChanged && key) {
      await saveThingEvidenceDossier(key, merged, { env, storeImpl });
      persisted = merged;
    }
    const changedUrlsEarly = changedDossierPageUrls(persisted.pages || [], merged.pages || []);
    if (dossierPersistedFillIsNoOp(persisted, merged, place, { changedUrls: changedUrlsEarly })) {
      merged.captureCheckpoint = 'done';
      return { payload: {}, structuredText: '', skipped: true, parsed: { evidenceDossier: merged } };
    }
    beginDossierXaiUsageRun(merged, persisted);
    const pendingTopUp = braveTopUpFieldsPending(merged, place);
    if (pendingTopUp.length && !outOfTime()) {
      merged = await topUpDossierFields(merged, place, { ...gatherOpts, onlyFields: pendingTopUp });
    }
    if (placeSupportsDossierReviews(place) && dossierReviewsShouldRunWriter(persisted, merged, place) && !outOfTime()) {
      merged = await rebuildDossierReviewsFromSavedEvidence(persisted, place, {
        env,
        fetchImpl,
        destination,
        timeoutMs: remainingTimeoutMs(),
        deadline,
        buildImpl,
        judgeImpl,
        extractReviewsImpl,
        extractDossierReviews,
        callDossierBuilder,
        judgeDossierFindings,
      });
      stampReviewsEvidencePageHash(merged, place);
      commitDossierXaiUsageRun(merged, persisted, { kind: 'reviews-rebuild', placeId: place.id ?? place.placeId });
      if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
      merged.captureCheckpoint = 'done';
      return { payload: {}, structuredText: '', parsed: { evidenceDossier: merged } };
    }
  } else if (persisted?.pages?.length && forceRefresh) {
    const gathered = await gatherImpl(place, gatherOpts);
    merged = mergeDossierPages(persisted, gathered);
    merged.fieldCounts = computeDossierFieldCounts(merged, place);
    beginDossierXaiUsageRun(merged, persisted);
    if (!placeSupportsDossierReviews(place)) merged = stripDossierReviews(merged, place);
  } else {
    const gathered = await gatherImpl(place, gatherOpts);
    merged = gathered;
    merged.fieldCounts = computeDossierFieldCounts(merged, place);
    beginDossierXaiUsageRun(merged, persisted || {});
    if (!placeSupportsDossierReviews(place)) merged = stripDossierReviews(merged, place);
    merged.captureCheckpoint = 'after_gather';
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    if (outOfTime()) {
      commitDossierXaiUsageRun(merged, persisted || {}, { kind: 'partial-gather', placeId: place.id ?? place.placeId });
      return { payload: {}, structuredText: '', partial: true, checkpoint: merged.captureCheckpoint, parsed: { evidenceDossier: merged } };
    }
  }
  merged.fieldCounts = computeDossierFieldCounts(merged, place);
  if (merged.fieldCounts.reviews?.count != null) merged.reviewsRead = merged.fieldCounts.reviews.count;
  merged.missingFields = deriveMissingFieldsFromShortcomings(merged.shortcomings);

  const changedUrls = persisted ? changedDossierPageUrls(persisted.pages || [], merged.pages || []) : [];
  const rebuildFields = persisted
    ? dossierRebuildFields(persisted, merged, { maxAgeExpired: false, changedUrls })
    : new Set(['summary', 'description', 'price', 'hours', 'happyHourDetails', 'rating', 'reviews', 'knownFor', 'itineraryNote']);
  const skipBuilder = persisted
    && !forceRefresh
    && rebuildFields.size === 0
    && persisted.fields
    && Object.keys(persisted.fields).length;
  if (skipBuilder) {
    merged.captureCheckpoint = 'done';
    if (key && merged !== persisted) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', skipped: true, parsed: { evidenceDossier: merged } };
  }
  if (!merged.pages.length) {
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', parsed: { evidenceDossier: merged } };
  }
  if (outOfTime()) {
    merged.captureCheckpoint = merged.captureCheckpoint || 'after_gather';
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', partial: true, checkpoint: merged.captureCheckpoint, parsed: { evidenceDossier: merged } };
  }
  const supportsReviews = placeSupportsDossierReviews(place);
  const needsReviewWriter = supportsReviews && rebuildFields.has('reviews')
    && dossierReviewsShouldRunWriter(persisted, merged, place);
  if (needsReviewWriter && !outOfTime()) {
    const extraction = await extractDossierReviews(merged, { ...xaiOpts(), extractReviewsImpl, place });
    merged.reviewSet = extraction.set;
    merged.reviewExtraction = extraction.stats;
    if (merged.fieldCounts.reviews?.count != null) merged.reviewsRead = merged.fieldCounts.reviews.count;
  }
  const reviewsOnly = dossierBuilderReviewsOnly(rebuildFields);
  if (outOfTime()) {
    merged.captureCheckpoint = merged.captureCheckpoint || 'after_gather';
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', partial: true, checkpoint: merged.captureCheckpoint, parsed: { evidenceDossier: merged } };
  }
  const { payload, structuredText, findings } = await callDossierBuilder(merged, {
    ...xaiOpts(), buildImpl, includeReviews: needsReviewWriter, reviewsOnly,
  });
  if (findings?.description?.value) findings.description.value = fitDescriptionWords(findings.description.value);
  const judge = await judgeDossierFindings(merged, findings, {
    ...xaiOpts(), judgeImpl, skipReviewClaims: !needsReviewWriter,
  });
  const built = prepareDossierFindings(merged, findings);
  built.fieldCounts = computeDossierFieldCounts(built, place);
  if (built.fieldCounts.reviews?.count != null) built.reviewsRead = built.fieldCounts.reviews.count;
  built.missingFields = deriveMissingFieldsFromShortcomings(built.shortcomings);
  const final = persisted && !forceRefresh
    ? mergeSelectiveDossierFindings(persisted, built, rebuildFields, place)
    : built;
  if (needsReviewWriter || rebuildFields.has('reviews')) stampReviewsEvidencePageHash(final, place);
  final.fieldCounts = computeDossierFieldCounts(final, place);
  if (final.fieldCounts.reviews?.count != null) final.reviewsRead = final.fieldCounts.reviews.count;
  final.missingFields = deriveMissingFieldsFromShortcomings(final.shortcomings);
  const usageRun = commitDossierXaiUsageRun(merged, persisted || {}, {
    kind: 'dossier-build',
    placeId: place.id ?? place.placeId,
    rebuildFields: [...rebuildFields],
  });
  final.xaiUsage = merged.xaiUsage;
  final.xaiUsageRuns = merged.xaiUsageRuns;
  final.xaiUsd = merged.xaiUsd;
  if (key) await saveThingEvidenceDossier(key, final, { env, storeImpl });
  final.captureCheckpoint = 'done';
  final.fullPageChars = promptChars(merged);
  return {
    payload,
    structuredText,
    judge,
    findings,
    xaiUsage: final.xaiUsage || [],
    xaiUsageRun: usageRun,
    xaiUsd: final.xaiUsd || 0,
    parsed: { evidenceDossier: final },
  };
  } catch (error) {
    if (error?.resumable && xaiHttpErrorResumable(error.status)) {
      return saveResumablePartial(merged || persisted, persisted, {
        key,
        env,
        storeImpl,
        place,
        rateLimitStep: error.step || 'xai',
        checkpoint: (merged || persisted)?.captureCheckpoint,
      });
    }
    throw error;
  }
}

export function enrichPlaceRecordWithXaiRatings(record = {}, parsed = {}) {
  return applyDossierFields(record, parsed.evidenceDossier || {});
}

export async function enrichSearchPlacesWithGrokRatings(places = [], options = {}) {
  const env = options.env || process.env;
  if (!env.XAI_API_KEY) return { places, skipped: 'missing_xai_api_key' };
  const enriched = [];
  for (const place of Array.isArray(places) ? places : []) {
    let parsed;
    try {
      ({ parsed } = await fetchXaiPlaceRatings(place, options));
    } catch {
      parsed = { evidenceDossier: { thing: place.title || place.name, pages: [], attempts: [{ kind: 'builder', status: 'failed' }] } };
    }
    const sourceRecord = enrichPlaceRecordWithXaiRatings(place.sourceRecord, parsed);
    enriched.push({ ...place, ...sourceRecord, sourceRecord });
  }
  return { places: enriched, skipped: null };
}
