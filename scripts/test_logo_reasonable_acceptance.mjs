import assert from 'node:assert/strict';
import { applyDiscoveredPageIcon } from '../src/vacation/intake-shared-place-source.mjs';
import { resolveThingLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { searchPlaceOutputViolations } from '../src/vacation/search-place-output.mjs';
import { effectiveCcabDeclaredLogoUrl } from './lib/nyc-ccab-declared-logo-recorded-lib.mjs';

const website = 'https://www.jetblue.com/';
const logoUrl = `${website}favicon.ico`;
const place = { name: 'JetBlue', category: 'flight', website, logoUrl };
assert.equal(resolveThingLogoUrl(place), logoUrl);
assert.equal(effectiveCcabDeclaredLogoUrl(place), logoUrl);
assert.ok(!searchPlaceOutputViolations(place).includes('missing_logoUrl'));
const thing = { website, metadata: { logoUrl, sourceRecord: { website } } };
await applyDiscoveredPageIcon(thing, { fetchImpl: async (url, options) => options.headers.accept === 'text/html'
  ? { ok: true, url: website, text: async () => '<html>JetBlue</html>' }
  : { ok: true, url: logoUrl, headers: new Headers({ 'content-type': 'image/x-icon' }) } });
assert.equal(thing.metadata.logoUrl, logoUrl);
assert.equal(thing.metadata.sourceRecord.logoUrl, logoUrl);
assert.equal(effectiveCcabDeclaredLogoUrl({ logoUrl: 'javascript:alert(1)' }), '');
assert.equal(effectiveCcabDeclaredLogoUrl({ logoUrl: 'https://www.google.com/s2/favicons?domain=jetblue.com' }), '');
assert.equal(resolveThingLogoUrl({ logoUrl: 'data:image/svg+xml,<svg/>' }), '');
const missing = { website, metadata: { sourceRecord: { website } } };
await applyDiscoveredPageIcon(missing, { fetchImpl: async () => ({ ok: false, status: 404 }) });
assert.equal(missing.metadata.logoUrl, undefined);
assert.equal(missing.metadata.logoCaptureReason, 'page_http_404');
console.log('reasonable logo acceptance: passes without provenance; banned, invented and broken images remain rejected');
