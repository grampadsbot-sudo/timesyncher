import { computeDossierFieldCounts } from './thing-evidence-dossier-field-counts.mjs';
import { dossierPresented, passbPresentedHardTextViolations } from './passb-dossier-presented.mjs';
import { claimsSupported, dossierPageById, fitDescriptionWords, prepareDossierFindings } from './thing-dossier-fields.mjs';

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

export async function buildDossierText(dossier, place, {
  build, judgeFindings, includeReviews = true, reviewsOnly = false, outOfTime = () => false,
}) {
  let { payload, structuredText, findings } = await build({ includeReviews, reviewsOnly });
  if (findings?.description?.value) findings.description.value = fitDescriptionWords(findings.description.value);
  let judge = await judgeFindings(findings, !includeReviews);
  let built = prepareDossierFindings(dossier, findings);
  const textProblems = dossierTextBuildProblems(built, place);
  for (const key of ['summary', 'description']) {
    for (const claim of findings?.[key]?.claims || []) {
      if (claim.supported !== true) textProblems.push(`${key}:unsupported_claim:${String(claim.judgeReason || claim.text || '').slice(0, 240)}`);
    }
  }
  if (!reviewsOnly && textProblems.length && !outOfTime()) {
    const retry = await build({ includeReviews: false, textProblems });
    if (retry.findings?.description?.value) retry.findings.description.value = fitDescriptionWords(retry.findings.description.value);
    const retryJudge = await judgeFindings(retry.findings, true);
    const retryBuilt = prepareDossierFindings(dossier, retry.findings);
    const fields = { ...built.fields };
    const repairedFindings = { ...findings };
    for (const key of ['summary', 'description']) {
      if (!retryBuilt.fields[key]) continue;
      const candidate = { ...built, fields: { ...fields, [key]: retryBuilt.fields[key] } };
      if (dossierTextBuildProblems(candidate, place).some((problem) => problem.startsWith(key) || problem === `blank_${key}`)) continue;
      fields[key] = retryBuilt.fields[key];
      repairedFindings[key] = retry.findings[key];
    }
    if (!dossierTextBuildProblems({ ...built, fields }, place).length) {
      built.fields = fields;
      findings = repairedFindings;
      payload = retry.payload;
      structuredText = retry.structuredText;
      judge = retryJudge;
    }
  }
  return { payload, structuredText, findings, judge, built };
}
