#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  stateIdFromSnapshot,
} from '../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout-shared-helpers.mjs';

const composer = { composer: true, options: 0, headerVisible: false, hasSite: false };
assert.equal(stateIdFromSnapshot({ vacationCount: 0, hasSite: false }, composer), 'app-0-vacations');
assert.equal(stateIdFromSnapshot({ vacationCount: 1, hasSite: false }, composer), 'app-1-no-site');
assert.equal(stateIdFromSnapshot({ vacationCount: 1, hasSite: true }, { ...composer, hasSite: true }), 'app-1-with-site');
assert.equal(stateIdFromSnapshot({ vacationCount: 2, hasSite: false }, { ...composer, headerVisible: true }), 'app-2-plus');

console.log('verify-layout vacation snapshot state test passed');
