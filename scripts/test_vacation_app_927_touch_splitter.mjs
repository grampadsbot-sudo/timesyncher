import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vacationAppRequest = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const shellCss = await readFile(new URL('../public/vacation-app-shell.css', import.meta.url), 'utf8');
const wordmarkCss = await readFile(new URL('../public/brand/vk-wordmark.css', import.meta.url), 'utf8');

assert.match(vacationAppRequest, /const passiveTouch = \{ passive: false \}/);
assert.match(vacationAppRequest, /addEventListener\('touchstart', onTouchStart, passiveTouch\)/);
assert.match(vacationAppRequest, /addEventListener\('touchmove', onTouchMove, passiveTouch\)/);
assert.match(vacationAppRequest, /splitterDragShield/);
assert.match(vacationAppRequest, /splitter-dragging/);
assert.match(vacationAppRequest, /bindHandle\(splitterRow\)/);
assert.doesNotMatch(vacationAppRequest, /Math\.min\(76,\s*Math\.max\(26/);

assert.match(vacationApp, /\.splitter-row[\s\S]*min-height:\s*44px/);
assert.match(vacationApp, /@media \(max-width: 480px\)[\s\S]*\.splitter-row \.splitter[\s\S]*min-height:\s*22px/);
assert.match(vacationApp, /\.splitter::after[\s\S]*width:\s*54px[\s\S]*height:\s*3px/);
assert.match(vacationApp, /@media \(max-width: 480px\)[\s\S]*\.splitter::after \{ width: 27px; height: 2px; \}/);
assert.match(
  vacationApp,
  /@media \(pointer: coarse\) and \(hover: none\)[\s\S]*\.splitter::after \{ width: 27px; height: 2px; \}/,
);
assert.match(shellCss, /#splitter[\s\S]*min-height:\s*44px/);
assert.match(shellCss, /@media \(max-width: 480px\)[\s\S]*min-height:\s*22px/);
assert.match(wordmarkCss, /\.splitter-row\{[^}]*min-height:44px/);
assert.match(wordmarkCss, /@media \(max-width:480px\)\{\.splitter-row \.splitter\{min-height:22px/);

console.log('vacation app #927 touch splitter regression passed');
