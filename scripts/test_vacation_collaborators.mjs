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
import { collaboratorInviteEmail as buildCollaboratorInviteEmail, collaboratorInviteTargets } from '../src/vacation/email.mjs';

const priceEnv = {
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '1500',
};
assert.equal(collaboratorPlan('single_trip', priceEnv).code, 'telegram_collaborators_single_trip');
assert.equal(collaboratorPlan('single_trip', priceEnv).amountCents, 1500);
assert.equal(collaboratorPlan('single_trip', priceEnv).maxActiveCollaborators, 1);
assert.throws(() => collaboratorPlan('single_trip', {}), (error) => error?.name === 'CheckoutConfigError');
assert.throws(() => collaboratorPlan('unlimited_trips', {}), (error) => error?.name === 'CheckoutConfigError');
assert.equal(collaboratorPlan('unlimited_trips', priceEnv).amountCents, 1900);
assert.equal(collaboratorPlan('unlimited_trips', priceEnv).maxActiveCollaborators, 1);
assert.equal(isCollaboratorInviteRequest('Add my wife to the Caldwell vacation so she can update it in Telegram'), true);
assert.equal(isCollaboratorInviteRequest('I want to give my wife the ability to interact and change the vacation just like I am doing.'), true);
assert.equal(isCollaboratorInviteRequest('Can you send me the link to set her up?'), true);
assert.equal(isCollaboratorInviteRequest('Please make a checkout link to set her up'), true);
assert.equal(isCollaboratorInviteRequest('Please make a checkout link to set Kim up'), false);
assert.equal(isCollaboratorInviteRequest('Please add 3 restaurants to day two'), false);
assert.equal(isCollaboratorInviteRequest('Can you send me the link to the Vegas vacation?'), false);

const checkoutCopy = collaboratorCheckoutCopy({ env: priceEnv });
assert.equal(checkoutCopy.ask, 'collaborator_checkout');
assert.equal(checkoutCopy.singleTrip.cents, 1500);
assert.equal(checkoutCopy.unlimitedTrips.cents, 1900);
assert.equal(JSON.stringify(checkoutCopy).includes('$'), false);

const deniedCopy = collaboratorDeniedCopy();
assert.equal(deniedCopy.ask, 'collaborator_denied');
assert.equal(deniedCopy.authorized, false);

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
assert.equal(
  collaboratorTelegramLink('abc', { TIMESYNCHER_TELEGRAM_BOT_USERNAME: '"TimeSyncherVacationStagingBot\\n"' }),
  'https://t.me/TimeSyncherVacationStagingBot?start=abc',
);

const email = buildCollaboratorInviteEmail({
  contact: { firstName: 'Kim', email: 'kim@example.com' },
  invite: {
    requested_for: 'Kim',
    owner_display_name: 'Craig',
    trip_title: 'Caldwell vacation',
  },
  token: 'invite-token',
  acceptUrl: 'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=accept&token=invite-token',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-example/',
  env: { TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot' },
});
assert.match(email.subject, /Craig invited you to edit Caldwell vacation/);
assert.match(email.textBody, /View access/);
assert.match(email.textBody, /Edit access/);
assert.match(email.textBody, /approved email invite/);
assert.match(email.textBody, /vacation-web-access\?action=accept/);
assert.doesNotMatch(email.textBody, /t\.me/);
assert.doesNotMatch(email.htmlBody, /Telegram/);
assert.match(email.htmlBody, /Open the approved email invite/);
assert.match(email.htmlBody, /word-break:break-all/);
assert.match(email.htmlBody, />https:\/\/vacation-staging\.timesyncher\.com\/api\/vacation-web-access\?action=accept&token=invite-token</);
assert.match(email.htmlBody, />https:\/\/vacation-staging\.timesyncher\.com\/shared\/intake-example\/</);
const filled = collaboratorInviteTargets({
  invite: { id: 'invite-1' },
  trip: { metadata: { publicSlug: 'intake-example' } },
  env: { TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' },
});
assert.match(filled.acceptUrl, /https:\/\/vacation-staging\.timesyncher\.com\/accept\/vacation-collaborator-invite-1$/);
assert.equal(filled.publicUrl, 'https://vacation-staging.timesyncher.com/shared/intake-example/');
const kept = collaboratorInviteTargets({
  acceptUrl: 'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=accept&token=invite-token',
  publicUrl: 'https://vacation-staging.timesyncher.com/shared/intake-example/',
  invite: { id: 'invite-1' },
});
assert.match(kept.acceptUrl, /action=accept&token=invite-token$/);

console.log('vacation collaborator policy regression passed');
