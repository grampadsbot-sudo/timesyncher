#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  attachProviderLogAndMaybeFail,
  extractProviderLogRows,
  finalizeSmokeProviderLogSummary,
  formatProvider429HarnessMessage,
  isProviderHttp429,
  nominatimCacheHitCount,
  nominatimCallsPerSecondMax,
  nominatimOutboundHttpRows,
  providerCallTimestampMs,
  recordProviderCallsForCheck,
} from './shepherd-staging-smoke-provider-log.mjs';

assert.equal(isProviderHttp429({ httpStatus: 429 }), true);
assert.equal(isProviderHttp429({ reason: 'Nominatim geocode failed: HTTP 429 rate limit' }), true);
assert.equal(isProviderHttp429({ reason: 'ok' }), false);

const rows = extractProviderLogRows({
  placeSearch: {
    providerLog: [
      { provider: 'nominatim', status: 'error', httpStatus: 429, reason: 'HTTP 429', calledAtMs: 1000 },
      { provider: 'brave', status: 'ok', resultCount: 2, calledAtMs: 1005 },
    ],
  },
});
assert.equal(rows.length, 2);
assert.equal(rows[0].provider, 'nominatim');

const out = {};
const fail = attachProviderLogAndMaybeFail(out, '6', {
  placeSearch: { providerLog: [{ provider: 'nominatim', status: 'error', reason: 'HTTP 429 Too Many Requests', calledAtMs: 5000 }] },
}, { http: 201 });
assert.equal(fail?.harnessError, true);
assert.match(String(fail?.harnessMessage), /PROVIDER HTTP 429/);
assert.match(String(fail?.harnessMessage), /429/);
assert.equal(out.providerCallTimestamps.length, 1);

recordProviderCallsForCheck(out, 'H', {
  payload: {
    intakeLodgingLookup: [{ providers: [{ provider: 'nominatim', status: 'ok', calledAtMs: 5000, resultCount: 1 }] }],
  },
});
finalizeSmokeProviderLogSummary(out);
assert.equal(out.nominatimCallsPerSecondMax, 2);
assert.equal(out.nominatimCacheHits, 0);
assert.equal(out.nominatimOutboundHttpCalls, 2);
assert.equal(out.nominatimThrottleWaitMs, 0);

recordProviderCallsForCheck(out, '6b', {
  placeSearch: {
    providers: [{ provider: 'nominatim', status: 'ok', nominatimThrottleWaitMs: 250 }],
  },
});
finalizeSmokeProviderLogSummary(out);
assert.equal(out.nominatimThrottleWaitMs, 250);

assert.equal(nominatimCacheHitCount([
  { provider: 'nominatim', status: 'ok', resultCount: 1 },
  { provider: 'nominatim', status: 'skipped', reason: 'lodging_coordinates' },
]), 1);

assert.equal(nominatimOutboundHttpRows([
  { provider: 'nominatim', status: 'ok', calledAtMs: 1000 },
  { provider: 'nominatim', status: 'ok', resultCount: 1 },
]).length, 1);

assert.equal(nominatimCallsPerSecondMax([
  { provider: 'nominatim', calledAtMs: 1000 },
  { provider: 'nominatim', calledAtMs: 1500 },
  { provider: 'nominatim', calledAtMs: 2500 },
]), 2);

assert.equal(providerCallTimestampMs({ atMs: 42 }), 42);

const mainText = readFileSync(new URL('./shepherd-staging-smoke.mjs', import.meta.url), 'utf8');
assert.match(mainText, /registerBrowser,/);
const mapLogoRunText = readFileSync(new URL('./shepherd-staging-smoke-map-logo-run.mjs', import.meta.url), 'utf8');
assert.match(mapLogoRunText, /registerBrowser\(chrome\)/);

console.log(JSON.stringify({
  ok: true,
  sample429: formatProvider429HarnessMessage([{ check: 'M', provider: 'nominatim', reason: 'HTTP 429' }]),
}));
