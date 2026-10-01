import assert from 'node:assert/strict';
import { purchaseEmail, queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
const sessionId = 'session-1';
const sessionToken = 'app-session-token';
const site = 'https://vacation-staging.timesyncher.com';
const env = {
  RESEND_API_KEY: 'test-key',
  TIMESYNCHER_SITE_BASE_URL: site,
};

function mockDb() {
  const queries = [];
  const db = (strings, ...values) => {
    const query = strings.join(' ');
    queries.push({ query, values });
    if (/insert into outbound_emails/i.test(query) || /update outbound_emails/i.test(query)) return [{ id: 'email-1' }];
    if (/update onboarding_sessions/i.test(query)) return [];
    return [];
  };
  return { db, queries };
}

function spyFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ id: 'resend-1' }) };
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function outboundWrites(queries) {
  return queries.filter((row) => /outbound_emails/i.test(row.query));
}

const missing = mockDb();
const missingFetch = spyFetch();
try {
  await assert.rejects(
    () => queueOrSendPurchaseEmail(missing.db, {
      contact: { email: 'ada@example.com', firstName: 'Ada' },
      tripId,
      session: { id: sessionId },
      publicSlug: 'intake-0123456789ab',
      publicUrl: `${site}/shared/intake-0123456789ab/`,
    }, env),
    (error) => {
      assert.equal(error.code, 'purchase_email_missing_session');
      assert.match(error.message, new RegExp(tripId));
      assert.match(error.message, new RegExp(sessionId));
      assert.doesNotMatch(error.message, /\/shared\/intake-/);
      return true;
    },
  );
} finally {
  missingFetch.restore();
}
assert.equal(missingFetch.calls.length, 0);
assert.equal(outboundWrites(missing.queries).length, 0);

const email = purchaseEmail({
  contact: { firstName: 'Ada' },
  sessionToken,
  env,
});
assert.equal(email.launchUrl, `${site}/vacation-app.html?session=${encodeURIComponent(sessionToken)}`);
assert.match(email.textBody, new RegExp(`/vacation-app.html\\?session=${sessionToken}`));
assert.doesNotMatch(email.launchUrl, /\/shared\/intake-/);
assert.doesNotMatch(`${email.textBody}\n${email.htmlBody}`, /\/shared\/intake-/);

const sent = mockDb();
const sentFetch = spyFetch();
let result;
try {
  result = await queueOrSendPurchaseEmail(sent.db, {
    contact: { email: 'ada@example.com', firstName: 'Ada' },
    tripId,
    session: { id: sessionId, token: sessionToken },
    publicSlug: 'intake-0123456789ab',
    publicUrl: `${site}/shared/intake-0123456789ab/`,
    customerId: 'customer-1',
    orderId: 'order-1',
  }, env);
} finally {
  sentFetch.restore();
}
assert.equal(result.status, 'sent');
assert.equal(sentFetch.calls.length, 1);
const insert = sent.queries.find((row) => /insert into outbound_emails/i.test(row.query));
assert.ok(insert);
const metadata = insert.values.find((value) => value && value.launchUrl);
assert.equal(metadata.launchUrl, `${site}/vacation-app.html?session=${encodeURIComponent(sessionToken)}`);
assert.doesNotMatch(metadata.launchUrl, /\/shared\/intake-/);

console.log('purchase email slug passed');
