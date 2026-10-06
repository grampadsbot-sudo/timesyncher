#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolvePaiaD2CustomerTurnId } from './shepherd-staging-smoke-lib.mjs';

const turnId = '757223c8-e4f6-42ea-b635-7a5e7d3557d0';
const resolved = resolvePaiaD2CustomerTurnId({
  dCustomerTurnIds: ['a', 'b', turnId],
  d2: { customerTurnId: null, requestId: 'req-d2' },
}, [
  { id: 'a', body: 'Maui March 10-17 2027', request_id: null },
  { id: 'b', body: "add Mama's Fish House", request_id: 'req-d1' },
  { id: turnId, body: 'save Paia Fish Market', request_id: 'req-d2' },
]);
assert.equal(resolved, turnId);

const fromIds = resolvePaiaD2CustomerTurnId({
  dCustomerTurnIds: ['a', 'b', turnId],
  d2: {},
}, []);
assert.equal(fromIds, turnId);

const existing = resolvePaiaD2CustomerTurnId({ d2: { customerTurnId: 'keep-me' } }, []);
assert.equal(existing, 'keep-me');

console.log('shepherd ask-d2 wiring tests passed');
