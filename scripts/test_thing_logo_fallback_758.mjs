#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { auditScheduledThingLogos, visibleLogoDomCheckSource } from '../src/vacation/shared-trip-logo-audit.mjs';
import { resolveThingLogoDisplayUrl } from '../src/vacation/thing-logo-capture.mjs';
import {
  buildExplicitLogoRepairBundleSnippet,
  logoFallbackChain,
  repairExplicitLogoUrl,
} from '../src/vacation/thing-logo-fallback-url.mjs';
import { liveAcceptScheduledLogoAudit } from '../apps/vacation-client/src/lib/liveAcceptLogoAudit.mjs';
import { runVisibleSharedLogoCheck } from './lib/shared-trip-visible-logo-check.mjs';
import { runGateBVisibleLogoCheck } from './ops/gateb/restore-check-visible-logos.mjs';

const fixturePath = new URL('./fixtures/gate-b-nyc-shared-staging.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

assert.match(
  repairExplicitLogoUrl('https://www.delta.com/favicon.ico'),
  /duckduckgo\.com\/ip3\/delta\.com\.ico/,
);
assert.match(buildExplicitLogoRepairBundleSnippet(), /function tsRepairExplicitLogoUrl/);
const repairFn = new Function(`${buildExplicitLogoRepairBundleSnippet()}; return tsRepairExplicitLogoUrl;`)();
assert.match(
  repairFn('https://www.hertz.com/favicon.ico'),
  /duckduckgo\.com\/ip3\/hertz\.com\.ico/,
);
assert.ok(logoFallbackChain('https://www.macys.com/favicon.ico', 'https://www.macys.com/').length >= 2);
assert.match(
  resolveThingLogoDisplayUrl(
    { id: 685, logoUrl: 'https://www.carminesnyc.com/favicon.ico', website: 'https://www.carminesnyc.com/' },
    { logoUrl: 'https://www.carminesnyc.com/favicon.ico' },
  ),
  /duckduckgo\.com\/ip3\/carminesnyc\.com\.ico/,
);

const audit = auditScheduledThingLogos(fixture);
const brokenIds = [604, 613, 616, 622, 623, 648, 649, 651, 658, 670];
for (const id of brokenIds) {
  const logoUrl = fixture.thingOverrides[`place:${id}`]?.logoUrl || '';
  assert.ok(logoUrl, `place ${id} missing logoUrl override`);
  assert.doesNotMatch(logoUrl, /\/favicon\.ico$/i, `place ${id} still bare favicon.ico`);
}
const scheduledBroken = [604, 613, 616];
for (const id of scheduledBroken) {
  const row = audit.rows.find((entry) => entry.id === id);
  assert.ok(row, `scheduled place ${id} missing from audit`);
  assert.equal(row.pass, true, `place ${id} still failing audit: ${row?.issues?.join(',')}`);
}

assert.match(visibleLogoDomCheckSource(), /question_glyph/);
assert.equal(typeof runVisibleSharedLogoCheck, 'function');
assert.equal(typeof runGateBVisibleLogoCheck, 'function');
const liveAccept = liveAcceptScheduledLogoAudit(fixture);
assert.equal(liveAccept.pass, true, `live accept logo audit failing: ${JSON.stringify(liveAccept.failing?.slice(0, 3))}`);

console.log('thing logo fallback + audit tests passed');
