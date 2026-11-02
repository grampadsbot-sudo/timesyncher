#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8');
const bundle = readFileSync(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8');

const EVENTS = '[data-shared-live-tab="events"]';
const mediaStart = css.lastIndexOf('@media (max-width:480px){', css.indexOf(EVENTS));
assert.ok(mediaStart >= 0, 'events mobile CSS block missing');
let depth = 0;
let mediaEnd = -1;
for (let i = css.indexOf('{', mediaStart); i < css.length; i += 1) {
  if (css[i] === '{') depth += 1;
  if (css[i] === '}' && --depth === 0) {
    mediaEnd = i;
    break;
  }
}
assert.ok(mediaEnd > mediaStart, 'events mobile CSS block not closed');
const eventsCss = css.slice(mediaStart, mediaEnd + 1);
assert.equal(css.indexOf(EVENTS, mediaEnd), -1, 'events 390px rules must live in one @media block');

const rules = [...eventsCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].replace(/^@media[^{]*\{/, '').split(',').map((s) => s.trim()),
  body: m[2],
}));
const declsFor = (selector) =>
  rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body).join(';');

const row = declsFor(`${EVENTS} li[data-list-row="1"]`);
assert.match(row, /overflow-x:clip!important/, 'events rows clip at 390px');
assert.match(row, /max-width:100%!important/, 'events rows stay inside the list');

for (const box of [
  `${EVENTS} li[data-list-row="1"] button[aria-label="Open thing details"]`,
  `${EVENTS} [data-ts-thing-header="1"]`,
  `${EVENTS} [data-ts-logo-name-pair="1"]`,
  `${EVENTS} [data-ts-list-row-name="1"]`,
]) {
  const decls = declsFor(box);
  assert.match(decls, /min-width:0!important/, `${box} must be allowed to shrink at 390px`);
  assert.match(decls, /max-width:100%!important/, `${box} must stay inside its row at 390px`);
  assert.match(decls, /overflow:hidden!important/, `${box} must contain the event name at 390px`);
}

const name = declsFor(`${EVENTS} [data-ts-list-row-name="1"] strong`);
assert.match(name, /white-space:nowrap!important/, 'event names stay single-line at 390px');
assert.match(name, /text-overflow:ellipsis!important/, 'long event names (Flight option rows) end in an ellipsis');
assert.match(name, /overflow:hidden!important/, 'event names cannot run past the right edge');
assert.match(name, /max-width:100%!important/, 'event names are capped at their container');

assert.doesNotMatch(eventsCss, /white-space:\s*normal!important/, 'event names must not wrap at 390px');
assert.ok(!eventsCss.includes('[data-list-summary="1"]'), 'event descriptions must not be clipped at 390px');
assert.match(
  bundle,
  /"data-list-summary":"1","data-summary-src":"thing",style:\{[^}]*whiteSpace:"normal",overflowWrap:"anywhere"/,
  'served bundle event descriptions wrap inside the row',
);
assert.match(bundle, /data-shared-live-tab":"events"/, 'served bundle must mark events tab panel for mobile CSS');

console.log('shared events 390px name ellipsis + description wrap contract OK');
