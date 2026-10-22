import {
  postXaiPlaceRatingsResponses,
  xaiGrokPlaceSearchModelId,
} from '../../scripts/vacation-app-reply-rules.mjs';
import {
  changedDossierPageUrls,
  DEFAULT_DOSSIER_MAX_AGE_MS,
  dossierNeedsRefresh,
  gatherThingEvidence,
  mergeDossierPages,
} from './thing-evidence-dossier.mjs';
import {
  loadThingEvidenceDossier,
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
} from './thing-dossier-fields.mjs';

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

function dossierPrompt(dossier) {
  return [
    'Build fields for this place using ONLY the saved dossier pages below (each has an id p1..pN). Never search or use remembered facts.',
    'Write in your own words: summaries of what the pages say, not copied phrases. Every factual statement you make must be listed as a claim.',
    'A claim is {text, pages}: text is one short factual statement you rely on; pages lists the id(s) of the saved pages that support it. A claim with no page id fails.',
    'Return summary, description, price, hours, happyHourDetails as {value, claims}; omit unavailable fields. Price also carries unit.',
    'Description: 40-120 words naming the place, drawn from its site, articles and especially reviews, covering what distinguishes it. Summary: one short decision-useful sentence, distinct from the description.',
    'Price: positive visible amount, with unit (per night, rental total, fare, or per-person estimate), never confuse a menu item price with a hotel nightly rate.',
    'Return rating: {average,count,scaleMax,quote,url,starMix} only when a published average and count are on a page; the quote is the exact text showing those numbers.',
    'Return reviewExcerpts: [{text, pages}] with one entry per distinct actual customer review readable in the saved pages, text a one-sentence summary of that review. Never manufacture reviews or counts.',
    'Return knownFor: [{item, claims}] naming its known-for dish, service or product from its own site or an article.',
    'Return reviews: four {text,rating,verdict,claims} representative assessments in your own words. Each about 25+ words, distinct with no shared five-word phrases, not repeating the description. claims: the review-evidence statements it rests on, each citing page ids. At least one verdict:true assessment must evaluate how well the known-for item lives up to the claim using customer-review evidence. Do not write in a named customer voice.',
    'The four integer stars must reflect the actual review evidence and average within 0.5 of the fetched average. Do not generate stars from the average alone.',
    'No per-review sources or URLs: those are on the dossier evidence list. Insufficient evidence means omitted fields, never filler.',
    JSON.stringify(dossierWithPageIds(dossier)),
  ].join('\n');
}

export function collectDossierClaims(findings = {}) {
  const items = [];
  const add = (claim) => { if (claim && typeof claim === 'object') items.push(claim); };
  for (const key of ['summary', 'description', 'price', 'hours', 'happyHourDetails']) {
    (findings[key]?.claims || []).forEach(add);
  }
  for (const item of findings.knownFor || []) (item?.claims || []).forEach(add);
  for (const review of findings.reviews || []) (review?.claims || []).forEach(add);
  (findings.reviewExcerpts || []).forEach(add);
  return items;
}

function judgePrompt(dossier, items) {
  const ids = [...new Set(items.flatMap((item) => item.pages || []))];
  const pages = ids.map((id) => ({ id, page: dossierPageById(dossier, id) })).filter((row) => row.page)
    .map(({ id, page }) => ({ id, url: page.url, fetchedAt: page.fetchedAt, sha256: page.sha256, text: page.text }));
  return [
    'You are an independent fact checker. You did not write these claims.',
    'For each claim, read ONLY the saved page text of the page ids it cites. supported:true only when those pages state or clearly imply the claim; paraphrase is fine, exact wording is not required.',
    'Anything not backed by the cited pages (outside knowledge, other pages, exaggeration, invented numbers or details) is supported:false.',
    'Return JSON {"results":[{"id":"c1","supported":true,"reason":"..."}]} with one result per claim.',
    JSON.stringify({ claims: items.map((item, index) => ({ id: `c${index + 1}`, text: item.text, pages: item.pages })), pages }),
  ].join('\n');
}

