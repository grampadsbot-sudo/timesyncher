import { createOnboardingSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { LocalJsonStore } from '../src/onboarding/eula-persistent-store.mjs';
import { renderAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';
import { readFileSync } from 'node:fs';

const store = new LocalJsonStore('tmp/eula-route-smoke');
const eulaText = readFileSync('public/legal/terms-2026-06-advisory-only.md', 'utf8');
const session = await createOnboardingSessionPersistent(store, {
  sessionId: 'route-smoke',
  clientKey: 'telegram:6373624711',
  clientLabel: 'C D',
  contact: { email: 'test-customer@example.com', phone: '+15551234567' },
  selectedFunctionality: ['email_handling'],
  google: { accountEmail: 'test-customer@example.com', gmailPolicy: 'read_only' },
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
});
const html = renderAcceptPage(session);
if (!html.includes("/api/eula?action=accept&sessionId=route-smoke")) throw new Error('accept API target missing');
if (html.includes('<pre id="receipt"')) throw new Error('raw JSON receipt display returned');
if (!html.includes('Your acceptance receipt was saved server-side')) throw new Error('success message missing');
console.log(JSON.stringify({ ok: true, sessionId: session.sessionId }, null, 2));
