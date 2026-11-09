import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vacationAppRequest = await readFile(new URL('../public/vacation-app-request.js', import.meta.url), 'utf8');
const vacationApp = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
const sharedAudio = await readFile(new URL('../public/ts-shared-audio-recorder.js', import.meta.url), 'utf8');
const layoutMeasure = await readFile(new URL('./layout-app-measure.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(vacationAppRequest, /Math\.min\(76,\s*Math\.max\(26/);
assert.match(vacationAppRequest, /--chat-height/);
assert.match(vacationAppRequest, /pointercancel/);
assert.match(vacationApp, /minmax\(0,\s*var\(--site-height/);
assert.match(vacationApp, /minmax\(0,\s*var\(--chat-height/);
assert.doesNotMatch(vacationApp, /minmax\(220px/);
assert.doesNotMatch(vacationApp, /minmax\(128px,\s*var\(--site-height/);
assert.match(vacationApp, /\.bubble[\s\S]*max-width:\s*100%/);
assert.doesNotMatch(vacationApp, /\.bubble[\s\S]*min\(720px/);
assert.doesNotMatch(sharedAudio, /dataset\.tsSharedAudio\s*=\s*'1'/);
assert.match(layoutMeasure, /dividerDragSource/);
assert.match(layoutMeasure, /sharedHeaderMicSource/);
assert.match(layoutMeasure, /appBubbleWidthSource/);
assert.match(vacationApp, /id="voiceButton"/);

console.log('vacation app #865 chrome regression passed');
