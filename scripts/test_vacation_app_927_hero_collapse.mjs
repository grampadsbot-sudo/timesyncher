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
assert.match(heroScript, /linear-gradient\(135deg, #000/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);

console.log('vacation app #927 hero collapse regression passed');
