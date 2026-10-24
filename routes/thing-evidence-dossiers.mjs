import { requireWorkerAuth } from '../src/vacation/auth.mjs';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import {
  listTripThingsMissingDossiers,
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
    let targets = normalized?.length ? normalized : null;
    if (!targets?.length && body?.allMissing === true) {
      const listed = await listTripThingsMissingDossiers({
        env: process.env,
        tripId: body.tripId ?? body.trip_id ?? '',
        limit: body.limit,
      });
      if (!listed.ok) {
        return sendJson(res, 503, listed);
      }
      targets = listed.targets;
    }
    if (!targets?.length) {
      targets = body?.allMissing === true ? [] : PR336_GATE_B_XAI_PLACE_TARGETS;
    }
    const result = await runThingEvidenceDossierStagingTargets(targets, {
      env: {
        ...process.env,
        ...(body?.enableTestImpls === true ? { TIMESYNCHER_DOSSIER_TEST_IMPLS: '1' } : {}),
      },
      skipExisting: body?.skipExisting === true,
      forceRefresh: body?.forceRefresh === true,
      timeBudgetMs: Number(body?.timeBudgetMs) > 0 ? Number(body.timeBudgetMs) : 52000,
    });
    return sendJson(res, result.ok ? 200 : 503, result);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'dossier refresh failed.' });
  }
}
