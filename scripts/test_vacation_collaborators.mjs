import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

import {
  collaboratorCheckoutCopy,
  collaboratorCraigMarkPaidClick,
  collaboratorDeniedCopy,
  collaboratorEulaAcceptUrl,
  collaboratorEulaClientKey,
  collaboratorEulaSessionId,
  collaboratorMarkPaidWithoutStripePath,
  collaboratorPlan,
  collaboratorStagingCardCheckoutAllowed,
  collaboratorTelegramLink,
  isCollaboratorInviteRequest,
} from '../src/vacation/collaborators.mjs';
import { brokerMintPaidCollaboratorInvite } from '../src/vacation/collaborator-broker.mjs';
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

assert.equal(collaboratorStagingCardCheckoutAllowed({ ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT: 'true' }), true);
assert.equal(
  collaboratorStagingCardCheckoutAllowed({ TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' }),
  true,
);
assert.equal(
  collaboratorStagingCardCheckoutAllowed({ TIMESYNCHER_SITE_BASE_URL: 'https://www.timesyncher.com' }),
  false,
);
assert.equal(
  collaboratorMarkPaidWithoutStripePath({ TIMESYNCHER_SITE_BASE_URL: 'https://www.timesyncher.com' }, 'TS-TEST'),
  'coupon_checkout',
);
assert.equal(
  collaboratorMarkPaidWithoutStripePath({ TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com' }, ''),
  'staging_card_checkout',
);
assert.equal(
  collaboratorMarkPaidWithoutStripePath({ TIMESYNCHER_SITE_BASE_URL: 'https://www.timesyncher.com' }, ''),
  null,
);
assert.match(collaboratorCraigMarkPaidClick(), /ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT=true/);
assert.match(collaboratorCraigMarkPaidClick(), /addons-checkout\.html/);

const stagingDryEnv = {
  TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot',
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com',
};
const dryPaid = await brokerMintPaidCollaboratorInvite(null, {
  dryRun: true,
  tripId: 'aba991d7-894f-4b4c-a548-cb7510581182',
  sessionToken: '6CTRnW4Ca2MW_bsj6hqJozxW',
  requestedFor: 'Kim Rivera',
  plan: 'single_trip',
}, stagingDryEnv);
assert.equal(dryPaid.ok, true);
assert.equal(dryPaid.dryRun, true);
assert.equal(dryPaid.paidVia, 'staging_card_checkout');
assert.equal(dryPaid.status, 'collaborator_staging_card_paid');
assert.equal(dryPaid.collaboratorInvite.requestedFor, 'Kim Rivera');
assert.equal(dryPaid.collaboratorInvite.tripId, 'aba991d7-894f-4b4c-a548-cb7510581182');
assert.match(
  dryPaid.collaboratorInvite.telegramUrl,
  /^https:\/\/t\.me\/TimeSyncherVacationStagingBot\?start=[^&]+$/,
);
assert.doesNotMatch(JSON.stringify(dryPaid), /TIMESYNCHER_ADMIN_TOKEN|sk_live_|sk_test_|Bearer /);

const dryBlocked = await brokerMintPaidCollaboratorInvite(null, {
  dryRun: true,
  tripId: 'aba991d7-894f-4b4c-a548-cb7510581182',
  requestedFor: 'Kim Rivera',
}, { TIMESYNCHER_TELEGRAM_BOT_USERNAME: 'TimeSyncherVacationStagingBot', TIMESYNCHER_SITE_BASE_URL: 'https://www.timesyncher.com' });
assert.equal(dryBlocked.ok, false);
assert.equal(dryBlocked.status, 'cannot_mint');
assert.equal(dryBlocked.missingFlag, 'ALLOW_COLLABORATOR_STAGING_CARD_CHECKOUT');
assert.match(dryBlocked.craigClick, /timesyncher-vacation-staging/);
assert.match(dryBlocked.collaboratorInvite.telegramUrl, /^https:\/\/t\.me\/TimeSyncherVacationStagingBot\?start=/);

const adminApi = await readFile(new URL('../api/admin-onboardings.mjs', import.meta.url), 'utf8');
assert.match(adminApi, /create-collaborator-invite/);
assert.match(adminApi, /brokerMintPaidCollaboratorInvite/);
const paymentApi = await readFile(new URL('../api/create-payment-intent.mjs', import.meta.url), 'utf8');
assert.match(paymentApi, /collaboratorStagingCardCheckoutAllowed/);
assert.match(paymentApi, /complete_staging_collaborator_checkout/);
const brokerScript = await readFile(new URL('./mint-staging-collaborator.mjs', import.meta.url), 'utf8');
assert.match(brokerScript, /create-collaborator-invite/);
assert.match(brokerScript, /TimeSyncherVacationStagingBot/);

console.log('vacation collaborator policy regression passed');
