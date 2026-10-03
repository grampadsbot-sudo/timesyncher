#!/usr/bin/env node
import assert from 'node:assert/strict';
import { harnessOutboundEmailAllowed } from '../src/vacation/email.mjs';

const on = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '1' };
const off = { TIMESYNCHER_HARNESS_STUB_OUTBOUND: '0' };

assert.equal(harnessOutboundEmailAllowed('smoke-x@resend.dev', off), true);
assert.equal(harnessOutboundEmailAllowed('smoke-x@resend.dev', on), false);
assert.equal(harnessOutboundEmailAllowed('alex.rivera.sct@agentmail.to', on), true);
assert.equal(harnessOutboundEmailAllowed('kim.rivera.sct@agentmail.to', on), true);
assert.equal(harnessOutboundEmailAllowed('shepherd-abc1234-1700000000000@resend.dev', on), true);
assert.equal(harnessOutboundEmailAllowed('layout-abc1234-v0@resend.dev', on), false);

console.log(JSON.stringify({ ok: true, checked: 'harness-outbound-email-stub' }));
