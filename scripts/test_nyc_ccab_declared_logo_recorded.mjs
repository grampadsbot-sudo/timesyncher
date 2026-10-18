import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  discoverCcabLogoFromRecording,
  effectiveCcabDeclaredLogoUrl,
  listCcabLogoRecordings,
} from './lib/nyc-ccab-declared-logo-recorded-lib.mjs';

const ENRICHMENT = JSON.parse(
  readFileSync(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);
const OLD_ARTHOUSE_GUESS = 'https://www.arthousehotelnyc.com/favicon.ico';
const DECLARED = 'https://image-tc.galaxy.tf/wipng-diqogu9xx9dzdynxlmw6rahjm/favicon.png';

assert.ok(listCcabLogoRecordings().length >= 1, 'expected at least one ccab logo recording');

const arthouse = ENRICHMENT['Arthouse Hotel'];
assert.ok(arthouse, 'Arthouse Hotel enrichment row required');
assert.equal(arthouse.logoUrl, DECLARED);
assert.equal(arthouse.logoProvenance?.iconUrl, DECLARED);
assert.equal(arthouse.logoProvenance?.pageUrl, 'https://www.arthousehotelnyc.com/');
assert.equal(effectiveCcabDeclaredLogoUrl(arthouse), DECLARED);
assert.equal(effectiveCcabDeclaredLogoUrl({ ...arthouse, logoUrl: OLD_ARTHOUSE_GUESS, logoProvenance: undefined }), '');
assert.equal(
  effectiveCcabDeclaredLogoUrl({
    ...arthouse,
    logoUrl: OLD_ARTHOUSE_GUESS,
    logoProvenance: { pageUrl: arthouse.website, iconUrl: OLD_ARTHOUSE_GUESS },
  }),
  OLD_ARTHOUSE_GUESS,
);

for (const fileName of listCcabLogoRecordings()) {
  const discovered = await discoverCcabLogoFromRecording(fileName);
  const row = ENRICHMENT[discovered.ccabKey];
  assert.ok(row, `fixture row ${discovered.ccabKey}`);
  assert.equal(row.logoUrl, discovered.logoUrl);
  assert.deepEqual(row.logoProvenance, discovered.logoProvenance);
}

console.log('nyc ccab declared logo recorded tests passed');
