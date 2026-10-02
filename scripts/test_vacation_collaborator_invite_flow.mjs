import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  parseCollaboratorInviteTurn,
  runCollaboratorInviteAction,
  shouldRunCollaboratorInviteFromChat,
} from '../src/vacation/collaborator-invite-action.mjs';
import { createCollaboratorInvite } from '../src/vacation/collaborators.mjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';

const inviteJs = await readFile(new URL('../public/vacation-app-collaborator-invite.js', import.meta.url), 'utf8');
const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const api = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const queue = await readFile(new URL('../routes/vacation-app-chat-queue.mjs', import.meta.url), 'utf8');

assert.match(inviteJs, /action:\s*'collaborator-invite'/);
assert.doesNotMatch(inviteJs, /No vacation workspace is available yet/);
assert.match(`${vacationApp}\n${inviteJs}`, /timesyncher-open-collaborator-invite/);
assert.match(vacationApp, /collaboratorInviteDialog/);
assert.match(vacationApp, /collaboratorInviteOpen/);
assert.match(vacationApp, /join this vacation chat/);
assert.doesNotMatch(vacationApp, /!hasSite\s*&&\s*!state\.session\?\.seat/);
assert.match(vacationApp, /!state\.session\?\.seat/);
assert.match(sharedApp, /timesyncher-open-collaborator-invite/);
assert.match(api, /inviteResult/);
assert.match(api, /runCollaboratorInviteAction/);
assert.match(queue, /runVacationAppTurnActions/);
assert.match(queue, /turnActionResults/);

const parsed = parseCollaboratorInviteTurn('Please add Alex, alex@example.com to the trip.');
assert.equal(parsed.email, 'alex@example.com');
assert.equal(parsed.name, 'Alex');
assert.equal(shouldRunCollaboratorInviteFromChat('Please add Alex, alex@example.com to the trip.'), true);

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

const inviteCalls = [];
const inviteDb = async (strings, ...values) => {
  const sql = strings.join(' ');
  inviteCalls.push({ sql, values });
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
      trip_id: null,
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
assert.equal(sessionScoped.tripId, null);
assert.ok(inviteCalls.some((call) => /insert into vacation_collaborator_invites/i.test(call.sql) && call.values[1] == null));

await assert.rejects(
  () => createCollaboratorInvite(inviteDb, { ownerCustomerId: 'owner-1', tripId: '', metadata: {}, env: inviteEnv }),
  /onboardingSessionId/,
);

console.log('vacation collaborator invite flow passed');

