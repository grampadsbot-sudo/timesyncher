import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  runCollaboratorInviteAction,
  shouldRunCollaboratorInviteFromChat,
} from '../src/vacation/collaborator-invite-action.mjs';
import { createCollaboratorInvite } from '../src/vacation/collaborators.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const queue = await readFile(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(vacationApp, /collaboratorInviteDialog/);
assert.doesNotMatch(vacationApp, /collaboratorInviteOpen/);
assert.doesNotMatch(vacationApp, /collaborator-invite-open/);
assert.doesNotMatch(vacationApp, /tsBindCollaboratorInvite/);
assert.doesNotMatch(vacationApp, /timesyncher-open-collaborator-invite/);
assert.doesNotMatch(sharedApp, /timesyncher-open-collaborator-invite/);
assert.doesNotMatch(sharedApp, /'Invite'/);
assert.match(api, /inviteResult/);
assert.match(api, /runCollaboratorInviteAction/);
assert.match(queue, /runVacationAppTurnActions/);
assert.match(queue, /turnActionResults/);

const classification = { inviteeName: 'Alex', inviteeEmail: 'alex@example.com' };
assert.equal(shouldRunCollaboratorInviteFromChat(classification), true);
assert.equal(shouldRunCollaboratorInviteFromChat(null), false);

const templates = JSON.parse(await readFile(new URL('../content/onboarding-welcome.json', import.meta.url), 'utf8'));
const collabWelcome = renderOnboardingWelcome({
  audience: 'collaborator_no_site',
  collabFirstName: 'Alex',
  ownerFirstName: 'Owner',
  tripTitle: 'Trip',
});
assert.equal(collabWelcome, templates.collaborator_no_site
  .replace('{collabFirstName}', 'Alex')
  .replace('{ownerFirstName}', 'Owner')
  .replace('{tripTitle}', 'Trip'));
assert.doesNotMatch(collabWelcome, /https?:\/\//);

const live = await readFile(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const turnActions = await readFile(new URL('../src/vacation/vacation-app-turn-actions.mjs', import.meta.url), 'utf8');
assert.match(live, /turnActionResults/);
assert.doesNotMatch(live, /tripFacts\.inviteResult/);
assert.match(turnActions, /results\.invite = inviteRow\(true/);

const shellTripId = 'trip-shell-workspace';
const inviteCalls = [];
const inviteDb = async (strings, ...values) => {
  const sql = strings.join(' ');
  inviteCalls.push({ sql, values });
  if (/from onboarding_sessions/i.test(sql) && /where id =/i.test(sql)) {
    return [{ id: 'session-1', trip_id: null, customer_id: 'owner-1', order_id: 'order-1' }];
  }
  if (/insert into trips/i.test(sql)) return [{ id: shellTripId }];
  if (/update onboarding_sessions/i.test(sql) && /set trip_id =/i.test(sql)) return [{ id: 'session-1' }];
  if (/update entitlements/i.test(sql) && /set trip_id =/i.test(sql)) return [{ id: 'ent-1' }];
  if (/from entitlements e/i.test(sql)) {
    return [{ id: 'ent-1', customer_id: 'owner-1', trip_id: null, plan: 'single', status: 'active', metadata: { product: 'timesyncher_vacation_single' } }];
  }
  if (/insert into vacation_collaborator_invites/i.test(sql)) {
    return [{
      id: 'invite-pre-trip',
      owner_customer_id: values[0],
      trip_id: values[1],
      metadata: values[7],
    }];
  }
  if (/insert into vacation_web_access_grants/i.test(sql)) throw new Error('web grant should not run pre-trip');
  if (/from vacation_collaborator_invites i/i.test(sql) && /where i\.id/i.test(sql)) {
    return [{
      id: 'invite-pre-trip',
      owner_customer_id: 'owner-1',
      trip_id: shellTripId,
      requested_for: 'Alex',
      owner_display_name: 'Owner',
      owner_email: 'owner@example.com',
      metadata: { onboardingSessionId: 'session-1' },
    }];
  }
  if (/from outbound_emails/i.test(sql)) return [];
  if (/insert into outbound_emails/i.test(sql)) return [{ id: 'email-1' }];
  if (/from trips/i.test(sql)) return [];
  return [];
};
inviteDb.transaction = async (fn) => fn(inviteDb);

const inviteEnv = {
  ...process.env,
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: process.env.TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS || '2500',
};
const sessionScoped = await runCollaboratorInviteAction(inviteDb, {
  session: { id: 'session-1', customer_id: 'owner-1', trip_id: null },
  name: 'Alex',
  email: 'alex@example.com',
  env: inviteEnv,
});
assert.equal(sessionScoped.ok, true);
assert.equal(sessionScoped.tripId, shellTripId);
assert.ok(inviteCalls.some((call) => /insert into vacation_collaborator_invites/i.test(call.sql) && call.values[1] === shellTripId));

await assert.rejects(
  () => createCollaboratorInvite(inviteDb, { ownerCustomerId: 'owner-1', tripId: '', metadata: {}, env: inviteEnv }),
  /onboardingSessionId/,
);

console.log('vacation collaborator invite flow passed');
