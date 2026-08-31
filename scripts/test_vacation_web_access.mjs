import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  publicTripUrl,
  readCookie,
  webAccessAcceptUrl,
  webAccessCookieHeader,
  webAccessCookieName,
  webAccessTelegramLaunchUrl,
  webAccessTokenHash,
} from '../src/vacation/web-access.mjs';
import { webEditorInviteEmail } from '../src/vacation/email.mjs';

const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://travel.timesyncher.com/',
  TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'test-salt',
};

assert.equal(
  webAccessAcceptUrl('abc 123', env),
  'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=accept&token=abc%20123',
);
assert.equal(
  webAccessTelegramLaunchUrl('telegram-session-token', 'https://travel.timesyncher.com/shared/las-vegas-strip-vacation/', env),
  'https://vacation-staging.timesyncher.com/api/vacation-web-access?action=telegram_launch&token=telegram-session-token&redirect=https%3A%2F%2Ftravel.timesyncher.com%2Fshared%2Flas-vegas-strip-vacation%2F',
);
assert.equal(webAccessTokenHash('token', env), webAccessTokenHash('token', env));
assert.notEqual(webAccessTokenHash('token', env), webAccessTokenHash('other', env));
assert.equal(webAccessCookieName(), 'ts_vacation_web_access');
assert.match(webAccessCookieHeader('session-token', env), /HttpOnly/);
assert.equal(readCookie({ headers: { cookie: 'a=1; ts_vacation_web_access=session-token; b=2' } }, webAccessCookieName()), 'session-token');
assert.equal(
  publicTripUrl({ metadata: { publicSlug: 'las-vegas-strip-vacation' } }, env),
  'https://travel.timesyncher.com/shared/las-vegas-strip-vacation/',
);

const email = webEditorInviteEmail({
  grant: {
    email: 'kim@example.com',
    display_name: 'Kim',
    owner_display_name: 'Craig',
    trip_title: 'Las Vegas Strip Vacation',
    public_url: 'https://travel.timesyncher.com/shared/las-vegas-strip-vacation/',
  },
  token: 'invite-token',
  env,
});
assert.match(email.subject, /Craig approved you to edit Las Vegas Strip Vacation/);
assert.match(email.textBody, /owner-approved email verification/i);
assert.match(email.textBody, /vacation-web-access\?action=accept/);

const migration = await readFile(new URL('../db/migrations/001_vacation_mvp.sql', import.meta.url), 'utf8');
assert.match(migration, /create table if not exists vacation_web_access_grants/);
assert.match(migration, /vacation_web_access_active_email_idx/);
assert.match(migration, /telegram_collaborator/);

const api = await readFile(new URL('../api/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(api, /create_web_editor_invite/);
assert.match(api, /telegram_launch/);
assert.match(api, /assert_can_edit/);
assert.match(api, /upload_audio_note/);
assert.match(api, /website_audio_note/);
assert.match(api, /transcribeWebsiteAudioNote/);
assert.match(api, /set-cookie/);
assert.match(api, /\\s\*\;\[\^,\;\]\*/);
const sharedAudioBridge = await readFile(new URL('../scripts/shared-audio-note-bridge.mjs', import.meta.url), 'utf8');
assert.match(sharedAudioBridge, /base64\\s\*/);
assert.match(sharedAudioBridge, /\\s\*\;\[\^,\;\]\*/);
assert.match(sharedAudioBridge, /I heard:/);
assert.match(sharedAudioBridge, /I could not find the matching itinerary item to change/);
assert.match(sharedAudioBridge, /splitTranscriptIntoEditRequests/);
assert.match(sharedAudioBridge, /audioNoteMultiResultMessage/);
assert.match(sharedAudioBridge, /partially_processed/);
assert.match(sharedAudioBridge, /check whether there is/);
assert.match(sharedAudioBridge, /trek-itinerary-edit\.mjs/);
assert.match(sharedAudioBridge, /trek-agent-edit\.mjs/);
assert.match(sharedAudioBridge, /deterministicError/);
assert.match(sharedAudioBridge, /transcript,\n\s+requests,/);
const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /vacation-web-access/);
assert.match(vercel, /webAccess=1/);

const itineraryHtml = await readFile(new URL('../itinerary.html', import.meta.url), 'utf8');
assert.match(itineraryHtml, /MediaRecorder/);
assert.match(itineraryHtml, /upload_audio_note/);
assert.match(itineraryHtml, /vacation-web-access\?action=status/);

const checkout = await readFile(new URL('../addons-checkout.html', import.meta.url), 'utf8');
assert.match(checkout, /name="planScope"/);
assert.match(checkout, /TimeSyncher Vacation Add-ons/i);
assert.doesNotMatch(checkout, /collaborator-checkout\.html/);
assert.match(checkout, /telegram_collaborators_unlimited_trips/);

const paymentApi = await readFile(new URL('../api/create-payment-intent.mjs', import.meta.url), 'utf8');
assert.match(paymentApi, /collaboratorInviteWithSelectedPlan/);
assert.match(paymentApi, /selectedPlanCode/);

console.log('vacation web access regression passed');
