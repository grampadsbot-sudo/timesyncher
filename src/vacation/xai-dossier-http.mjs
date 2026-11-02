import { postXaiPlaceRatingsResponses } from '../../scripts/vacation-app-reply-rules.mjs';
import { logXaiUsage } from './dossier-cost.mjs';

const RETRYABLE_XAI_STATUSES = new Set([429, 503]);
const ESCALATE_STEPS = new Set(['builder']);

export function parseRetryAfterMs(response, fallbackMs = 1000) {
  const raw = response?.headers?.get?.('retry-after') || response?.headers?.get?.('Retry-After') || '';
  const trimmed = String(raw).trim();
  if (!trimmed) return fallbackMs;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const when = Date.parse(trimmed);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return fallbackMs;
}

export function xaiHttpErrorResumable(status) {
  return RETRYABLE_XAI_STATUSES.has(Number(status));
}

function attachDossierXaiHttpError(error, { step = '', status = 0, upstream = null } = {}) {
  const next = error instanceof Error ? error : new Error(String(error));
  if (status) next.status = status;
  if (step) next.step = step;
  next.resumable = xaiHttpErrorResumable(next.status);
  if (upstream && typeof upstream === 'object') next.upstream = upstream;
  return next;
}

const UPSTREAM_MESSAGE_BANNED = /api[_-]?key|authorization|bearer|sk-[a-z0-9]/i;

export function sanitizeXaiUpstreamMessage(raw = '') {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text || UPSTREAM_MESSAGE_BANNED.test(text)) return '';
  return text.slice(0, 200);
}

async function readSanitizedXaiErrorMessage(response) {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      const msg = parsed?.error?.message || parsed?.message || parsed?.error || '';
      return sanitizeXaiUpstreamMessage(msg);
    } catch {
      return sanitizeXaiUpstreamMessage(text);
    }
  } catch {
    return '';
  }
}

export async function xaiResponsesWithRetry(request, {
  deadline = 0,
  maxAttempts = 6,
  minBackoffMs = 500,
} = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const timeoutMs = deadline > 0 ? Math.max(1000, deadline - Date.now()) : undefined;
    const response = await request(timeoutMs);
    if (response.ok || !RETRYABLE_XAI_STATUSES.has(response.status)) return response;
    if (attempt >= maxAttempts) return response;
    if (deadline > 0 && Date.now() >= deadline) return response;
    const waitMs = Math.max(
      minBackoffMs,
      parseRetryAfterMs(response, minBackoffMs * attempt),
    );
    if (deadline > 0 && Date.now() + waitMs >= deadline) return response;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export async function postDossierXai(dossier, step, model, content, { env, fetchImpl, timeoutMs, deadline = 0 } = {}) {
  const base = { model, input: [{ role: 'user', content }], text: { format: { type: 'json_object' } } };
  const effort = env.XAI_DOSSIER_REASONING_EFFORT || (ESCALATE_STEPS.has(step) ? '' : 'none');
  const call = (ms, payload) => postXaiPlaceRatingsResponses({ apiKey: env.XAI_API_KEY, fetchImpl, timeoutMs: ms, payload });
  let response = await xaiResponsesWithRetry(
    (ms) => call(ms, effort ? { ...base, reasoning: { effort } } : base),
    { deadline },
  );
  if (effort && response.status === 400) {
    response = await xaiResponsesWithRetry((ms) => call(ms, base), { deadline });
  }
  if (!response.ok) {
    logXaiUsage(dossier, step, model, {});
    const label = step === 'builder' ? 'builder' : step;
    const message = await readSanitizedXaiErrorMessage(response);
    throw attachDossierXaiHttpError(new Error(`dossier_${label}_http_${response.status}`), {
      step: label,
      status: response.status,
      upstream: {
        provider: 'xai',
        status: response.status,
        step: label,
        model,
        ...(message ? { message } : {}),
      },
    });
  }
  const payload = await response.json();
  const row = logXaiUsage(dossier, step, model, payload);
  row.promptChars = content.length;
  return payload;
}
