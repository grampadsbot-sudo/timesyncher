import { authorizeThingEvidenceDossierRequest } from '../src/vacation/auth.mjs';
import { hasDatabase } from '../src/vacation/db.mjs';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import {
  computePassBDossierMetrics,
  resolvePassBOperatorTargets,
} from '../src/vacation/passb-dossier-metrics.mjs';
import {
  listTripThingsMissingDossiers,
  normalizeDossierWorkerTargets,
} from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { runBotPrimarySeedTargets } from '../src/vacation/dossier-bot-primary-seed.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from '../scripts/fixtures/pr336-gate-b-xai-place-targets.mjs';

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
    const result = await runBotPrimarySeedTargets(targets, { env: process.env });
    const seeded = { ...result, xaiCalled: 0, fillPath: 'bot-primary' };
    const payload = batch ? { ...seeded, batch, inventorySource } : seeded;
    return sendJson(res, result.ok ? 200 : 503, payload);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'dossier refresh failed.' });
  }
}
