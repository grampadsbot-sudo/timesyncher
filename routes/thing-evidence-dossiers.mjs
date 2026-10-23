import { requireWorkerAuth } from '../src/vacation/auth.mjs';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import {
  normalizeDossierWorkerTargets,
  runThingEvidenceDossierStagingTargets,
} from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';

export default async function handler(req, res) {
  try {
    requireWorkerAuth(req, process.env);
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    }
    const body = await readJson(req);
    const normalized = normalizeDossierWorkerTargets(body);
    const targets = normalized?.length
      ? normalized
      : (body?.allMissing ? [] : PR336_GATE_B_XAI_PLACE_TARGETS);
    const result = await runThingEvidenceDossierStagingTargets(targets, {
      env: process.env,
      skipExisting: body?.allMissing === true,
    });
    return sendJson(res, result.ok ? 200 : 503, result);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'dossier refresh failed.' });
  }
}
