#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertVkAdminReviewViewActions,
  duplicateViewActionFailures,
} from './vk-admin-review-view-actions-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminReview = fs.readFileSync(path.join(ROOT, 'public/vk-admin-review.js'), 'utf8');
const badFixture = fs.readFileSync(
  path.join(ROOT, 'scripts/fixtures/vk-admin-review/duplicate-view-actions-bad.js'),
  'utf8',
);

assertVkAdminReviewViewActions(adminReview);
assert.deepEqual(duplicateViewActionFailures(adminReview), []);
assert.ok(duplicateViewActionFailures(badFixture).length >= 2, 'bad fixture must fail gate');
assert.throws(() => assertVkAdminReviewViewActions(badFixture), /duplicate view actions/);
assert.ok(
  !/This is an initial take that can be revised through the Vacay Keepsake conversation/.test(
    fs.readFileSync(path.join(ROOT, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  ),
  'keepsake summary stub must not ship in the shared app bundle',
);

console.log('test_vk_admin_review_view_actions_gate: ok');