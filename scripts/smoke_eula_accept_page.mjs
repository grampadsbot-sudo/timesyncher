import { createOnboardingSession } from '../src/onboarding/eula-backend-core.mjs';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const store = 'tmp/eula-page-smoke-store';
rmSync(store, { recursive: true, force: true });
mkdirSync(store, { recursive: true });
const eulaText = readFileSync('public/legal/eula-2026-04-initial-draft.md', 'utf8');
createOnboardingSession(store, {
  sessionId: 'page-smoke',
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only' },
  eula: { version: '2026-04-initial-draft', text: eulaText },
});
const port = 4191;
const child = spawn(process.execPath, ['scripts/eula_acceptance_server.mjs'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TIMESYNCHER_ONBOARDING_STORE: store },
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 5000);
    child.stdout.on('data', () => { clearTimeout(t); resolve(); });
  });
  const page = await fetch(`http://127.0.0.1:${port}/accept/page-smoke`).then((r) => r.text());
  if (!page.includes('Your acceptance receipt was saved server-side. Thank you')) throw new Error('success text missing');
  if (page.includes('<pre id="receipt"')) throw new Error('client-facing JSON receipt pre is still present');
  const accept = await fetch(`http://127.0.0.1:${port}/api/onboarding/page-smoke/eula/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acceptedByName: 'C D', checkboxConfirmed: true }),
  }).then((r) => r.json());
  if (!accept.ok || !accept.receipt?.receiptSha256) throw new Error('server did not store receipt');
  console.log(JSON.stringify({ ok: true, receiptSha256: accept.receipt.receiptSha256 }, null, 2));
} finally {
  child.kill('SIGTERM');
}
