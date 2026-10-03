#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const verifyLayout = readFileSync(
  new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout.mjs', import.meta.url),
  'utf8',
);
assert.match(verifyLayout, /configureShepherdSmokeHelpers/);
assert.match(verifyLayout, /configureVerifyLayoutHarness/);
assert.match(verifyLayout, /TIMESYNCHER_TRAVEL_BASE_URL/);

const drive = readFileSync(
  new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout-chat-drive.mjs', import.meta.url),
  'utf8',
);
assert.match(drive, /existsSync\(shot\.viewportPath\)/);

const provision = readFileSync(
  new URL('../.cursor/skills/verify-timesyncher-vacation/scripts/verify-layout-chat-provision.mjs', import.meta.url),
  'utf8',
);
assert.match(provision, /mintVisualStateCustomers/);

console.log('verify layout harness configure tests passed');
