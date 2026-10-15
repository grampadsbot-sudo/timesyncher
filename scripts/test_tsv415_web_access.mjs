#!/usr/bin/env node
import assert from 'node:assert/strict';

import { requireWebEditAccess, webAccessTokenHash } from '../src/vacation/web-access.mjs';

const tripId = '11111111-1111-1111-1111-111111111111';
const realOwnerId = '22222222-2222-2222-2222-222222222222';
const forgedOwnerId = '33333333-3333-3333-3333-333333333333';
const env = { TIMESYNCHER_WEB_ACCESS_TOKEN_SALT: 'tsv415-test-salt' };

function makeDbStub({ sessionToken, role = 'web_editor', ownerCustomerId = realOwnerId }) {
  const sessionHash = webAccessTokenHash(sessionToken, env);
  return async (strings, ...values) => {
    const query = String(strings.raw ? strings.raw.join('?') : strings);
    if (/create table if not exists vacation_web_access_grants/i.test(query)) return [];
    if (/alter table vacation_web_access_grants/i.test(query)) return [];
    if (/create unique index if not exists vacation_web_access_active_email_idx/i.test(query)) return [];
    if (/from vacation_web_access_grants/i.test(query) && /session_token_hash/i.test(query)) {
      if (values.includes(sessionHash)) {
        return [{
          id: 'grant-1',
          trip_id: tripId,
          owner_customer_id: ownerCustomerId,
          role,
          email: role === 'owner' ? 'owner@example.com' : 'editor@example.com',
          status: 'accepted',
        }];
      }
      return [];
    }
    if (/from trips/i.test(query) && /customer_id/i.test(query)) {
      return [{ customer_id: realOwnerId }];
    }
    if (/update vacation_web_access_grants/i.test(query)) return [];
    throw new Error(`unexpected query in test db stub: ${query}`);
  };
}

await assert.rejects(
  () => requireWebEditAccess(makeDbStub({ sessionToken: 'unused' }), {
    headers: {
      'x-timesyncher-owner-customer-id': forgedOwnerId,
    },
  }, { tripId, ownerCustomerId: forgedOwnerId, env }),
  (error) => error.statusCode === 403,
  'forged owner header/body must not grant edit access',
);

const editorSession = 'accepted-editor-session';
const editorAccepted = await requireWebEditAccess(makeDbStub({ sessionToken: editorSession, role: 'web_editor' }), {
  headers: {
    cookie: `ts_vacation_web_access=${encodeURIComponent(editorSession)}`,
  },
}, { tripId, ownerCustomerId: forgedOwnerId, env });
assert.equal(editorAccepted.role, 'web_editor');

const mismatchedOwnerSession = 'mismatched-owner-session';
await assert.rejects(
  () => requireWebEditAccess(makeDbStub({
    sessionToken: mismatchedOwnerSession,
    role: 'owner',
    ownerCustomerId: forgedOwnerId,
  }), {
    headers: {
      cookie: `ts_vacation_web_access=${encodeURIComponent(mismatchedOwnerSession)}`,
    },
  }, { tripId, ownerCustomerId: forgedOwnerId, env }),
  (error) => error.statusCode === 403,
  'owner session must match the trip owner verified server-side',
);

const ownerSession = 'accepted-owner-session';
const ownerAccepted = await requireWebEditAccess(makeDbStub({ sessionToken: ownerSession, role: 'owner' }), {
  headers: {
    cookie: `ts_vacation_web_access=${encodeURIComponent(ownerSession)}`,
  },
}, { tripId, ownerCustomerId: forgedOwnerId, env });
assert.equal(ownerAccepted.role, 'owner', 'trip owner session must pass after server-side owner verification');

process.stdout.write('tsv415 web-access tests passed\n');
