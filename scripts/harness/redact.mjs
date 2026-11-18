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
