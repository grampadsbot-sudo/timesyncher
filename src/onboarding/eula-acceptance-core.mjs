import { createHash } from 'node:crypto';

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function browserSha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildAcceptanceArtifact({ session, eulaText, acceptedByName, acceptedByClientKey, acceptedAt, userAgent = '', ipAddress = 'not-collected-local-static-test' }) {
  if (!session?.sessionId) throw new Error('session.sessionId is required');
  if (!session?.eula?.version) throw new Error('session.eula.version is required');
  if (!eulaText || typeof eulaText !== 'string') throw new Error('eulaText is required');
  if (!acceptedByName || !acceptedByName.trim()) throw new Error('acceptedByName is required');

  const eulaTextSha256 = sha256Hex(eulaText);
  const capabilitySnapshot = {
    selectedFunctionality: session.selectedFunctionality || [],
    google: session.google || {},
    contact: session.contact || {},
  };
  const capabilitySnapshotSha256 = sha256Hex(stableJson(capabilitySnapshot));
  const baseReceipt = {
    clientKey: session.clientKey,
    clientLabel: session.clientLabel,
    eula: {
      status: 'accepted',
      version: session.eula.version,
      acceptedAt,
      acceptedByName: acceptedByName.trim(),
      acceptedByClientKey: acceptedByClientKey || session.clientKey,
      acceptanceMethod: 'hosted_onboarding_checkbox',
      acceptanceSource: `/onboarding/eula.html?session=${session.sessionId}`,
      onboardingSessionId: session.sessionId,
      eulaTextSha256,
      capabilitySnapshotSha256,
      ipAddress,
      userAgent,
    },
    capabilitySnapshot,
  };
  const receiptSha256 = sha256Hex(stableJson(baseReceipt));
  return { ...baseReceipt, receiptSha256 };
}

export function renderAcceptanceCopyHtml({ receipt, eulaText }) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><title>TimeSyncher EULA Acceptance ${esc(receipt.eula.version)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:40px;max-width:900px}.box{border:1px solid #ccc;padding:16px;border-radius:10px;background:#f8fafc}pre{white-space:pre-wrap}</style></head><body><h1>TimeSyncher EULA Acceptance Copy</h1><div class="box"><p><strong>Client:</strong> ${esc(receipt.clientLabel)} (${esc(receipt.clientKey)})</p><p><strong>Accepted by:</strong> ${esc(receipt.eula.acceptedByName)}</p><p><strong>Accepted at:</strong> ${esc(receipt.eula.acceptedAt)}</p><p><strong>EULA version:</strong> ${esc(receipt.eula.version)}</p><p><strong>EULA SHA-256:</strong> ${esc(receipt.eula.eulaTextSha256)}</p><p><strong>Receipt SHA-256:</strong> ${esc(receipt.receiptSha256)}</p></div><h2>Selected functionality snapshot</h2><pre>${esc(JSON.stringify(receipt.capabilitySnapshot, null, 2))}</pre><h2>Accepted EULA text</h2><pre>${esc(eulaText)}</pre></body></html>`;
}
