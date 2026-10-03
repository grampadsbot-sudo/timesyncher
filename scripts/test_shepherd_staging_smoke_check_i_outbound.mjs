#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  checkIOutboundPassesSmokeHarness,
  evaluateCheckIOutbound,
  isBeforeUtcResendDailyReset,
} from './shepherd-staging-smoke-env.mjs';

const stubEnv = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1' };
assert.equal(checkIOutboundPassesSmokeHarness({ status: 'stubbed', provider: 'harness_stub' }, stubEnv), true);
assert.equal(checkIOutboundPassesSmokeHarness({ status: 'stubbed', provider: '' }, stubEnv), false);

const stubOk = evaluateCheckIOutbound({
  row: { status: 'stubbed', provider: 'harness_stub' },
  env: stubEnv,
});
assert.equal(stubOk.pass, true);
assert.equal(stubOk.infraBlocked, false);

const stubMissingProvider = evaluateCheckIOutbound({
  row: { status: 'stubbed', provider: '' },
  env: stubEnv,
});
assert.equal(stubMissingProvider.pass, false);
assert.equal(stubMissingProvider.infraBlocked, true);

const liveEnv = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '0' };
const realSend = evaluateCheckIOutbound({
  row: { status: 'sent', provider: 'resend', provider_message_id: 'abc' },
  env: liveEnv,
  now: new Date('2026-10-03T15:00:00.000Z'),
});
assert.equal(realSend.pass, false);
assert.equal(realSend.infraBlocked, true);
assert.equal(realSend.reason, 'real_resend_before_utc_reset');

assert.equal(isBeforeUtcResendDailyReset(new Date('2026-10-03T00:00:00.000Z')), false);
assert.equal(isBeforeUtcResendDailyReset(new Date('2026-10-03T00:00:01.000Z')), true);

const checkIText = await import('node:fs').then((fs) => fs.readFileSync(new URL('./shepherd-staging-smoke-check-i.mjs', import.meta.url), 'utf8'));
assert.match(checkIText, /provider_message_id, provider from outbound_emails/);
assert.match(checkIText, /evaluateCheckIOutbound/);

console.log('shepherd check I outbound test passed');
