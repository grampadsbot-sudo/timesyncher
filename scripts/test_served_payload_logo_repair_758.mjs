import assert from 'node:assert/strict';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const cases = [
  [604, 'https://statuecitycruises.com/favicon.ico', 'statuecitycruises.com'],
  [613, 'https://www.macys.com/favicon.ico', 'macys.com'],
  [651, 'https://www.delta.com/favicon.ico', 'delta.com'],
  [710, 'https://www.hertz.com/favicon.ico', 'hertz.com'],
];
const shared = {
  places: cases.map(([id, logo]) => ({ id, name: `Thing ${id}`, logoUrl: logo })),
  thingOverrides: Object.fromEntries(cases.map(([id, logo]) => [`place:${id}`, { logoUrl: logo }])),
};
const out = finalizeServedSharedTripPayload(shared);
for (const [id, , host] of cases) {
  const want = `https://icons.duckduckgo.com/ip3/${host}.ico`;
  assert.equal(out.places.find((p) => p.id === id).logoUrl, want, `place ${id}`);
  assert.equal(out.thingOverrides[`place:${id}`].logoUrl, want, `override ${id}`);
}
const keep = finalizeServedSharedTripPayload({ places: [{ id: 1, logoUrl: 'https://example.org/logo.png' }], thingOverrides: {} });
assert.equal(keep.places[0].logoUrl, 'https://example.org/logo.png');
console.log('served payload logo repair ok');
