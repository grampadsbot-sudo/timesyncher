#!/usr/bin/env node
import assert from 'node:assert/strict';
import { VERIFY_LAYOUT_STATE_MAP } from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout-chat-provision.mjs';

assert.equal(VERIFY_LAYOUT_STATE_MAP.v0, 'app-0-vacations');
assert.equal(VERIFY_LAYOUT_STATE_MAP.v1, 'app-1-no-site');
assert.equal(VERIFY_LAYOUT_STATE_MAP.v1site, 'app-1-with-site');
assert.equal(VERIFY_LAYOUT_STATE_MAP.v2, 'app-2-plus');
console.log('verify layout state map ok');
