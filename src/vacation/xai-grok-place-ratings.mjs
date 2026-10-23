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
  prepareDossierFindings,
  fitDescriptionWords,
  resolveClaimCitationPages,
} from './thing-dossier-fields.mjs';
import { dossierForModel, logXaiUsage, promptChars } from './dossier-cost.mjs';
import { dedupeReviews, extractionPrompt, extractReviewsByCode, finalizeReviewSet } from './dossier-review-extract.mjs';

export {
  parseXaiStructuredPayload,
  applyXaiPlaceRatingsToRecord,
  writeRepresentativeReviews,
  formatOtherRatingsLine,
  xaiThemesReviewPath,
  reviewThemesDistinctCount,
} from './xai-grok-place-ratings-helpers.mjs';

const ESCALATE_STEPS = new Set(['builder']);

async function postXai(dossier, step, model, content, { env, fetchImpl, timeoutMs }) {
  const base = { model, input: [{ role: 'user', content }], text: { format: { type: 'json_object' } } };
  const effort = env.XAI_DOSSIER_REASONING_EFFORT || (ESCALATE_STEPS.has(step) ? '' : 'none');
  let response = await postXaiPlaceRatingsResponses({ apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs,
    payload: effort ? { ...base, reasoning: { effort } } : base });
  if (effort && response.status === 400) {
    response = await postXaiPlaceRatingsResponses({ apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs, payload: base });
  }
  if (!response.ok) {
    logXaiUsage(dossier, step, model, {});
    throw new Error(`dossier_${step === 'builder' ? 'builder' : step}_http_${response.status}`);
  }
  const payload = await response.json();
  const row = logXaiUsage(dossier, step, model, payload);
  row.promptChars = content.length;
  return payload;
}

function outputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  return (payload.output || []).flatMap((item) => item.content || [])
    .filter((block) => ['output_text', 'text'].includes(block.type)).map((block) => block.text || '').join('');
}

export function dossierWithPageIds(dossier = {}) {
  return { ...dossier, pages: (dossier.pages || []).map((page, index) => ({ id: dossierPageId(index), ...page })) };
}

function dossierPrompt(dossier) {
  return [
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
    'reviewSet in the JSON below is the full deduplicated set of reviews and opinions already extracted from these pages (each has id, page, text); its size is the real count read. Do not return reviewExcerpts.',
    'You MUST return reviews and knownFor (when a page supports one) and rating (when a published average is on a page), in addition to the fields above.',
    'A known-for item is one specific dish, drink, service or product (e.g. "spicy rigatoni vodka", "tableside guacamole", "hand-sliced nova"), never a broad phrase like "pre-theater dining", "great location", "atmosphere" or "live music".',
    'Return knownFor: [{item, claims}] only for an item a saved page names as a signature, specialty, famous or best-known dish, service or product (a menu marking it signature, an article, or reviews singling it out). Merely having an amenity, an on-site bar, or a neighbouring or tenant restaurant is NOT known-for. Each claim text should state that the page names it as a signature (e.g. "p3 calls the spicy rigatoni its signature dish"). Omit knownFor when no page does this.',
    'Review rating is an integer 1-5 stars (never a 10-point score).',
    'Return reviews: four {text,rating,verdict,claims} representative assessments in your own words, written from ALL of reviewSet (reflect its real spread of praise and complaints, not just a few entries); claims cite the page ids of the reviewSet entries they rest on. Each about 25+ words, distinct with no shared five-word phrases, not repeating the description. claims: the review-evidence statements it rests on, each citing page ids. At least one verdict:true assessment must evaluate how well the known-for item lives up to the claim using customer-review evidence. Do not write in a named customer voice.',
    'The four integer stars must reflect the actual review evidence and average within 0.5 of the fetched average. Do not generate stars from the average alone.',
    'No per-review sources or URLs: those are on the dossier evidence list. Insufficient evidence means omitted fields, never filler.',
    JSON.stringify(dossierWithPageIds(dossierForModel(dossier, { perPage: 1800, total: 24000 }))),
  ].join('\n');
}

