import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  PREVIEW_MAP_REL,
  PREVIEW_SCENARIOS,
  assertNoSecret,
  bypassSecretPresent,
  classifyObservation,
  extractFeatureMap,
  isSsoRedirect,
  matchScenario,
  observationsToHar,
  previewMapStable,
  sanitizeHar,
  sanitizeUrl,
  stripSecretQuery,
} from '../src/vacation/feature-map-preview.mjs';

const cwd = process.cwd();
const fixtureHar = JSON.parse(fs.readFileSync(path.join(cwd, 'features/fixtures/preview-map-sample.har.json'), 'utf8'));

assert.equal(isSsoRedirect(302, 'https://vercel.com/sso-api?url=https://example.vercel.app'), true);
assert.equal(isSsoRedirect(200, ''), false);
assert.equal(isSsoRedirect(307, '/'), false);

assert.equal(stripSecretQuery('?x-vercel-protection-bypass=secret&action=status'), '?action=status');
assert.equal(
  sanitizeUrl('https://example.vercel.app/api/eula?token=abc&action=status'),
  'https://example.vercel.app/api/eula?action=status',
);

const sanitized = sanitizeHar(fixtureHar);
const blob = JSON.stringify(sanitized);
assert.doesNotMatch(blob, /SHOULD-NEVER-EXTRACT/);
assert.equal(sanitized.log.entries[0].request.headers.length, 0);
assert.ok(!sanitized.log.entries[0].response.headers.some((row) => row.name === 'set-cookie'));
assert.doesNotMatch(sanitized.log.entries[0].request.url, /x-vercel-protection-bypass/);

const storefront = matchScenario('GET', 'https://timesyncher-git-cursor-vacatio-453141-grampads-boughts-projects.vercel.app/');
assert.equal(storefront.id, 'storefront');
const itinerary = matchScenario('GET', 'https://timesyncher-git-cursor-vacatio-453141-grampads-boughts-projects.vercel.app/api/vacation-itinerary');
assert.equal(itinerary.id, 'vacation-itinerary-missing-session');

const first = extractFeatureMap(fixtureHar);
const second = extractFeatureMap(fixtureHar);
assert.deepEqual(previewMapStable(first), previewMapStable(second));
assert.equal(first.extract_digest, second.extract_digest);
assert.equal(first.scenarios.find((row) => row.id === 'storefront').class, 'ok');
assert.equal(first.scenarios.find((row) => row.id === 'vacation-itinerary-missing-session').class, 'fail_closed');
assert.equal(first.scenarios.find((row) => row.id === 'addons-checkout').class, 'missing');
assert.doesNotMatch(JSON.stringify(first), /SHOULD-NEVER-EXTRACT/);

assert.equal(classifyObservation(
  { expect: { status: [200, 503] } },
  { status: 503, location: '' },
), 'env_gap');
assert.equal(classifyObservation(
  { expect: { status: [403], fail_closed: true } },
  { status: 403, location: '' },
), 'fail_closed');
assert.equal(classifyObservation(
  { expect: { status: [200] } },
  { status: 302, location: 'https://vercel.com/sso-api?url=x', auth_failure: true },
), 'auth_failure');

const features = new Set(PREVIEW_SCENARIOS.map((row) => row.feature));
for (const required of ['checkout', 'onboarding', 'telegram-messages', 'collaborator-edits', 'timeline-thing-media']) {
  assert.ok(features.has(required), `preview scenarios must include ${required}`);
}

const fakeObservations = first.scenarios
  .filter((row) => row.observed)
  .map((row) => ({
    method: row.method,
    path: row.path,
    status: row.observed.status,
    location: row.observed.location,
    content_type: row.observed.content_type,
    body_preview: row.observed.body_preview,
    auth_failure: false,
  }));
const rebuilt = extractFeatureMap(observationsToHar(fakeObservations));
assert.equal(rebuilt.scenarios.find((row) => row.id === 'storefront').class, 'ok');

assert.doesNotThrow(() => assertNoSecret('no secret here', { VERCEL_PROTECTION_BYPASS: 'abc123secret' }));
assert.throws(
  () => assertNoSecret('header abc123secret leaked', { VERCEL_PROTECTION_BYPASS: 'abc123secret' }),
  /secret leaked/,
);

const help = spawnSync(process.execPath, ['scripts/feature-map-preview.mjs', 'help'], { cwd, encoding: 'utf8' });
assert.equal(help.status, 0);
assert.match(help.stdout, /Never prints VERCEL_PROTECTION_BYPASS/);

const extractCli = spawnSync(process.execPath, [
  'scripts/feature-map-preview.mjs',
  'extract',
  '--har',
  'features/fixtures/preview-map-sample.har.json',
  '--no-persist',
  '--json',
], { cwd, encoding: 'utf8' });
assert.equal(extractCli.status, 1, 'partial fixture extract is not a full map pass');
assert.doesNotMatch(extractCli.stdout, /SHOULD-NEVER-EXTRACT/);
assert.doesNotMatch(extractCli.stderr, /SHOULD-NEVER-EXTRACT/);
const extracted = JSON.parse(extractCli.stdout);
assert.equal(extracted.map.scenarios.find((row) => row.id === 'storefront').class, 'ok');
assert.ok(extracted.evaluation.unexpected.includes('addons-checkout'));

assert.equal(PREVIEW_MAP_REL, 'features/preview-map.json');
assert.ok(bypassSecretPresent({ VERCEL_PROTECTION_BYPASS: 'x'.repeat(32) }));
assert.equal(bypassSecretPresent({}), false);

console.log('feature-map-preview unit tests passed');
