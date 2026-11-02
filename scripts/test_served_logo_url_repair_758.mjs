import assert from 'node:assert/strict';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';

const cases = [
  ['Statue of Liberty walking tour', 'https://statuecitycruises.com/favicon.ico', 'statuecitycruises.com'],
  ["Macy's Herald Square", 'https://www.macys.com/favicon.ico', 'macys.com'],
  ['Whole Foods Market Columbus Circle', 'https://www.wholefoodsmarket.com/favicon.ico', 'wholefoodsmarket.com'],
  ['Hertz JFK Compact SUV', 'https://www.hertz.com/favicon.ico', 'hertz.com'],
];
const shared = {
  places: cases.map(([name, logo], i) => ({ id: 900 + i, name, logoUrl: logo, website: logo.replace('/favicon.ico', '/') })),
  thingOverrides: Object.fromEntries(cases.map(([, logo], i) => [`place:${900 + i}`, { logoUrl: logo }])),
};
const out = applyCapturedLogos(shared);
for (const [i, [name, , host]] of cases.entries()) {
  const ov = out.thingOverrides[`place:${900 + i}`].logoUrl;
  const pl = out.places[i].logoUrl;
  for (const u of [ov, pl]) {
    assert.ok(!/\/favicon\.ico$/.test(u), `${name} served logoUrl must not be the hotlink-blocked favicon.ico: ${u}`);
    assert.equal(u, `https://icons.duckduckgo.com/ip3/${host}.ico`, name);
  }
}
console.log('served logo url repair ok');
