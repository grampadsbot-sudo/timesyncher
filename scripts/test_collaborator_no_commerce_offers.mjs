import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { renderAcceptPage } from '../src/onboarding/eula-accept-page-render.mjs';
import { loadCollaboratorAppSeatEulaText, loadDefaultEulaText } from '../src/onboarding/eula-persistent-core.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { assertNoCollaboratorCommerceNeedles } from '../src/vacation/collaborator-commerce-gate.mjs';
import { firstIntakeReplyFacts } from '../src/vacation/first-intake-reply.mjs';
import { upsellFactsForTurn } from '../src/vacation/live-app-turn.mjs';
import { noTripStarterFacts } from '../src/vacation/no-trip-starter-reply.mjs';

const env = { TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat', TIMESYNCHER_SINGLE_NAME: 'Single trip', TIMESYNCHER_UNLIMITED_NAME: 'Unlimited year' };

const ownerEula = loadDefaultEulaText(env);
assert.match(ownerEula, /Checkout offers four plans/);

const collabEula = loadCollaboratorAppSeatEulaText(env);
assertNoCollaboratorCommerceNeedles(collabEula, 'collaborator-eula-text');
assert.match(collabEula, /Collaborator access/);

const acceptHtml = renderAcceptPage({
  sessionId: 'vacation-collaborator-test',
  clientKey: 'vacation-collaborator:invite-1',
  clientLabel: 'Alex',
  contact: { email: 'alex@example.com', phone: '' },
  selectedFunctionality: ['vacation_planning_onboarding', 'support_contact'],
  google: { returnUrl: 'https://example.com/vacation-app.html?session=tok' },
  eula: { version: '2026-06-terms-advisory-only', text: collabEula },
});
assertNoCollaboratorCommerceNeedles(acceptHtml, 'accept-page-collaborator');

const preWelcome = renderOnboardingWelcome({
  audience: 'collaborator_no_site',
  collabFirstName: 'Alex',
  ownerFirstName: 'Owner',
  tripTitle: 'this vacation',
});
const postWelcome = renderOnboardingWelcome({
  audience: 'collaborator',
  collabFirstName: 'Alex',
  ownerFirstName: 'Owner',
  tripTitle: 'Harbor Ridge Week',
  tripSiteUrl: 'https://www.timesyncher.com/v/harbor-ridge-neutral',
});
assertNoCollaboratorCommerceNeedles(preWelcome, 'welcome-pre-site');
assertNoCollaboratorCommerceNeedles(postWelcome, 'welcome-post-site');

const collabSession = { metadata: { seat: { role: 'collaborator', ownerCustomerId: 'owner-1', ownerOnboardingSessionId: 'sess-1', displayName: 'Alex' } } };
const noTripFacts = noTripStarterFacts({ customerTurn: 'When do we leave?', session: collabSession, ownerPlan: null });
assert.equal(noTripFacts.shape, 'no-trip-collaborator');
assertNoCollaboratorCommerceNeedles(JSON.stringify(noTripFacts), 'no-trip-starter-facts');

const intakeFacts = firstIntakeReplyFacts({
  customerTurn: 'We land Friday and want beach time.',
  tripTitle: 'Harbor Ridge Week',
  wantedThings: [{ name: 'Beach walk', kind: 'activity' }],
  roster: [{ name: 'Alex', role: 'collaborator' }],
  extractedDestination: 'Neutral Bay',
  savedStart: '2026-11-01',
  savedEnd: '2026-11-08',
  session: collabSession,
});
assertNoCollaboratorCommerceNeedles(JSON.stringify(intakeFacts), 'first-intake-facts');

assert.equal(upsellFactsForTurn('How much does this cost?', { collaboratorSeat: true, seatDollars: 25 }, false, null), null);

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(vacationApp, /collabSeat \? 'Agree to join this vacation chat.'/);
assert.doesNotMatch(vacationApp, /purchase email again in a moment\.'\)/);

console.log('collaborator no commerce offers passed');