export async function judgeDossierFindings(dossier, findings, { env, fetchImpl, timeoutMs, judgeImpl } = {}) {
  const items = collectDossierClaims(findings);
  for (const item of items) { delete item.supported; delete item.judgeReason; }
  const ask = items.filter((item) => claimCitesKnownPages(dossier, item));
  for (const item of items) if (!ask.includes(item)) { item.supported = false; item.judgeReason = 'cites no saved dossier page'; }
  if (!ask.length) return { judged: 0, results: [] };
  let results;
  if (judgeImpl) {
    results = await judgeImpl(dossier, ask.map((item, index) => ({ id: `c${index + 1}`, text: item.text, pages: item.pages })));
  } else {
    const response = await postXaiPlaceRatingsResponses({
      apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs,
      payload: {
        model: env.XAI_DOSSIER_JUDGE_MODEL || xaiGrokPlaceSearchModelId(env),
        input: [{ role: 'user', content: judgePrompt(dossier, ask) }],
        text: { format: { type: 'json_object' } },
      },
    });
    if (!response.ok) throw new Error(`dossier_judge_http_${response.status}`);
    try {
      results = JSON.parse(outputText(await response.json())).results;
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

async function callDossierBuilder(dossier, { env, fetchImpl, timeoutMs, buildImpl }) {
  if (buildImpl) return buildImpl(dossier);
  const response = await postXaiPlaceRatingsResponses({
    apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs,
    payload: {
      model: xaiGrokPlaceSearchModelId(env),
      input: [{ role: 'user', content: dossierPrompt(dossier) }],
      text: { format: { type: 'json_object' } },
    },
  });
  if (!response.ok) throw new Error(`dossier_builder_http_${response.status}`);
  const payload = await response.json();
  const structuredText = outputText(payload);
  let findings;
  try {
    findings = JSON.parse(structuredText);
  } catch {
    findings = {};
  }
  return { payload, structuredText, findings };
}

export async function fetchXaiPlaceRatings(place = {}, {
  env = process.env, fetchImpl = globalThis.fetch, destination = '', timeoutMs = 120000,
  gatherImpl = gatherThingEvidence, searchImpl, resolveImpl, buildImpl, judgeImpl,
  dossierKey = '', maxAgeMs = DEFAULT_DOSSIER_MAX_AGE_MS, storeImpl, nowMs = Date.now(),
} = {}) {
  const key = dossierKey || thingEvidenceDossierKey(place);
  const persisted = key ? await loadThingEvidenceDossier(key, { env, storeImpl }) : null;
  const maxAgeExpired = persisted ? dossierNeedsRefresh(persisted, maxAgeMs, nowMs) : true;
  const gathered = await gatherImpl(place, { env, fetchImpl, destination, searchImpl, resolveImpl });
  const merged = persisted ? mergeDossierPages(persisted, gathered) : gathered;
  const changedUrls = persisted ? changedDossierPageUrls(persisted.pages || [], merged.pages || []) : [];
  const rebuildFields = persisted
    ? dossierRebuildFields(persisted, merged, { maxAgeExpired, changedUrls })
    : new Set(['summary', 'description', 'price', 'hours', 'happyHourDetails', 'rating', 'reviews', 'knownFor']);
  const skipBuilder = persisted
    && !maxAgeExpired
    && rebuildFields.size === 0
    && persisted.fields
    && Object.keys(persisted.fields).length;
  if (skipBuilder) {
    if (key && merged !== persisted) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', parsed: { evidenceDossier: merged } };
  }
  if (!merged.pages.length) {
    if (key) await saveThingEvidenceDossier(key, merged, { env, storeImpl });
    return { payload: {}, structuredText: '', parsed: { evidenceDossier: merged } };
  }
  const { payload, structuredText, findings } = await callDossierBuilder(merged, {
    env, fetchImpl, timeoutMs, buildImpl,
  });
  const judge = await judgeDossierFindings(merged, findings, { env, fetchImpl, timeoutMs, judgeImpl });
  const built = prepareDossierFindings(merged, findings);
  const final = persisted && !maxAgeExpired
    ? mergeSelectiveDossierFindings(persisted, built, rebuildFields)
    : built;
  if (key) await saveThingEvidenceDossier(key, final, { env, storeImpl });
  return { payload, structuredText, judge, findings, parsed: { evidenceDossier: final } };
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
