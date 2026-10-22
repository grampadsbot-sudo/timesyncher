// TEMPORARY (#631/#632 10-Thing dossier run). Remove after the run.
// Guarded by VERCEL_AUTOMATION_BYPASS_SECRET from env; caller sends it in x-dossier-run-secret.
// Uses an in-memory dossier store so nothing is written to the production database.
import { timingSafeEqual } from 'node:crypto';
import { readJson, sendJson } from '../src/vacation/http.mjs';
import {
  enrichPlaceRecordWithXaiRatings,
  fetchXaiPlaceRatings,
  judgeDossierFindings,
} from '../src/vacation/xai-grok-place-ratings.mjs';
import { prepareDossierFindings } from '../src/vacation/thing-dossier-fields.mjs';

function authorized(req, env) {
  const want = Buffer.from(String(env.VERCEL_AUTOMATION_BYPASS_SECRET || ''));
  const got = Buffer.from(String(req.headers['x-dossier-run-secret'] || ''));
  return want.length > 0 && got.length === want.length && timingSafeEqual(want, got);
}

function memoryStore() {
  const rows = new Map();
  return {
    async getDossier(key) { return rows.get(key) || null; },
    async putDossier(key, dossier) { rows.set(key, dossier); },
  };
}

export default async function handler(req, res) {
  if (!authorized(req, process.env)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  try {
    const body = await readJson(req);
    if (body?.mode === 'judge') {
      const findings = body.findings || {};
      const judge = await judgeDossierFindings(body.dossier, findings, { env: process.env, timeoutMs: 240000 });
      const built = prepareDossierFindings(body.dossier, findings);
      const record = enrichPlaceRecordWithXaiRatings({ title: body.dossier?.thing }, { evidenceDossier: built });
      return sendJson(res, 200, { ok: true, judge, findings, record });
    }
    const place = body?.place || {};
    const out = await fetchXaiPlaceRatings(place, {
      env: process.env, destination: body?.destination || '', timeoutMs: 240000,
      storeImpl: memoryStore(), dossierKey: `temp-run:${place.id || place.title || place.name}`, maxAgeMs: 1,
    });
    const record = enrichPlaceRecordWithXaiRatings({ title: place.title || place.name, category: place.category }, out.parsed);
    return sendJson(res, 200, { ok: true, findings: out.findings, judge: out.judge, writerText: out.structuredText, record });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
  }
}
