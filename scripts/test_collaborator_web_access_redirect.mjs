#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { collaboratorEulaAcceptUrl } from '../src/vacation/collaborators.mjs';
import { webAccessAcceptUrl, webAccessTokenHash } from '../src/vacation/web-access.mjs';
import { buildState, createHttpCaller, dbFor } from './fixtures/vacation-collaborator-accept-e2e-fixtures.mjs';

const env = {
  TIMESYNCHER_SITE_BASE_URL: 'https://vacation-staging.timesyncher.com/',
  TIMESYNCHER_TRAVEL_BASE_URL: 'https://travel.timesyncher.com/',
  TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'test-web-access-salt',
};

const saved = {};
for (const [key, value] of Object.entries(env)) {
  saved[key] = process.env[key];
  process.env[key] = value;
}

const { default: handler } = await import('../api/[...route].mjs');
const { useVacationAppDatabase } = await import('../routes/vacation-itinerary.mjs');
const call = createHttpCaller(handler);

const state = buildState({ withTrip: true, withInvite: true });
state.invites[0].metadata.email = 'alex@example.com';
const db = dbFor(state);
useVacationAppDatabase(db);

const inviteId = state.inviteId;
const token = 'collab-web-access-token';
const acceptUrl = webAccessAcceptUrl(token, env);
assert.match(acceptUrl, /\/api\/vacation-itinerary\?webAccess=1&action=accept&token=/);

state.webAccessGrants.push({
  id: crypto.randomUUID(),
  owner_customer_id: state.ownerCustomerId,
  trip_id: state.tripId,
  email: 'alex@example.com',
  role: 'web_editor',
  status: 'invited',
  invite_token_hash: webAccessTokenHash(token, env),
  metadata: { collaboratorInviteId: inviteId },
});

const acceptPath = acceptUrl.replace(/^https:\/\/[^/]+/, '');
const redirect = await call('GET', acceptPath);
assert.equal(redirect.statusCode, 302, redirect.body);
assert.equal(
  redirect.headers.location,
  collaboratorEulaAcceptUrl({ id: inviteId }, env),
);

for (const [key, value] of Object.entries(saved)) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

console.log('collaborator web access redirect tests passed');
