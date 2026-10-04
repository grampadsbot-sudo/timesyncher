#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { reconcileVisualJudgeComposerSend, sendBboxHasInkInComposerPng } from './shepherd-staging-smoke-composer-send-dom.mjs';
import {
  layoutAppFailShareUrlBeforeApi,
  transcriptBlobContainsShareUrl,
} from './shepherd-staging-smoke-layout-share-guard.mjs';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const layoutSpine = readFileSync(new URL('./shepherd-staging-smoke-layout-spine.mjs', import.meta.url), 'utf8');
const mainSpine = readFileSync(new URL('./shepherd-staging-smoke-main.mjs', import.meta.url), 'utf8');
assert.match(layoutSpine, /share_not_published_before_layout|after share publish/);
assert.match(mainSpine, /prepareMapLogoIntakeShare/);
assert.ok(
  mainSpine.indexOf('prepareMapLogoIntakeShare') < mainSpine.indexOf('registerLayoutSpineChecks'),
  'registerLayoutSpineChecks must run after prepareMapLogoIntakeShare',
);

const appFail = layoutAppFailShareUrlBeforeApi({
  customerShareUrlSeenMs: 1000,
  sharedApiFirst200Ms: 5000,
  shareSlug: 'intake-abc',
});
assert.ok(appFail?.detail?.includes('APP FAIL'), 'URL before API 200 must APP FAIL');
assert.match(appFail.rule, /app_share_url_before_api/);

assert.equal(
  layoutAppFailShareUrlBeforeApi({ customerShareUrlSeenMs: 6000, sharedApiFirst200Ms: 5000 }),
  null,
);

assert.equal(transcriptBlobContainsShareUrl('see https://x.com/shared/intake-abc/', 'intake-abc'), true);

const visibleSendDom = {
  id: 'sendButton',
  ariaLabel: 'Send',
  role: 'button',
  visible: true,
  bboxInComposer: { x: 2, y: 2, width: 8, height: 8 },
};
const reconciled = reconcileVisualJudgeComposerSend(
  { pass: false, failures: [{ rubricItem: '2', reason: 'The image does not show any send control on the right.' }] },
  visibleSendDom,
);
assert.equal(reconciled.pass, true, 'structural reconcile clears rubric 2 without reason regex');

const stillFail = reconcileVisualJudgeComposerSend(
  { pass: false, failures: [{ rubricItem: '2', reason: 'missing send' }] },
  null,
);
assert.equal(stillFail.pass, false, 'DOM-missing must not reconcile');

const png = new PNG({ width: 20, height: 20 });
for (let y = 0; y < 20; y += 1) {
  for (let x = 0; x < 20; x += 1) {
    const i = (y * 20 + x) * 4;
    const white = 250;
    png.data[i] = white;
    png.data[i + 1] = white;
    png.data[i + 2] = white;
    png.data[i + 3] = 255;
  }
}
const buf = PNG.sync.write(png);
const emptyInk = sendBboxHasInkInComposerPng(buf, visibleSendDom);
assert.equal(emptyInk.hasInk, false);

const appCrop = reconcileVisualJudgeComposerSend(
  { pass: false, failures: [{ rubricItem: '2', reason: 'no send visible' }] },
  visibleSendDom,
  { composerPngBuffer: buf },
);
assert.equal(appCrop.pass, false);
assert.ok(
  (appCrop.failures || []).some((f) => f.rubricItem === 'app' && /lack ink/i.test(f.reason)),
  'DOM-visible but crop-empty must APP FAIL',
);

console.log('shepherd staging smoke layout visual guard tests passed');
