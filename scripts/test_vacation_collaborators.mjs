import assert from 'node:assert/strict';

import {
  collaboratorCheckoutCopy,
  collaboratorDeniedCopy,
  collaboratorEulaAcceptUrl,
  collaboratorEulaClientKey,
  collaboratorEulaSessionId,
  collaboratorPlan,
  collaboratorTelegramLink,
  isCollaboratorInviteRequest,
} from '../src/vacation/collaborators.mjs';
import { collaboratorInviteEmail as buildCollaboratorInviteEmail } from '../src/vacation/email.mjs';

assert.equal(collaboratorPlan('single_trip').code, 'telegram_collaborators_single_trip');
assert.equal(collaboratorPlan('single_trip').amountCents, 1500);
assert.equal(collaboratorPlan('single_trip').maxActiveCollaborators, 1);
assert.equal(collaboratorPlan('unlimited_trips').amountCents, 2700);
assert.equal(collaboratorPlan('unlimited_trips').maxActiveCollaborators, 1);
assert.equal(isCollaboratorInviteRequest('Add my wife to the Caldwell vacation so she can update it in Telegram'), true);
assert.equal(isCollaboratorInviteRequest('I want to give my wife the ability to interact and change the vacation just like I am doing.'), true);
assert.equal(isCollaboratorInviteRequest('Can you send me the link to set her up?'), true);
assert.equal(isCollaboratorInviteRequest('Please make a checkout link to set Kim up'), true);
assert.equal(isCollaboratorInviteRequest('Please add 3 restaurants to day two'), false);
assert.equal(isCollaboratorInviteRequest('Can you send me the link to the Vegas vacation?'), false);

const checkoutCopy = collaboratorCheckoutCopy();
assert.match(checkoutCopy, /\$27/);
assert.doesNotMatch(checkoutCopy, /\$37/);
assert.match(checkoutCopy, /One vacation: \$15/);
assert.match(checkoutCopy, /All vacations: \$27/);
assert.match(checkoutCopy, /owner-approved email magic link/i);

const deniedCopy = collaboratorDeniedCopy();
assert.match(deniedCopy, /not authorized/i);
assert.match(deniedCopy, /paid Telegram collaborator/i);

const invite = { id: '11111111-1111-1111-1111-111111111111' };
assert.equal(collaboratorEulaSessionId(invite), 'vacation-collaborator-11111111-1111-1111-1111-111111111111');
assert.equal(collaboratorEulaClientKey(invite), 'vacation-collaborator:11111111-1111-1111-1111-111111111111');
assert.equal(
  collaboratorEulaAcceptUrl(invite, { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/' }),
  'https://vacation-staging.timesyncher.com/accept/vacation-collaborator-11111111-1111-1111-1111-111111111111',
);
assert.equal(
  collaboratorTelegramLink('abc 123', { TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot' }),
  'https://t.me/TimeSyncherVacationStagingBot?start=abc%20123',
);

const email = buildCollaboratorInviteEmail({
  contact: { firstName: 'Kim', email: 'kim@example.com' },
  invite: {
    requested_for: 'Kim',
    owner_display_name: 'Craig',
    trip_title: 'Caldwell vacation',
  },
  token: 'invite-token',
  env: { TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot' },
});
assert.match(email.subject, /Craig invited you to help with Caldwell vacation/);
assert.match(email.textBody, /Craig invited you to join Caldwell vacation/);
assert.match(email.textBody, /https:\/\/t\.me\/TimeSyncherVacationStagingBot\?start=invite-token/);

console.log('vacation collaborator policy regression passed');
