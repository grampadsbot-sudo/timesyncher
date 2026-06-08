const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const sessionId = params.get('session') || 'cd-review-current-eula';
let session;
let eulaText;

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function buildAcceptanceArtifact({ acceptedByName }) {
  const capabilitySnapshot = {
    selectedFunctionality: session.selectedFunctionality || [],
    google: session.google || {},
    contact: session.contact || {},
  };
  const eulaTextSha256 = await sha256Hex(eulaText);
  const capabilitySnapshotSha256 = await sha256Hex(stableJson(capabilitySnapshot));
  const receipt = {
    clientKey: session.clientKey,
    clientLabel: session.clientLabel,
    eula: {
      status: 'accepted',
      version: session.eula.version,
      acceptedAt: new Date().toISOString(),
      acceptedByName: acceptedByName.trim(),
      acceptedByClientKey: session.clientKey,
      acceptanceMethod: 'hosted_onboarding_checkbox',
      acceptanceSource: `/onboarding-eula.html?session=${session.sessionId}`,
      onboardingSessionId: session.sessionId,
      eulaTextSha256,
      capabilitySnapshotSha256,
      ipAddress: 'not-collected-local-static-test',
      userAgent: navigator.userAgent,
    },
    capabilitySnapshot,
  };
  return { ...receipt, receiptSha256: await sha256Hex(stableJson(receipt)) };
}

function renderAcceptanceCopyHtml({ receipt }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>TimeSyncher EULA Acceptance ${escapeHtml(receipt.eula.version)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.5;margin:40px;max-width:900px}.box{border:1px solid #ccc;padding:16px;border-radius:10px;background:#f8fafc}pre{white-space:pre-wrap}</style></head><body><h1>TimeSyncher EULA Acceptance Copy</h1><div class="box"><p><strong>Client:</strong> ${escapeHtml(receipt.clientLabel)} (${escapeHtml(receipt.clientKey)})</p><p><strong>Accepted by:</strong> ${escapeHtml(receipt.eula.acceptedByName)}</p><p><strong>Accepted at:</strong> ${escapeHtml(receipt.eula.acceptedAt)}</p><p><strong>EULA version:</strong> ${escapeHtml(receipt.eula.version)}</p><p><strong>EULA SHA-256:</strong> ${escapeHtml(receipt.eula.eulaTextSha256)}</p><p><strong>Receipt SHA-256:</strong> ${escapeHtml(receipt.receiptSha256)}</p></div><h2>Selected functionality snapshot</h2><pre>${escapeHtml(JSON.stringify(receipt.capabilitySnapshot, null, 2))}</pre><h2>Accepted EULA text</h2><pre>${escapeHtml(eulaText)}</pre></body></html>`;
}

function download(name, type, content) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  session = await fetch(`/onboarding/sessions/${encodeURIComponent(sessionId)}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load onboarding session ${sessionId}`);
    return r.json();
  });
  eulaText = await fetch(session.eula.path).then((r) => r.text());
  $('client').textContent = `${session.clientLabel} (${session.clientKey})`;
  $('contact').textContent = `${session.contact.email} · ${session.contact.phone}`;
  $('version').textContent = session.eula.version;
  $('features').innerHTML = session.selectedFunctionality.map((f) => `<li>${escapeHtml(f.replaceAll('_', ' '))}</li>`).join('');
  $('google').textContent = JSON.stringify(session.google, null, 2);
  $('eula').textContent = eulaText;
}

$('accept-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const acceptedByName = $('acceptedByName').value.trim();
  if (!$('agree').checked || !acceptedByName) return;
  const receipt = await buildAcceptanceArtifact({ acceptedByName });
  const receiptJson = JSON.stringify(receipt, null, 2);
  const copyHtml = renderAcceptanceCopyHtml({ receipt });
  $('receipt').textContent = receiptJson;
  $('result').hidden = false;
  $('download-json').onclick = () => download(`timesyncher-eula-receipt-${session.sessionId}.json`, 'application/json', receiptJson);
  $('download-copy').onclick = () => download(`timesyncher-eula-acceptance-copy-${session.sessionId}.html`, 'text/html', copyHtml);
  $('print-copy').onclick = () => {
    const win = window.open('', '_blank');
    win.document.write(copyHtml);
    win.document.close();
    win.print();
  };
});

init().catch((error) => {
  $('app').innerHTML = `<main class="card"><h1>Could not load onboarding</h1><p>${escapeHtml(error.message)}</p></main>`;
});
