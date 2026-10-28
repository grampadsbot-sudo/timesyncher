import { dossierPageFailure } from './dossier-page-integrity.mjs';
import { collectDossierClaims } from './xai-dossier-judge-prompt.mjs';
import { computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import { dossierPresented, passbPresentedHardTextViolations } from './passb-dossier-presented.mjs';
import { claimsSupported, dossierPageById, fitDescriptionWords, prepareDossierFindings } from './thing-dossier-fields.mjs';
export { dossierTextEvidencePages } from './dossier-text-evidence.mjs';
export { dossierPresented };
export const DOSSIER_ITINERARY_NOTE_PRIORITY = 'Priority: return itineraryNote as a snappy cited vibe + what-to-try line (<=280 chars). Cite only saved pages. Do not skip itineraryNote when pages support a dish, drink, happy hour, or atmosphere highlight.';

function dossierTextBuildProblems(dossier = {}, place = {}) {
  const counts = computeDossierFieldCounts(dossier, place);
  const fields = dossier.fields || {};
  return [
    ...['summary', 'description'].filter((key) => counts[key]?.status !== 'ok')
      .map((key) => `${key}:${counts[key]?.status || 'missing'}`),
    ...passbPresentedHardTextViolations({
      title: place.title || place.name || dossier.thing,
      category: place.category || place.cat,
      summary: fields.summary?.value,
      description: fields.description?.value,
    }),
  ];
}

export function preservePresentedDossierText(persisted, built = {}, place = {}) {
  if (!persisted || (!dossierTextBuildProblems(built, place).length && dossierPresented(built, place))) return built;
  const fields = { ...built.fields };
  for (const key of ['summary', 'description']) {
    const field = persisted.fields?.[key];
    if (!field) return built;
    const claims = (field.claims || []).map((claim) => ({
      ...claim,
      pages: (claim.pages || []).map((id) => {
        const old = dossierPageById(persisted, id);
        const index = (built.pages || []).findIndex((page) => old && page.url === old.url && page.sha256 === old.sha256);
        return index >= 0 ? `p${index + 1}` : '';
      }),
    }));
    fields[key] = { ...field, claims };
    if (!claimsSupported(built, fields[key])) return built;
  }
  const candidate = { ...built, fields };
  return dossierPresented(candidate, place) ? candidate : built;
}

function builderOutcome(result, dossier, findings) {
  const claims = collectDossierClaims(findings);
  const supported = claims.filter((claim) => claim.supported === true).length;
  const jsonParsed = result.jsonParsed ?? Boolean(result.findings && typeof result.findings === 'object' && !Array.isArray(result.findings));
  const textClaims = ['summary', 'description'].flatMap((key) => findings[key]?.claims || []);
  const pagesVerified = Boolean(dossier.pages?.length && dossier.pages.every((page) => !dossierPageFailure(page)));
  const blankedBy = !pagesVerified ? 'unverified_pages' : !jsonParsed && !String(result.structuredText || '').trim() ? 'empty_model_output' : !jsonParsed ? 'parse_error'
    : !findings.summary?.value && !findings.description?.value ? 'empty_model_output'
      : textClaims.length && textClaims.every((claim) => claim.supported !== true) ? 'judge_rejected_all' : null;
  return { ran: true, structuredTextChars: String(result.structuredText || '').length, jsonParsed,
    summaryClaims: findings.summary?.claims?.length || 0, descriptionClaims: findings.description?.claims?.length || 0,
    judgeSupported: supported, judgeUnsupported: claims.length - supported, blankedBy };
}

export async function buildDossierText(dossier, place, {
  build, judgeFindings, includeReviews = true, reviewsOnly = false, outOfTime = () => false, trace,
}) {
  const run = async (options) => {
    if (trace) trace.builder.ran = true;
    const result = await build(options);
    const findings = result.findings && typeof result.findings === 'object' && !Array.isArray(result.findings) ? result.findings : {};
    if (findings.description?.value) findings.description.value = fitDescriptionWords(findings.description.value);
    const judge = await judgeFindings(findings, !options.includeReviews);
    const outcome = builderOutcome(result, dossier, findings);
    if (trace) {
      trace.builder.attempts.push(outcome);
      Object.assign(trace.builder, outcome);
    }
    if (outcome.blankedBy) dossier.attempts = [...(dossier.attempts || []), {
      kind: 'builder', step: outcome.blankedBy, status: 'failed', startedAt: new Date().toISOString(),
    }];
    return { ...result, findings, judge, outcome, built: prepareDossierFindings({ ...dossier, category: place.category || place.cat }, findings) };
  };
  const first = await run({ includeReviews, reviewsOnly });
  let { payload, structuredText, findings, judge, built } = first;
  const textProblems = dossierTextBuildProblems(built, place);
  if (first.outcome.blankedBy) textProblems.push(first.outcome.blankedBy);
  for (const key of ['summary', 'description', 'itineraryNote']) {
    for (const claim of findings[key]?.claims || []) {
      if (claim.supported !== true) textProblems.push(`${key}:unsupported_claim:${String(claim.judgeReason || claim.text || '').slice(0, 240)}`);
    }
  }
  const noteVal = String(built.fields?.itineraryNote?.value || findings.itineraryNote?.value || '').trim();
  if (!reviewsOnly && noteVal.length < 12 && textProblems.length) {
    textProblems.push('itineraryNote missing: return a snappy cited itineraryNote (vibe + what to try/order) supported by saved pages; do not omit it when pages support a highlight');
  }
  if ((!reviewsOnly && textProblems.length || ['parse_error', 'judge_rejected_all'].includes(first.outcome.blankedBy)) && !outOfTime()) {
    const retry = await run({ includeReviews: false, textProblems });
    const fields = { ...built.fields };
    const repairedFindings = { ...findings };
    for (const key of ['summary', 'description', 'itineraryNote']) {
      if (!retry.built.fields[key]) continue;
      if (key === 'itineraryNote') {
        fields[key] = retry.built.fields[key];
        repairedFindings[key] = retry.findings[key];
        continue;
      }
      const candidate = { ...built, fields: { ...fields, [key]: retry.built.fields[key] } };
      if (dossierTextBuildProblems(candidate, place).some((problem) => problem.startsWith(key) || problem === `blank_${key}`)) continue;
      fields[key] = retry.built.fields[key];
      repairedFindings[key] = retry.findings[key];
    }
    built.attempts = dossier.attempts;
    const repaired = { ...built, fields };
    const repairedOk = !dossierTextBuildProblems(repaired, place).length;
    const noteRepaired = String(fields.itineraryNote?.value || '').trim().length >= 12;
    if (repairedOk || noteRepaired) {
      built.fields = fields;
      findings = repairedFindings;
      payload = retry.payload;
      structuredText = retry.structuredText;
      judge = retry.judge;
    }
  }
  return { payload, structuredText, findings, judge, built };
}
