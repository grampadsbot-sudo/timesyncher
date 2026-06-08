import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CURRENT_EULA_TEXT } from './current-eula-text.mjs';

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function validateSessionShape(session) {
  const missing = [];
  for (const field of ['sessionId', 'clientKey']) if (!session[field]) missing.push(field);
  if (!session.eula?.version) missing.push('eula.version');
  if (!session.eula?.text) missing.push('eula.text');
  if (!Array.isArray(session.selectedFunctionality)) missing.push('selectedFunctionality');
  if (missing.length) throw new Error(`session missing required fields: ${missing.join(', ')}`);
}

export function capabilitySnapshotFromSession(session) {
  return {
    selectedFunctionality: session.selectedFunctionality || [],
    google: session.google || {},
    contact: session.contact || {},
  };
}

export function sessionKey(sessionId) { return `sessions/${sessionId}.json`; }
export function receiptKey(sessionId) { return `receipts/${sessionId}.json`; }
export function acceptanceCopyKey(sessionId) { return `acceptance-copies/${sessionId}.html`; }

export async function createOnboardingSessionPersistent(store, input, now = new Date()) {
  const sessionId = input.sessionId || randomUUID();
  const session = {
    sessionId,
    clientKey: input.clientKey,
    clientLabel: input.clientLabel || input.clientKey,
    contact: input.contact || {},
    selectedFunctionality: input.selectedFunctionality || [],
    google: input.google || {},
    eula: input.eula,
    status: input.status || 'pending',
    createdAt: now.toISOString(),
    expiresAt: input.expiresAt || new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14).toISOString(),
  };
  validateSessionShape(session);
  await store.putJson(sessionKey(sessionId), session);
  return session;
}

export async function loadSessionPersistent(store, sessionId, now = new Date()) {
  const session = await store.getJson(sessionKey(sessionId));
  if (!session) return null;
  if (session.status === 'revoked') return { ...session, unavailableReason: 'revoked' };
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return { ...session, unavailableReason: 'expired' };
  return session;
}

export function buildAcceptanceReceipt({ session, acceptedByName, acceptedAt, ipAddress = '', userAgent = '' }) {
  validateSessionShape(session);
  if (!acceptedByName?.trim()) throw new Error('acceptedByName is required');
  const capabilitySnapshot = capabilitySnapshotFromSession(session);
  const receipt = {
    receiptId: randomUUID(),
    clientKey: session.clientKey,
    clientLabel: session.clientLabel,
    eula: {
      status: 'accepted',
      version: session.eula.version,
      acceptedAt: acceptedAt || new Date().toISOString(),
      acceptedByName: acceptedByName.trim(),
      acceptedByClientKey: session.clientKey,
      acceptanceMethod: 'hosted_onboarding_checkbox',
      acceptanceSource: `/accept/${session.sessionId}`,
      onboardingSessionId: session.sessionId,
      eulaTextSha256: sha256Hex(session.eula.text),
      capabilitySnapshotSha256: sha256Hex(stableJson(capabilitySnapshot)),
      ipAddress,
      userAgent,
    },
    capabilitySnapshot,
  };
  receipt.receiptSha256 = sha256Hex(stableJson(receipt));
  return receipt;
}

export function renderAcceptanceCopyHtml({ receipt, eulaText }) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>TimeSyncher EULA Acceptance ${esc(receipt.eula.version)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:40px;max-width:900px}.box{border:1px solid #ccc;padding:16px;border-radius:10px;background:#f8fafc}pre{white-space:pre-wrap}</style></head><body><h1>TimeSyncher EULA Acceptance Copy</h1><div class="box"><p><strong>Client:</strong> ${esc(receipt.clientLabel)} (${esc(receipt.clientKey)})</p><p><strong>Accepted by:</strong> ${esc(receipt.eula.acceptedByName)}</p><p><strong>Accepted at:</strong> ${esc(receipt.eula.acceptedAt)}</p><p><strong>EULA version:</strong> ${esc(receipt.eula.version)}</p><p><strong>EULA SHA-256:</strong> ${esc(receipt.eula.eulaTextSha256)}</p><p><strong>Receipt SHA-256:</strong> ${esc(receipt.receiptSha256)}</p></div><h2>Selected functionality snapshot</h2><pre>${esc(JSON.stringify(receipt.capabilitySnapshot, null, 2))}</pre><h2>Accepted EULA text</h2><pre>${esc(eulaText)}</pre></body></html>`;
}

