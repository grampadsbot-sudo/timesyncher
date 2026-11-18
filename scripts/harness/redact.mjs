import { createHash } from 'node:crypto';

export function shortHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

export function redactText(text, secrets = []) {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '');
    if (value.length > 8) out = out.split(value).join('[redacted]');
  }
  return out;
}

const HIDDEN_KEYS = new Set([
  'token',
  'session',
  'sessiontoken',
  'sessionid',
  'sharetoken',
  'publicslug',
  'publicurl',
  'authorization',
  'apikey',
  'password',
  'cookie',
  'accesstoken',
  'refreshtoken',
  'email',
]);

function redactString(value, secrets) {
  let text = redactText(value, secrets);
  text = text.replace(/https?:\/\/\S*\/shared\/\S*/gi, '[redacted-share]');
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  if (text.length > 500) text = `${text.slice(0, 500)}…`;
  return text;
}

function redactValue(value, secrets, depth) {
  if (depth > 6) return '[trimmed]';
  if (typeof value === 'string') return redactString(value, secrets);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactValue(item, secrets, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (HIDDEN_KEYS.has(key.toLowerCase())) out[key] = '[redacted]';
      else out[key] = redactValue(item, secrets, depth + 1);
    }
    return out;
  }
  return null;
}

export function redactExchangeBody(body, secrets = []) {
  const redacted = redactValue(body, secrets, 0);
  const text = JSON.stringify(redacted);
  if (text.length <= 6000) return redacted;
  return {
    ok: redacted?.ok ?? null,
    status: redacted?.status ?? null,
    error: redacted?.error ?? null,
    code: redacted?.code ?? null,
    modelId: redacted?.modelId ?? null,
    responseModel: redacted?.responseModel ?? null,
    trimmed: true,
  };
}
