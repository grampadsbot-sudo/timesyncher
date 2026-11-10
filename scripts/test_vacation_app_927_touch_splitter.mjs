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
assert.doesNotMatch(vacationApp, /\.splitter::after \{ width: 27px; height: 1\.5px; \}/);
assert.doesNotMatch(shellCss, /width:\s*27px/);
assert.doesNotMatch(shellCss, /height:\s*1\.5px/);
assert.match(vacationApp, /<div class="splitter-row" id="splitterRow"><span class="splitter-track" id="splitterTrack" aria-hidden="true"><\/span><button class="splitter" id="splitter"/);
const phoneTrack = shellCss.match(/@media \(max-width: 480px\), \(pointer: coarse\) and \(hover: none\) and \(max-width: 932px\) \{([\s\S]*?)\n\}/);
assert.ok(phoneTrack, 'phone/touch splitter block must cover iOS 390-430 even when max-width 480 misses');
assert.match(phoneTrack[1], /#splitterRow\.splitter-row \{[^}]*background: var\(--panel, #fff\);[^}]*border-top: 0;[^}]*border-bottom: 0;/);
assert.match(phoneTrack[1], /#splitterRow > \.splitter-track \{[^}]*display: block;[^}]*height: 22px;[^}]*background: linear-gradient/);
assert.match(shellCss, /#splitterRow > \.splitter-track \{ display: none; \}/);
assert.match(shellCss, /#splitter[\s\S]*min-height:\s*44px/);
assert.match(shellCss, /@media \(max-width: 480px\)[\s\S]*min-height:\s*22px/);
assert.match(wordmarkCss, /\.splitter-row\{[^}]*min-height:44px/);
assert.match(wordmarkCss, /@media \(max-width:480px\)\{\.splitter-row \.splitter\{min-height:22px/);

console.log('vacation app #927 touch splitter regression passed');
