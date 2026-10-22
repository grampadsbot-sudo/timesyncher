// TEMPORARY (#632 xAI 403 diagnosis). Remove after use. Same guard as dossier-run-temp. Never returns the key:
// any token-looking string in xAI bodies is masked before it is returned.
import { timingSafeEqual } from 'node:crypto';
import { sendJson } from '../src/vacation/http.mjs';
import { xaiGrokPlaceSearchModelId } from '../scripts/vacation-app-reply-rules.mjs';

function authorized(req, env) {
  const got = Buffer.from(String(req.headers['x-dossier-run-secret'] || ''));
  return [env.VERCEL_AUTOMATION_BYPASS_SECRET, env.DOSSIER_RUN_SECRET].some((value) => {
    const want = Buffer.from(String(value || ''));
    return want.length > 0 && got.length === want.length && timingSafeEqual(want, got);
  });
}

function mask(text, key) {
  let out = String(text || '');
  if (key) out = out.split(key).join('[KEY]');
  return out.replace(/xai-[A-Za-z0-9_-]{8,}/g, 'xai-[MASKED]').slice(0, 2000);
}

async function call(url, key, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.text() };
}

export default async function handler(req, res) {
  const env = process.env;
  if (!authorized(req, env)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  const key = String(env.XAI_API_KEY || '').trim();
  const models = {
    XAI_PLACE_SEARCH_MODEL: env.XAI_PLACE_SEARCH_MODEL ?? null,
    XAI_DOSSIER_JUDGE_MODEL: env.XAI_DOSSIER_JUDGE_MODEL ?? null,
    XAI_DOSSIER_EXTRACT_MODEL: env.XAI_DOSSIER_EXTRACT_MODEL ?? null,
    resolvedPlaceSearchModel: xaiGrokPlaceSearchModelId(env),
  };
  const out = { ok: true, keyPresent: Boolean(key), keyLength: key.length, buildSha: env.TIMESYNCHER_BUILD_SHA || null, models };
  if (!key) return sendJson(res, 200, out);
  const info = await call('https://api.x.ai/v1/api-key', key).catch((e) => ({ status: 0, body: String(e.message) }));
  let keyInfo = null;
  try {
    const j = JSON.parse(info.body);
    keyInfo = { api_key_blocked: j.api_key_blocked, api_key_disabled: j.api_key_disabled, team_blocked: j.team_blocked, acls: j.acls, team_id_present: Boolean(j.team_id) };
  } catch { keyInfo = { raw: mask(info.body, key) }; }
  out.apiKey = { status: info.status, ...keyInfo };
  const list = await call('https://api.x.ai/v1/models', key).catch((e) => ({ status: 0, body: String(e.message) }));
  let ids = null;
  try { ids = (JSON.parse(list.body).data || []).map((m) => m.id); } catch { /* keep raw */ }
  out.models_endpoint = { status: list.status, ids, raw: ids ? undefined : mask(list.body, key) };
  out.probes = [];
  for (const model of [...new Set([models.resolvedPlaceSearchModel, models.XAI_DOSSIER_JUDGE_MODEL, 'grok-4-fast-non-reasoning'].filter(Boolean))]) {
    const p = await call('https://api.x.ai/v1/responses', key, { method: 'POST', body: JSON.stringify({ model, input: [{ role: 'user', content: 'Reply with the word ok.' }], max_output_tokens: 16 }) })
      .catch((e) => ({ status: 0, body: String(e.message) }));
    out.probes.push({ model, status: p.status, body: mask(p.body, key) });
  }
  return sendJson(res, 200, out);
}
