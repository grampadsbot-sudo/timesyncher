import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const unitedKey = 'Flight option: United LAS-EWR 2026-06-23 07:00-15:00';
const united = ENRICHMENT[unitedKey];
assert.ok(united, 'United LAS-EWR ccab row required for flight-logo boundary');
assert.match(String(united.logoUrl || ''), /united\.com\/favicon\.ico$/i);
assert.equal(united.logoProvenance, undefined);
assert.equal(effectiveCcabDeclaredLogoUrl(united), '');

for (const fileName of listCcabLogoRecordings()) {
  const discovered = await discoverCcabLogoFromRecording(fileName);
  const row = ENRICHMENT[discovered.ccabKey];
  assert.ok(row, `fixture row ${discovered.ccabKey}`);
  assert.equal(row.logoUrl, discovered.logoUrl);
  assert.deepEqual(row.logoProvenance, discovered.logoProvenance);
}

const RECORDED_DIR = fileURLToPath(new URL('./fixtures/recorded-ccab-logo-pr481-gate-b', import.meta.url));
const tamperDir = mkdtempSync(join(tmpdir(), 'ccab-logo-tamper-'));
const tamperManifest = JSON.parse(readFileSync(join(RECORDED_DIR, '2026-10-18T094200Z-zabars.json'), 'utf8'));
writeFileSync(join(tamperDir, '2026-10-18T094200Z-zabars.json'), JSON.stringify(tamperManifest));
for (const file of [
  tamperManifest.pageBodyFile,
  tamperManifest.pageResponseFile,
  tamperManifest.iconBodyFile,
  tamperManifest.iconResponseFile,
]) {
  writeFileSync(join(tamperDir, file), readFileSync(join(RECORDED_DIR, file)));
}
const iconPath = join(tamperDir, tamperManifest.iconBodyFile);
const iconBytes = readFileSync(iconPath);
iconBytes[0] ^= 0xff;
writeFileSync(iconPath, iconBytes);
await assert.rejects(
  () => discoverCcabLogoFromRecording('2026-10-18T094200Z-zabars.json', { rootDir: tamperDir }),
  /icon body sha mismatch/,
  'tampered icon bytes must fail before discovery',
);
const tamperHtmlDir = mkdtempSync(join(tmpdir(), 'ccab-logo-tamper-html-'));
writeFileSync(join(tamperHtmlDir, '2026-10-18T094200Z-zabars.json'), JSON.stringify(tamperManifest));
for (const file of [
  tamperManifest.pageBodyFile,
  tamperManifest.pageResponseFile,
  tamperManifest.iconBodyFile,
  tamperManifest.iconResponseFile,
]) {
  writeFileSync(join(tamperHtmlDir, file), readFileSync(join(RECORDED_DIR, file)));
}
const pagePath = join(tamperHtmlDir, tamperManifest.pageBodyFile);
const pageBytes = readFileSync(pagePath);
pageBytes[0] ^= 0xff;
writeFileSync(pagePath, pageBytes);
await assert.rejects(
  () => discoverCcabLogoFromRecording('2026-10-18T094200Z-zabars.json', { rootDir: tamperHtmlDir }),
  /page body sha mismatch/,
  'tampered page html must fail before discovery',
);

console.log('nyc ccab declared logo recorded tests passed');
