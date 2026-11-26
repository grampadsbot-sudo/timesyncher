#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  onboardingCapturesMissing,
  onboardingCapturesRequired,
  onboardingMissingMessage,
} from '../src/vacation/vk-admin-onboarding-view.mjs';
import { assertAdminOnboardingCaptures, couponHarnessRequiresAdminOnboarding } from './harness/admin-onboarding-captures.mjs';
import { shotTurnCapture, waitForTurnCapture } from './harness/admin-review-artifacts.mjs';

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
assert.equal(waitForTurnCapture.length, 2, 'waitForTurnCapture is exported for harness capture tests');
assert.equal(shotTurnCapture.length, 2, 'shotTurnCapture is exported for harness capture tests');

console.log('ok - vk harness admin onboarding and chat captures #1194');