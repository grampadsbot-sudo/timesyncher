import assert from 'node:assert/strict';
import { purchaseEmail, queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';

const tripId = '01234567-89ab-4cde-8f01-23456789abcd';
const sessionId = 'session-1';
const slug = 'intake-0123456789ab';
const site = 'https://vacation-staging.timesyncher.com';
const env = {
  RESEND_API_KEY: 'test-key',
  TIMESYNCHER_SITE_BASE_URL: site,
};

function mockDb({ slugValue = '' } = {}) {
  const queries = [];
  const db = (strings, ...values) => {
    const query = strings.join(' ');
    queries.push({ query, values });
    if (/from trips/i.test(query)) return [{ slug: slugValue }];
    if (/insert into outbound_emails/i.test(query) || /update outbound_emails/i.test(query)) return [{ id: 'email-1' }];
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
      publicSlug: '',
      publicUrl: '',
    }, env),
    (error) => {
      assert.equal(error.code, 'purchase_email_missing_share_token');
      assert.match(error.message, new RegExp(tripId));
      assert.match(error.message, new RegExp(sessionId));
      return true;
    },
  );
} finally {
  missingFetch.restore();
}
assert.equal(missingFetch.calls.length, 0);
assert.equal(outboundWrites(missing.queries).length, 0);

const bare = mockDb();
const bareFetch = spyFetch();
try {
  await assert.rejects(
    () => queueOrSendPurchaseEmail(bare.db, {
      contact: { email: 'ada@example.com', firstName: 'Ada' },
      tripId,
      session: { id: sessionId },
      publicSlug: '',
      publicUrl: `${site}/shared/`,
    }, env),
    (error) => {
      assert.match(error.message, new RegExp(tripId));
      assert.match(error.message, /share token/);
      return true;
    },
  );
} finally {
  bareFetch.restore();
}
assert.equal(bareFetch.calls.length, 0);
assert.equal(outboundWrites(bare.queries).length, 0);

const email = purchaseEmail({
  contact: { firstName: 'Ada' },
  publicSlug: slug,
  env,
});
assert.match(email.launchUrl, /\/shared\/intake-0123456789ab\/\?purchase=1$/);
assert.match(email.textBody, /\/shared\/intake-0123456789ab\/\?purchase=1/);
assert.doesNotMatch(email.launchUrl, /\/shared\/\?/);

const sent = mockDb();
const sentFetch = spyFetch();
let result;
try {
  result = await queueOrSendPurchaseEmail(sent.db, {
    contact: { email: 'ada@example.com', firstName: 'Ada' },
    tripId,
    session: { id: sessionId },
    publicSlug: slug,
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
assert.match(metadata.launchUrl, /\/shared\/intake-0123456789ab\/\?purchase=1$/);

console.log('purchase email slug passed');
