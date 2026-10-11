#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  resolveCheckITripTitle,
  checkITitleOk,
  runShepherdCheckI,
} from './shepherd-staging-smoke-check-i.mjs';

const REAL_TITLE = 'Maui March 10-17 2027 with my wife';

// --- resolveCheckITripTitle -------------------------------------------------

// Prefers the title already captured on state (check 5 succeeded).
assert.equal(
  await resolveCheckITripTitle({ tripTitle: REAL_TITLE, tripId: 'trip-1' }, null),
  REAL_TITLE,
);

// Falls back to the trips table when state.tripTitle is empty (check 5 early-returned).
const dbWithTitle = async (strings, ...values) => {
  const text = strings.join(' ').replace(/\s+/g, ' ').trim();
  assert.match(text, /select title from trips where id=/);
  assert.equal(values[0], 'trip-1');
  return [{ title: REAL_TITLE }];
};
assert.equal(
  await resolveCheckITripTitle({ tripTitle: '', tripId: 'trip-1' }, dbWithTitle),
  REAL_TITLE,
);

// Returns '' when there is no tripId to fall back on.
assert.equal(await resolveCheckITripTitle({ tripTitle: '' }, dbWithTitle), '');

// Returns '' when the trips table has no matching row.
const dbNoRow = async () => [];
assert.equal(
  await resolveCheckITripTitle({ tripTitle: '', tripId: 'trip-1' }, dbNoRow),
  '',
);

// --- checkITitleOk ----------------------------------------------------------

assert.equal(checkITitleOk(REAL_TITLE, `Shepherd e892e59 invited you to edit ${REAL_TITLE}`), true);
assert.equal(checkITitleOk(REAL_TITLE, 'Shepherd invited you to edit a trip'), false);
assert.equal(checkITitleOk(REAL_TITLE, ''), false);
assert.equal(checkITitleOk('', `subject with ${REAL_TITLE}`), false);

// --- runShepherdCheckI end-to-end (mocked db + fetch) -----------------------

// Build a mock db that answers the queries runShepherdCheckI issues. The trips
// table always holds the real title (independent of state.tripTitle, which is
// what check 5 may have failed to populate).
function makeDb({ dbTitle, subject }) {
  return async (strings, ...values) => {
    const text = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/select title from trips where id=/.test(text)) {
      return dbTitle ? [{ title: dbTitle }] : [];
    }
    if (/from vacation_collaborator_invites/.test(text)) {
      return [{ id: 'invite-1', trip_id: 'trip-1', status: 'pending', metadata: { email: 'alex@example.com' } }];
    }
    if (/from outbound_emails/.test(text)) {
      return [{
        id: 'out-1',
        status: 'stubbed',
        subject,
        to_email: 'alex@example.com',
        html_body: '<a href="/accept/vacation-collaborator-invite-1">accept</a>',
        text_body: '',
        metadata: {},
        error_summary: null,
        provider_message_id: null,
        provider: 'harness_stub',
      }];
    }
    if (/from customers where id=/.test(text)) {
      return [{ display_name: 'Shepherd e892e59', first_name: 'Shepherd' }];
    }
    throw new Error(`unexpected sql: ${text}`);
  };
}

async function runCheckIWith({ tripTitle, dbTitle, subject, stubOutbound = '1' }) {
  const prevFetch = globalThis.fetch;
  const prevStub = process.env.TIMESYNCHER_HARNESS_STUB_OUTBOUND;
  process.env.TIMESYNCHER_HARNESS_STUB_OUTBOUND = stubOutbound;
  globalThis.fetch = async () => ({
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });
  const out = {};
  const state = { session: 'sess-1', customerId: 'cust-1', tripId: 'trip-1', tripTitle };
  let result;
  try {
    await runShepherdCheckI(
      async (_name, fn) => {
        result = await fn({ setStage: () => {} });
        return result;
      },
      { out, db: makeDb({ dbTitle, subject }), state, INVITE_EMAIL: 'alex@example.com' },
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevStub === undefined) delete process.env.TIMESYNCHER_HARNESS_STUB_OUTBOUND;
    else process.env.TIMESYNCHER_HARNESS_STUB_OUTBOUND = prevStub;
  }
  return result;
}

// Check 5 early-returned (state.tripTitle empty): check I must still PASS by
// reading the title from the trips table and matching it in the subject.
const passWithDbFallback = await runCheckIWith({
  tripTitle: '',
  dbTitle: REAL_TITLE,
  subject: `Shepherd e892e59 invited you to edit ${REAL_TITLE}`,
});
assert.equal(passWithDbFallback.pass, true);

// Wrong/missing title in the subject must still FAIL check I.
const failWrongTitle = await runCheckIWith({
  tripTitle: '',
  dbTitle: REAL_TITLE,
  subject: 'Shepherd e892e59 invited you to edit a trip',
});
assert.equal(failWrongTitle.pass, false);

// A subject missing the real title must FAIL even when state.tripTitle is set.
const failMissingTitle = await runCheckIWith({
  tripTitle: REAL_TITLE,
  dbTitle: REAL_TITLE,
  subject: 'Shepherd e892e59 invited you to edit a trip',
});
assert.equal(failMissingTitle.pass, false);

console.log('shepherd check I trip-title fallback test passed');
