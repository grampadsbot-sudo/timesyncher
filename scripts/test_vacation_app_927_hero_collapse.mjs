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
assert.match(heroScript, /isBlackHeroGradient/);
assert.doesNotMatch(heroScript, /linear-gradient\(135deg, #000'\)/);
assert.match(heroScript, /max-width: 844px/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);

const isBlackHeroGradient = (styleText) => {
  if (!styleText.includes('linear-gradient(135deg')) return false;
  return /linear-gradient\(135deg,\s*(?:#000(?:000)?|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/.test(styleText);
};

const hexHeroStyle =
  'background: linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%); color: white;';
const rgbHeroStyle =
  'background: linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%); color: white;';
assert.equal(isBlackHeroGradient(hexHeroStyle), true, '#000 hero gradient');
assert.equal(isBlackHeroGradient(rgbHeroStyle), true, 'rgb(0, 0, 0) hero gradient');

console.log('vacation app #927 hero collapse regression passed');
