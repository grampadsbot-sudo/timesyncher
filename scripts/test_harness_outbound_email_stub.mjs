#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  extractResendResponseMetadata,
  harnessOutboundEmailAllowed,
  outboundEmailPassesSmokeHarness,
  queueOrSendPurchaseEmail,
} from '../src/vacation/email.mjs';

const on = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1', RESEND_API_KEY: 're_test_key' };
const off = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '0' };

assert.equal(harnessOutboundEmailAllowed('smoke-x@resend.dev', off), true);
assert.equal(harnessOutboundEmailAllowed('smoke-x@resend.dev', on), false);
assert.equal(harnessOutboundEmailAllowed('alex.rivera.sct@agentmail.to', on), true);
assert.equal(harnessOutboundEmailAllowed('kim.rivera.sct@agentmail.to', on), true);
assert.equal(harnessOutboundEmailAllowed('shepherd-abc1234-1700000000000@resend.dev', on), true);
assert.equal(harnessOutboundEmailAllowed('layout-abc1234-v0@resend.dev', on), false);

const stubbedRow = {
  status: 'stubbed',
  provider: 'harness_stub',
  provider_message_id: null,
};
const smokeOutboundChecks = ['I', 'purchase', 'invite', 'CL'];
for (const check of smokeOutboundChecks) {
  assert.equal(outboundEmailPassesSmokeHarness(stubbedRow), false, `${check} must fail on stubbed row`);
}
assert.equal(outboundEmailPassesSmokeHarness({ status: 'sent', provider_message_id: 're_abc123' }), true);
assert.equal(outboundEmailPassesSmokeHarness({ status: 'sent', provider_message_id: '' }), false);
assert.equal(outboundEmailPassesSmokeHarness({ status: 'sent', provider_message_id: '   ' }), false);
assert.equal(outboundEmailPassesSmokeHarness({ status: 'failed', provider_message_id: 're_x' }), false);

const headers = new Headers({
  'x-resend-daily-quota': '42',
  'ratelimit-limit': '100',
  'ratelimit-remaining': '99',
  authorization: 'Bearer secret-should-not-persist',
});
const meta = extractResendResponseMetadata({ headers });
assert.equal(meta.resendDailyQuota, '42');
assert.deepEqual(meta.resendRatelimit, { 'ratelimit-limit': '100', 'ratelimit-remaining': '99' });
assert.equal(meta.authorization, undefined);

const queries = [];
const stubDb = async (strings, ...values) => {
  const sql = String.raw(strings, ...values);
  queries.push(sql);
  if (/from outbound_emails/i.test(sql)) return [];
  if (/insert into outbound_emails/i.test(sql)) {
    const metadataIdx = sql.indexOf('metadata');
    assert.ok(metadataIdx >= 0);
    return [{ id: 'email-stub-1' }];
  }
  if (/update onboarding_sessions/i.test(sql)) return [];
  return [];
};

const stubResult = await queueOrSendPurchaseEmail(stubDb, {
  customerId: 'cust-1',
  orderId: 'ord-1',
  session: { id: 'sess-1', token: 'tok-1' },
  contact: { email: 'harness-other@resend.dev', firstName: 'X' },
  onboardingUrl: 'https://example/onboard',
  vacationAppUrl: 'https://example/app',
}, on);
assert.equal(stubResult.status, 'stubbed');
assert.equal(outboundEmailPassesSmokeHarness({ status: stubResult.status, provider_message_id: null }), false);

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: false,
  status: 429,
  headers: new Headers({
    'x-resend-daily-quota': '0',
    'ratelimit-limit': '100',
    'ratelimit-remaining': '0',
  }),
  json: async () => ({ message: 'daily email sending quota exceeded' }),
});
try {
  const failQueries = [];
  const failDb = async (strings, ...values) => {
    const sql = String.raw(strings, ...values);
    failQueries.push({ sql, values });
    if (/from outbound_emails/i.test(sql)) return [];
    if (/insert into outbound_emails/i.test(sql)) return [{ id: 'email-fail-1' }];
    return [];
  };
  const failResult = await queueOrSendPurchaseEmail(failDb, {
    customerId: 'cust-2',
    orderId: 'ord-2',
    session: { id: 'sess-2', token: 'tok-2' },
    contact: { email: 'alex.rivera.sct@agentmail.to', firstName: 'Alex' },
    onboardingUrl: 'https://example/onboard',
    vacationAppUrl: 'https://example/app',
  }, { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '0', RESEND_API_KEY: 're_test_key' });
  assert.equal(failResult.status, 'failed');
  const insert = failQueries.find((row) => /insert into outbound_emails/i.test(row.sql));
  assert.ok(insert);
  const metadataArg = insert.values.find((v) => v && typeof v === 'object' && v.resendDailyQuota === '0');
  assert.ok(metadataArg, 'failed send must persist resendDailyQuota in metadata');
  assert.equal(metadataArg.resendRatelimit['ratelimit-remaining'], '0');
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({ ok: true, checked: 'harness-outbound-email-stub' }));
