import { postDossierXai } from './xai-dossier-http.mjs';
import { xaiGrokPlaceSearchModelId } from '../../scripts/vacation-app-reply-rules.mjs';

export async function callDossierBuilder(dossier, {
  env, fetchImpl, timeoutMs, deadline = 0, buildImpl, promptBuilder,
  includeReviews = true, reviewsOnly = false, textProblems = [], place = {},
} = {}) {
  const prompt = promptBuilder(dossier, { includeReviews, reviewsOnly, textProblems, place });
  if (buildImpl) return buildImpl(dossier, { reviewsOnly, prompt, textProblems });
  const payload = await postDossierXai(dossier, 'builder', xaiGrokPlaceSearchModelId(env), prompt,
    { env, fetchImpl, timeoutMs, deadline });
  const structuredText = typeof payload.output_text === 'string' ? payload.output_text
    : (payload.output || []).flatMap((item) => item.content || [])
      .filter((block) => ['output_text', 'text'].includes(block.type)).map((block) => block.text || '').join('');
  try {
    const findings = JSON.parse(structuredText);
    const jsonParsed = Boolean(findings && typeof findings === 'object' && !Array.isArray(findings));
    return { payload, structuredText, findings: jsonParsed ? findings : {}, jsonParsed };
  } catch {
    return { payload, structuredText, findings: {}, jsonParsed: false };
  }
}