export function collectDossierClaims(findings = {}) {
  const items = [];
  const add = (claim) => { if (claim && typeof claim === 'object') items.push(claim); };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails', 'happyHourDays', 'happyHourTimes', 'happyHourDeals', 'itineraryNote']) {
    (findings[key]?.claims || []).forEach((claim) => {
      if (claim && typeof claim === 'object') {
        if (['hours', 'happyHourDays', 'happyHourTimes', 'happyHourDeals'].includes(key)) claim.kind = key;
        add(claim);
      }
    });
  }
  for (const row of findings.hoursCandidates || []) (row?.claims || []).forEach((claim) => {
    if (claim && typeof claim === 'object') { claim.kind = 'hours'; add(claim); }
  });
  for (const item of findings.knownFor || []) (item?.claims || []).forEach((claim) => { if (claim && typeof claim === 'object') { claim.kind = 'knownFor'; claim.item = item.item; add(claim); } });
  for (const review of findings.reviews || []) (review?.claims || []).forEach(add);
  return items;
}

export function dossierJudgePrompt(dossier, items) {
  const ids = [...new Set(items.flatMap((item) => item.pages || []))];
  const slim = dossierForModel(dossier, { perPage: 1800, total: 24000 });
  const pages = ids.map((id) => ({ id, page: dossierPageById(slim, id) })).filter((row) => row.page)
    .map(({ id, page }) => ({ id, url: page.url, fetchedAt: page.fetchedAt, sha256: page.sha256, text: page.text }));
  return [
    'You are an independent fact checker. You did not write these claims.',
    'Field text and claims are summaries in the writer\'s own words, not quotations. For each claim, read ONLY the saved page text of the page ids it cites.',
    'supported:true when those pages support the claim\'s meaning (paraphrase and synonyms are fine). supported:false for facts not on the cited pages, wrong numbers, times, names, or contradictions—not because the claim uses different words than the page.',
    'Anything not backed by the cited pages (outside knowledge, other pages, exaggeration, invented numbers or details) is supported:false.',
    'Claims with kind "knownFor": supported:true ONLY when a cited page names that item as a signature, specialty, famous or best-known thing of THIS place. A page that merely lists it (an on-site bar, an amenity, a tenant or neighbouring restaurant) is supported:false.',
    'Claims with kind "knownFor" are also supported:false when the item is a broad phrase (dining, location, atmosphere, experience) rather than one specific dish, drink, service or product.',
    'Claims with kind hours, happyHourDays, happyHourTimes, or happyHourDeals: supported:false when cited pages state different days, times, or offers than the claim, even if both mention happy hour or hours.',
    'Return JSON {"results":[{"id":"c1","supported":true,"reason":"..."}]} with one result per claim.',
    JSON.stringify({ claims: items.map((item, index) => ({ id: `c${index + 1}`, text: item.text, pages: item.pages, ...(item.kind ? { kind: item.kind, item: item.item } : {}) })), pages }),
  ].join('\n');
}

export async function judgeDossierFindings(dossier, findings, { env, fetchImpl, timeoutMs, judgeImpl } = {}) {
  const items = collectDossierClaims(findings);
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
    const payload = await postXai(dossier, 'judge', env.XAI_DOSSIER_JUDGE_MODEL || xaiGrokPlaceSearchModelId(env),
      dossierJudgePrompt(dossier, ask), { env, fetchImpl, timeoutMs });
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

export async function extractDossierReviews(dossier, { env = process.env, fetchImpl, timeoutMs, extractReviewsImpl } = {}) {
  const code = dedupeReviews(extractReviewsByCode(dossier)).slice(0, 150);
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
      const payload = await postXai(dossier, 'extract', env.XAI_DOSSIER_EXTRACT_MODEL || xaiGrokPlaceSearchModelId(env),
        extractionPrompt(slim, code.slice(0, 60)), { env, fetchImpl, timeoutMs });
      const out = JSON.parse(outputText(payload));
      model = out.reviews || [];
      keep = Array.isArray(out.keep) ? out.keep : null;
      status = 'ok';
    }
  } catch {
    status = 'failed';
  }
  const set = finalizeReviewSet(dossier, code, model, keep);
  return { set, stats: { code: code.length, codeKept: keep ? keep.length : null, model: Array.isArray(model) ? model.length : 0, kept: set.length, status } };
}

