#!/usr/bin/env node
/**
 * OpenRouter vision preflight for shepherd VISUAL judge (harness-only HTTP).
 * Uses OPENROUTER_CHAT_COMPLETIONS_URL from the model client module; no openrouter host literals here (ratchet).
 */
import { OPENROUTER_CHAT_COMPLETIONS_URL } from './vacation-app-reply-rules.mjs';
import { VISUAL_JUDGE_MODEL } from './shepherd-staging-smoke-visual-rubric.mjs';

const PREFLIGHT_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function openRouterModelsUrl() {
  return OPENROUTER_CHAT_COMPLETIONS_URL.replace(/\/chat\/completions\/?$/i, '/models');
}

function modelAcceptsImage(modalityPayload) {
  const arch = modalityPayload?.architecture || modalityPayload || {};
  const raw = arch.input_modalities || arch.modality || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.some((entry) => String(entry).toLowerCase().includes('image'));
}

export async function fetchOpenRouterModelRecord(modelId, { apiKey, fetchImpl = fetch } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, error: 'OPENROUTER_API_KEY missing' };
  const res = await fetchImpl(openRouterModelsUrl(), { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    return { ok: false, error: `models HTTP ${res.status}` };
  }
  const body = await res.json();
  const row = (body.data || []).find((m) => m.id === modelId);
  if (!row) return { ok: false, error: `model ${modelId} not listed` };
  if (!modelAcceptsImage(row)) {
    return { ok: false, error: `model ${modelId} input_modalities lack image`, modalities: row.architecture?.input_modalities };
  }
  return { ok: true, model: row.id, inputModalities: row.architecture?.input_modalities };
}

async function postOpenRouterVisionPreflight({
  model,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 45000,
} = {}) {
  const key = String(apiKey || '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://vacation-staging.timesyncher.com',
        'X-Title': 'Shepherd Visual Preflight',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Reply with JSON {"ok":true} only.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${PREFLIGHT_PNG_B64}` } },
          ],
        }],
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) return { ok: false, status: res.status, excerpt: raw.slice(0, 200) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

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
