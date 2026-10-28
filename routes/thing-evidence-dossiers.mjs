import { authorizeThingEvidenceDossierRequest } from '../src/vacation/auth.mjs';
import { hasDatabase } from '../src/vacation/db.mjs';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import { missingSearchKeys, xaiPlaceSearchModelId } from '../src/vacation/provider-env.mjs';
import {
  computePassBDossierMetrics,
  operatorPassBTimeBudgetMs,
  resolvePassBOperatorTargets,
} from '../src/vacation/passb-dossier-metrics.mjs';
import {
  listTripThingsMissingDossiers,
  normalizeDossierWorkerTargets,
  runThingEvidenceDossierStagingTargets,
} from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';

function dossierFillPreflight(env = process.env) {
  if (!String(env.XAI_API_KEY || '').trim()) {
    return { ok: false, code: 'missing_xai_api_key' };
  }
  try {
    xaiPlaceSearchModelId(env);
  } catch (error) {
    return { ok: false, code: error?.code || 'missing_xai_place_search_model' };
  }
  const missingKeys = missingSearchKeys(env);
  if (missingKeys.length) {
    return { ok: false, code: 'missing_search_keys', missingKeys };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  try {
    const authMode = authorizeThingEvidenceDossierRequest(req, process.env);
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    }
    const body = await readJson(req);
    if (authMode === 'operator' && !hasDatabase(process.env)) {
      return sendJson(res, 503, {
        ok: false,
        code: 'missing_database',
        message: 'DATABASE_URL is not configured for central dossier storage.',
        results: [],
      });
    }
    if (body?.metrics === true || body?.mode === 'metrics') {
      const metrics = await computePassBDossierMetrics({ env: process.env });
      return sendJson(res, 200, metrics);
    }
    let targets;
    let batch = null;
    let inventorySource = null;
    if (authMode === 'operator') {
      const passBResolved = await resolvePassBOperatorTargets(body, { authMode });
      batch = passBResolved.batch;
      inventorySource = passBResolved.source;
      targets = passBResolved.targets;
      if (!targets.length) {
        return sendJson(res, 200, {
          ok: true,
          results: [],
          batch,
          inventorySource,
        });
      }
    } else {
      const passBResolved = await resolvePassBOperatorTargets(body, { authMode });
      const normalized = normalizeDossierWorkerTargets(body);
      targets = passBResolved?.targets?.length
        ? passBResolved.targets
        : (normalized?.length ? normalized : null);
      batch = passBResolved?.batch || null;
      inventorySource = passBResolved?.source || null;
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
    }
    if (authMode === 'operator' && body?.botSeed === true) {
      const seeded = await runBotPrimarySeedTargets(targets, { env: process.env });
      const payload = batch ? { ...seeded, batch, inventorySource, xaiCalled: 0, fillPath: 'bot-primary' } : { ...seeded, xaiCalled: 0, fillPath: 'bot-primary' };
      return sendJson(res, seeded.ok ? 200 : 503, payload);
    }
    const preflight = dossierFillPreflight(process.env);
    if (!preflight.ok && authMode === 'operator') {
      return sendJson(res, 503, { ok: false, ...preflight, results: [] });
    }
    const testImplsAllowed = authMode === 'worker' && body?.enableTestImpls === true;
    const runEnv = { ...process.env };
    if (authMode === 'operator') {
      delete runEnv.TIMESYNCHER_DOSSIER_TEST_IMPLS;
    }
    if (testImplsAllowed) {
      runEnv.TIMESYNCHER_DOSSIER_TEST_IMPLS = '1';
    }
    const timeBudgetMs = authMode === 'operator'
      ? operatorPassBTimeBudgetMs(body?.timeBudgetMs)
      : (Number(body?.timeBudgetMs) > 0 ? Number(body.timeBudgetMs) : 52000);
    const result = await runThingEvidenceDossierStagingTargets(targets, {
      env: runEnv,
      skipExisting: body?.skipExisting === true,
      forceRefresh: body?.forceRefresh === true,
      operatorFill: authMode === 'operator',
      timeBudgetMs,
    });
    const payload = batch ? { ...result, batch, inventorySource } : result;
    return sendJson(res, result.ok ? 200 : 503, payload);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'dossier refresh failed.' });
  }
}