async function callDossierBuilder(dossier, { env, fetchImpl, timeoutMs, buildImpl }) {
  if (buildImpl) return buildImpl(dossier);
  const payload = await postXai(dossier, 'builder', xaiGrokPlaceSearchModelId(env), dossierPrompt(dossier), { env, fetchImpl, timeoutMs });
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
  const persisted = resolved.dossier;
  const deadline = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0;
  const outOfTime = () => deadline > 0 && Date.now() >= deadline;
  const gatherOpts = {
    env, fetchImpl, destination, resolveImpl, center,
  };
  let merged;
  if (persisted?.pages?.length && !forceRefresh) {
    merged = { ...persisted };
    const pendingTopUp = braveTopUpFieldsPending(merged, place);
    if (pendingTopUp.length) {
      merged = await topUpDossierFields(merged, place, { ...gatherOpts, onlyFields: pendingTopUp });
    }
  } else if (persisted?.pages?.length && forceRefresh) {
    const gathered = await gatherImpl(place, gatherOpts);
    merged = mergeDossierPages(persisted, gathered);
    merged.fieldCounts = computeDossierFieldCounts(merged, place);
  } else {
    const gathered = await gatherImpl(place, gatherOpts);
    merged = gathered;
    merged.fieldCounts = computeDossierFieldCounts(merged, place);
    merged.captureCheckpoint = 'after_gather';
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    if (outOfTime()) {
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
  const extraction = await extractDossierReviews(merged, { env, fetchImpl, timeoutMs, extractReviewsImpl });
  merged.reviewSet = extraction.set;
  merged.reviewExtraction = extraction.stats;
  if (merged.fieldCounts.reviews?.count != null) merged.reviewsRead = merged.fieldCounts.reviews.count;
  const { payload, structuredText, findings } = await callDossierBuilder(merged, {
    env, fetchImpl, timeoutMs, buildImpl,
  });
  if (findings?.description?.value) findings.description.value = fitDescriptionWords(findings.description.value);
  const judge = await judgeDossierFindings(merged, findings, { env, fetchImpl, timeoutMs, judgeImpl });
  const built = prepareDossierFindings(merged, findings);
  built.fieldCounts = computeDossierFieldCounts(built, place);
  if (built.fieldCounts.reviews?.count != null) built.reviewsRead = built.fieldCounts.reviews.count;
  built.missingFields = deriveMissingFieldsFromShortcomings(built.shortcomings);
  const final = persisted && !forceRefresh
    ? mergeSelectiveDossierFindings(persisted, built, rebuildFields)
    : built;
  final.fieldCounts = computeDossierFieldCounts(final, place);
  if (final.fieldCounts.reviews?.count != null) final.reviewsRead = final.fieldCounts.reviews.count;
  final.missingFields = deriveMissingFieldsFromShortcomings(final.shortcomings);
  if (key) await saveThingEvidenceDossier(key, final, { env, storeImpl });
  final.captureCheckpoint = 'done';
  final.xaiUsage = merged.xaiUsage || [];
  final.xaiUsd = merged.xaiUsd || 0;
  final.fullPageChars = promptChars(merged);
  return { payload, structuredText, judge, findings, extraction: extraction.stats, xaiUsage: final.xaiUsage, xaiUsd: final.xaiUsd, parsed: { evidenceDossier: final } };
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
