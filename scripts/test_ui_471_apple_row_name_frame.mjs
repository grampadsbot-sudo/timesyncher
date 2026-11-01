#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  listRowFirstNameLineCenterY,
  listRowNameLeafCenterY,
  thingLogoInkCenterBundleSnippet,
} from '../src/vacation/thing-logo-ink-center.mjs';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { nameLineFrame, judgeRowNameFrame } from './ops/gateb/lib/row-name-frame.mjs';

const appleInk = readFileSync(
  new URL('../src/vacation/thing-logo-ink-offsets.json', import.meta.url),
  'utf8',
);
assert.match(appleInk, /"https:\/\/www\.apple\.com\/favicon\.ico"/);

const rect = (top, left, width, height) => ({
  top,
  left,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
});

const chipTop = 100;
const chipSize = 28;
const chip = {
  getBoundingClientRect: () => rect(chipTop, 20, chipSize, chipSize),
  closest(sel) {
    if (sel.includes('data-list-row')) return listRow;
    return null;
  },
};

const strong = {
  children: { length: 0 },
  textContent: 'Apple Fifth Avenue',
  getBoundingClientRect: () => rect(chipTop + 5, 56, 140, 18),
};
const nameEl = {
  ownerDocument: {
    createTreeWalker: () => ({ nextNode: () => null }),
    createRange: () => ({ selectNodeContents: () => {}, getClientRects: () => [] }),
  },
  querySelectorAll: () => [strong],
  getBoundingClientRect: () => rect(chipTop + 4, 56, 140, 20),
};
const listRow = {
  querySelector(sel) {
    if (sel === '[data-ts-list-row-name]') return nameEl;
    return null;
  },
};

const leafCy = listRowNameLeafCenterY(nameEl);
assert.ok(leafCy != null);
const inkTarget = listRowFirstNameLineCenterY(chip);
assert.equal(inkTarget, leafCy);

const firstText = {
  text: 'Apple Fifth Avenue',
  visible: true,
  box: [
    strong.getBoundingClientRect().left,
    strong.getBoundingClientRect().top,
    strong.getBoundingClientRect().width,
    strong.getBoundingClientRect().height,
  ],
};
const chipCenterY = chipTop + chipSize / 2;
assert.equal(judgeRowNameFrame(chipCenterY, firstText).ok, true);
assert.equal(judgeRowNameFrame(leafCy, firstText).ok, true);

const raw = execFileSync(
  'git',
  ['show', '06e47169699ffdee8accf48e74b0a247a8793ebc^:public/assets/upstream/index-BKun7ofk.js'],
  { maxBuffer: 25 * 1024 * 1024 },
);
const bundle = renderServedTrekBundle(raw.toString('utf8'));
assert.match(
  bundle,
  /"data-ts-list-row-name":"1",style:\{minWidth:0,maxWidth:"100%",width:"100%",display:"inline-flex",alignItems:"center",lineHeight:1,whiteSpace:"normal",overflowWrap:"anywhere"\}/,
);
assert.match(bundle, /"strong",\{style:\{lineHeight:1,display:"block"\},children:ua\}/);
assert.match(thingLogoInkCenterBundleSnippet(), /tsListRowNameLeafCenterY/);

const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(bundle, committed, 'committed served bundle must match rendered patches (#471)');

console.log(`ui #471 apple row name frame PASS (${fileURLToPath(import.meta.url)})`);
