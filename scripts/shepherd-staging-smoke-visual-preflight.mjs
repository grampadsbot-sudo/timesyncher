#!/usr/bin/env node
/** OpenRouter vision preflight wrapper (HTTP in vacation-app-reply-rules.mjs). */
import {
  fetchOpenRouterModelRecord,
  postOpenRouterVisionPreflight,
} from './vacation-app-reply-rules.mjs';
import { VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-rubric.mjs';

export async function runVisualOpenRouterPreflight({
  apiKey,
  model = VISUAL_JUDGE_MODEL,
  fetchImpl = fetch,
  timeoutMs = 45000,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    return {
      ok: false,
      checkStatus: 'INFRA_BLOCKED',
      infraDetail: { reason: 'openrouter_key_missing' },
      error: 'OPENROUTER_API_KEY missing',
      model,
    };
  }
  const listed = await fetchOpenRouterModelRecord(model, { apiKey: key, fetchImpl });
  if (!listed.ok) {
    return {
      ok: false,
      checkStatus: 'INFRA_BLOCKED',
      infraDetail: { reason: 'openrouter_model_not_vision', detail: listed.error, modalities: listed.modalities },
      error: listed.error,
      model,
    };
  }
  const probe = await postOpenRouterVisionPreflight({ model, apiKey: key, fetchImpl, timeoutMs });
  if (!probe.ok) {
    return {
      ok: false,
      checkStatus: 'INFRA_BLOCKED',
      infraDetail: {
        reason: probe.status ? 'openrouter_vision_preflight_http' : 'openrouter_vision_preflight_error',
        status: probe.status,
        excerpt: probe.excerpt,
        message: probe.error,
      },
      error: probe.error || `preflight HTTP ${probe.status}`,
      model,
      inputModalities: listed.inputModalities,
    };
  }
  return {
    ok: true,
    checkStatus: null,
    model,
    inputModalities: listed.inputModalities,
  };
}

export { fetchOpenRouterModelRecord };
