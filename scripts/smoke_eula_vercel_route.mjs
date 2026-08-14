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
if (!html.includes('TimeSyncher has recorded your terms acceptance')) throw new Error('success message missing');
if (!html.includes('Continue to Telegram')) throw new Error('continue link missing');
if (html.includes('saved server-side')) throw new Error('server-side success text returned');
const collaboratorSession = await createOnboardingSessionPersistent(store, {
  sessionId: 'vacation-collaborator-11111111-1111-1111-1111-111111111111',
  clientKey: 'vacation-collaborator:11111111-1111-1111-1111-111111111111',
  clientLabel: 'Kimberly Giannini',
  contact: {},
  selectedFunctionality: ['telegram_collaborator_modify_access'],
  google: { returnUrl: 'https://t.me/TimeSyncherVacationBot?start=test-token' },
  eula: { version: '2026-06-terms-advisory-only', text: eulaText },
});
const collaboratorHtml = renderAcceptPage(collaboratorSession);
if (collaboratorHtml.includes('Your name')) throw new Error('collaborator accept page still asks for a name');
if (collaboratorHtml.includes("document.getElementById('name').value")) throw new Error('collaborator accept page reads a name input');
if (!collaboratorHtml.includes('fallbackName')) throw new Error('collaborator accept page does not use session identity fallback');
if (!collaboratorHtml.includes('closeTelegramWebView')) throw new Error('collaborator accept page does not attempt Telegram webview close');
console.log(JSON.stringify({ ok: true, sessionId: session.sessionId }, null, 2));
