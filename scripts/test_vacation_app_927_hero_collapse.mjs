import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const heroScript = await readFile(new URL('../public/ts-trip-hero-collapse.js', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');

assert.match(heroScript, /data-ts-trip-site-hero/);
assert.match(heroScript, /data-ts-trip-hero-collapse/);
assert.match(heroScript, /data-ts-hero-collapse/);
assert.match(heroScript, /data-ts-trip-hero-actions/);
assert.match(heroScript, /vk-trip-hero-collapsed:/);
assert.match(heroScript, /localStorage\.setItem/);
assert.match(heroScript, /heroGradientRe/);
assert.match(heroScript, /heroBlackStopRe/);
assert.match(heroScript, /nodeHasBlackTripHeroBg/);
assert.match(heroScript, /getComputedStyle/);
assert.doesNotMatch(heroScript, /includes\('linear-gradient\(135deg, #000'\)/);
assert.match(heroScript, /max-width: 844px/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);

const gradientRe = /linear-gradient\(\s*135deg/i;
const blackStopRe = /(?:#000(?:000)?\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i;
const matchesTripHeroBg = (text) => gradientRe.test(text) && blackStopRe.test(text);

const liveRgbStyle =
  'background: linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%); color: white;';
const hexHeroStyle =
  'background: linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%); color: white;';

assert.equal(matchesTripHeroBg(liveRgbStyle), true, 'rgb(0,0,0) serialized hero must match');
assert.equal(matchesTripHeroBg(hexHeroStyle), true, '#000 hero must still match');
assert.equal(
  liveRgbStyle.includes('linear-gradient(135deg, #000'),
  false,
  '#930 regression: old substring guard rejects live rgb hero',
);

console.log('vacation app #927 hero collapse regression passed');