export async function acceptEulaPersistent(store, sessionId, { acceptedByName, checkboxConfirmed, ipAddress = '', userAgent = '' }, now = new Date()) {
  if (!checkboxConfirmed) throw new Error('checkboxConfirmed is required');
  const session = await loadSessionPersistent(store, sessionId, now);
  if (!session) throw new Error('session not found');
  if (session.unavailableReason) throw new Error(`session ${session.unavailableReason}`);
  if (session.status !== 'pending') throw new Error(`session is not pending: ${session.status}`);
  const receipt = buildAcceptanceReceipt({ session, acceptedByName, acceptedAt: now.toISOString(), ipAddress, userAgent });
  const copyHtml = renderAcceptanceCopyHtml({ receipt, eulaText: session.eula.text });
  const receiptWrite = await store.putJson(receiptKey(sessionId), receipt);
  const copyWrite = await store.putText(acceptanceCopyKey(sessionId), copyHtml, 'text/html');
  await store.putJson(sessionKey(sessionId), { ...session, status: 'accepted', acceptedAt: receipt.eula.acceptedAt, receiptSha256: receipt.receiptSha256 });
  return { receipt, receiptWrite, acceptanceCopy: copyWrite };
}

export function validateReceiptForActivation({ session, receipt, requiredEulaVersion }) {
  const errors = [];
  if (!session) errors.push('session missing');
  if (!receipt) errors.push('receipt missing');
  if (errors.length) return { ok: false, errors };
  if (session.status !== 'accepted') errors.push('session is not accepted');
  if (receipt.eula?.status !== 'accepted') errors.push('receipt EULA is not accepted');
  if (receipt.eula?.version !== requiredEulaVersion) errors.push('receipt EULA version is stale or unexpected');
  if (receipt.eula?.eulaTextSha256 !== sha256Hex(session.eula.text)) errors.push('EULA text hash mismatch');
  const capabilitySnapshot = capabilitySnapshotFromSession(session);
  if (receipt.eula?.capabilitySnapshotSha256 !== sha256Hex(stableJson(capabilitySnapshot))) errors.push('capability snapshot hash mismatch');
  const copy = { ...receipt };
  const expected = copy.receiptSha256;
  delete copy.receiptSha256;
  if (expected !== sha256Hex(stableJson(copy))) errors.push('receipt hash mismatch');
  return { ok: errors.length === 0, errors, receiptSha256: expected };
}

export async function activationStatusPersistent(store, clientKey, requiredEulaVersion) {
  const sessions = (await store.listJson('sessions')).filter((s) => s.clientKey === clientKey).sort((a,b) => String(b.acceptedAt || b.createdAt || '').localeCompare(String(a.acceptedAt || a.createdAt || '')));
  for (const session of sessions) {
    const receipt = await store.getJson(receiptKey(session.sessionId));
    const validation = validateReceiptForActivation({ session, receipt, requiredEulaVersion });
    if (validation.ok) return { ok: true, clientKey, sessionId: session.sessionId, receiptSha256: validation.receiptSha256, requiredEulaVersion };
  }
  return { ok: false, clientKey, requiredEulaVersion, errors: ['no valid accepted EULA receipt found'] };
}

export function loadDefaultEulaText() {
  if (process.env.TIMESYNCHER_EULA_PATH) return readFileSync(process.env.TIMESYNCHER_EULA_PATH, 'utf8');
  try {
    return readFileSync('public/legal/eula-2026-04-initial-draft.md', 'utf8');
  } catch {
    return CURRENT_EULA_TEXT;
  }
}
