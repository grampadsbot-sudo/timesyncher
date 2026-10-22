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
  dossierWriterProblems,
  prepareDossierFindings,
} from './thing-dossier-fields.mjs';

export const DOSSIER_WRITER_MAX_RETRIES = 2;

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

function dossierPrompt(dossier, feedback = []) {
  return [
    'Build fields for this place using ONLY the saved dossier pages below. Never search or use remembered facts.',
    'Return JSON. Every factual field must be backed by an exact verbatim quote and the saved page URL.',
    'Return summary, description, price, hours, happyHourDetails as {value,quote,url}; omit unavailable fields.',
    'Description: 40-120 words naming the place, drawn from its site, articles and especially reviews, covering what distinguishes it. Summary: one short decision-useful sentence, distinct from the description.',
    'Price: positive visible amount, with unit (per night, rental total, fare, or per-person estimate), never confuse a menu item price with a hotel nightly rate. Preserve dates and conditions in the quote.',
    'Return rating: {average,count,scaleMax,quote,url,starMix}. Average and published count must both appear in its exact quote. starMix is counts for stars 1 through 5, only if published; otherwise omit it.',
    'Return reviewExcerpts: [{quote,url}] containing every distinct actual customer review readable in the saved pages, not summaries, marketing, articles or search snippets. Include the full readable text, never manufacture excerpts or counts.',
    'Return knownFor: [{item,quote,url}] naming its known-for dish, service or product from its own site or an article. The exact item must appear in the quote.',
    'Return reviews: four {text,rating,cites,verdict} representative assessments in your own words. Each about 25+ words, distinct with no shared five-word phrases, not repeating the description. cites: exact phrases from the reviewExcerpts. At least one verdict:true assessment must evaluate how well the known-for item lives up to the claim using customer-review evidence. Do not write in a named customer voice.',
    'The four integer stars must reflect the actual review evidence and average within 0.5 of the fetched average. Do not generate stars from the average alone.',
    'No per-review sources or URLs: those are on the dossier evidence list. Insufficient evidence means omitted fields, never filler.',
    'Quotes must be copied character-for-character from one saved page text; never paraphrase, merge or trim words inside a quote.',
    ...(feedback.length ? ['Your previous answer failed these checks. Fix every one:', ...feedback.map((row) => `- ${row}`)] : []),
    JSON.stringify(dossier),
  ].join('\n');
}

async function callDossierBuilder(dossier, { env, fetchImpl, timeoutMs, buildImpl, feedback = [] }) {
  if (buildImpl) return buildImpl(dossier, { feedback });
  const response = await postXaiPlaceRatingsResponses({
    apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs,
    payload: {
      model: xaiGrokPlaceSearchModelId(env),
      input: [{ role: 'user', content: dossierPrompt(dossier, feedback) }],
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
  gatherImpl = gatherThingEvidence, searchImpl, resolveImpl, buildImpl,
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
  let result = await callDossierBuilder(merged, { env, fetchImpl, timeoutMs, buildImpl });
  const writerAttempts = [];
  for (let retry = 0; retry < DOSSIER_WRITER_MAX_RETRIES; retry += 1) {
    const problems = dossierWriterProblems(merged, result.findings);
    writerAttempts.push({ attempt: retry + 1, problems });
    if (!problems.length) break;
    result = await callDossierBuilder(merged, { env, fetchImpl, timeoutMs, buildImpl, feedback: problems });
  }
  if (writerAttempts.length === DOSSIER_WRITER_MAX_RETRIES && writerAttempts.at(-1).problems.length) {
    writerAttempts.push({ attempt: DOSSIER_WRITER_MAX_RETRIES + 1, problems: dossierWriterProblems(merged, result.findings) });
  }
  const { payload, structuredText, findings } = result;
  const built = prepareDossierFindings(merged, findings);
  const final = persisted && !maxAgeExpired
    ? mergeSelectiveDossierFindings(persisted, built, rebuildFields)
    : built;
  if (key) await saveThingEvidenceDossier(key, final, { env, storeImpl });
  return { payload, structuredText, writerAttempts, parsed: { evidenceDossier: final } };
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
