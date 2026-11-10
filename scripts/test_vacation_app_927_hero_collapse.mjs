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
assert.match(
  heroScript,
  /\[data-ts-trip-hero-collapse\]\{[^}]*position:absolute[^}]*left:8px[^}]*top:10px/,
);
assert.match(heroScript, /\[data-ts-trip-site-hero\]\{[^}]*position:relative/);
assert.match(heroScript, /\[data-ts-trip-site-hero\] h1\{[^}]*text-align:center/);
assert.match(heroScript, /\[data-ts-trip-site-hero\] h1\{[^}]*overflow-wrap:anywhere/);
assert.match(heroScript, /\[data-ts-trip-site-hero\] h1\{[^}]*white-space:normal/);
assert.doesNotMatch(heroScript, /\[data-ts-trip-site-hero\]\[data-collapsed="1"\] h1\{[^}]*text-overflow:ellipsis/);
assert.doesNotMatch(heroScript, /\[data-ts-trip-site-hero\]\[data-collapsed="1"\] h1\{[^}]*white-space:nowrap/);
assert.match(heroScript, /\[data-ts-trip-site-hero\]\[data-collapsed="1"\]\{[^}]*padding-top:6px/);
assert.match(heroScript, /padding-left:54px/);
assert.doesNotMatch(heroScript, /grid-template-areas/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);

console.log('vacation app #927 hero collapse regression passed');
