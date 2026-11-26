#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  onboardingCapturesMissing,
  onboardingCapturesRequired,
  onboardingMissingMessage,
} from '../src/vacation/vk-admin-onboarding-view.mjs';
import { assertAdminOnboardingCaptures, couponHarnessRequiresAdminOnboarding } from './harness/admin-onboarding-captures.mjs';
import { shotTurnCapture, waitForTurnCapture } from './harness/admin-review-artifacts.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EVIDENCE = path.join(ROOT, 'evidence/vk-admin-1194-onboarding-chat');

assert.equal(couponHarnessRequiresAdminOnboarding({ coupon: {}, steps: ['collaborator'] }), true);
assert.equal(couponHarnessRequiresAdminOnboarding({ coupon: {}, steps: ['chat'] }), false);

assert.equal(assertAdminOnboardingCaptures({ coupon: {}, steps: ['collaborator'] }, { onboardingCaptures: [] }),
  'admin-onboarding-captures-missing');
assert.equal(assertAdminOnboardingCaptures({ coupon: {}, steps: ['collaborator'] }, { onboardingCaptures: [{ artifact: 'x' }] }), '');

assert.equal(onboardingCapturesRequired({ harnessTag: 'harness:fixture' }), true);
assert.equal(onboardingCapturesMissing({ harnessTag: 'harness:fixture', onboarding: [{}] }, { onboardingCaptures: [] }), true);
assert.equal(onboardingCapturesMissing({ harnessTag: 'harness:fixture' }, { onboardingCaptures: [{ artifact: 'a' }] }), false);
assert.deepEqual(onboardingMissingMessage('harness:vk:run'), {
  role: 'alert',
  text: 'Onboarding captures missing for this run harness:vk:run.',
  runId: 'harness:vk:run',
});

const adminReview = fs.readFileSync(new URL('../public/vk-admin-review.js', import.meta.url), 'utf8');
assert.match(adminReview, /data-onboarding-missing="1"/);
assert.match(adminReview, /Onboarding captures missing for this run/);

const runtime = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
assert.match(runtime, /assertAdminOnboardingCaptures/);
assert.match(runtime, /harnessVacation\.tripId = tripId/);
assert.doesNotMatch(runtime, /put: ready\.VK_ADMIN_LOGIN \? putArtifact : undefined/);

const captureSource = fs.readFileSync(new URL('./harness/admin-review-artifacts.mjs', import.meta.url), 'utf8');
assert.match(captureSource, /shotTurnCapture/);
assert.match(captureSource, /#workspace\.chat-only/);
assert.match(captureSource, /data-ts-timeline-title/);
assert.match(captureSource, /turn === 1/);
assert.equal(waitForTurnCapture.length, 2, 'waitForTurnCapture is exported for harness capture tests');
assert.equal(shotTurnCapture.length, 2, 'shotTurnCapture is exported for harness capture tests');

for (const name of [
  'onboarding-390.png', 'onboarding-1280.png',
  'captures-390.png', 'captures-1280.png',
  'onboarding-missing-390.png',
]) {
  const file = path.join(EVIDENCE, name);
  assert.ok(fs.existsSync(file), `missing fixture admin evidence ${name}`);
  assert.ok(fs.statSync(file).size > 1000, `${name} too small`);
}

function capturePage({ chatOnly, siteTitle = 'Fixture Trip' } = {}) {
  let scrollCalls = 0;
  let waitCalls = 0;
  let shotVia = '';
  let titleWaited = false;
  const page = {
    waitCount: () => waitCalls,
    scrollCount: () => scrollCalls,
    shotVia: () => shotVia,
    titleWaited: () => titleWaited,
    async waitForFunction() {
      waitCalls += 1;
    },
    locator(selector) {
      if (selector === '#messages') {
        return {
          evaluate: async () => { scrollCalls += 1; },
        };
      }
      if (selector === '#workspace.chat-only') {
        return { count: async () => (chatOnly ? 1 : 0) };
      }
      if (selector === '.chat-pane') {
        return {
          screenshot: async () => { shotVia = '.chat-pane'; return Buffer.from('chat'); },
        };
      }
      if (selector === '.site-pane iframe') {
        return {
          count: async () => (chatOnly ? 0 : 1),
          first: () => ({
            waitFor: async () => {},
            contentFrame: () => ({
              locator: () => ({
                first: () => ({
                  waitFor: async () => { titleWaited = true; },
                }),
              }),
            }),
          }),
        };
      }
      if (selector === '#workspace') {
        return {
          screenshot: async () => { shotVia = '#workspace'; return Buffer.from('workspace'); },
        };
      }
      throw new Error(`unexpected selector ${selector}`);
    },
  };
  return page;
}

{
  const page = capturePage({ chatOnly: true });
  await waitForTurnCapture(page, { turn: 1, text: 'Customer line 1' });
  assert.ok(page.waitCount() >= 4, 'turn 1 waits for opener plus customer and assistant pair');
  assert.equal(page.scrollCount(), 1, 'first-five scroll keeps both bubbles in view');
  const out = path.join(os.tmpdir(), 'vk-1194-shot-chat-only.png');
  await shotTurnCapture(page, { turn: 1, text: 'Customer line 1', outFile: out });
  assert.equal(page.shotVia(), '.chat-pane', 'pre-site capture uses chat pane only');
}

{
  const page = capturePage({ chatOnly: false, siteTitle: 'Orlando fixture' });
  const out = path.join(os.tmpdir(), 'vk-1194-shot-with-site.png');
  await shotTurnCapture(page, { turn: 3, text: 'Customer line 3', outFile: out });
  assert.equal(page.shotVia(), '#workspace', 'with-site capture includes workspace header');
  assert.equal(page.titleWaited(), true, 'with-site capture waits for site header title');
}

console.log('ok - vk harness admin onboarding and chat captures #1194');