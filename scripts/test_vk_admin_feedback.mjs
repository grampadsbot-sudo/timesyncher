#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFeedbackArtifact, feedbackRollupRows } from '../src/vacation/vk-admin-feedback.mjs';
import { LocalVkAdminStore, loadFeedbackArtifact, saveFeedbackArtifact } from '../src/vacation/vk-admin-review-storage.mjs';
import { SSR_CHECKPOINTS } from './customer_suite/ssr/checkpoints.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';

const { chromium } = loadVkAdminPlaywright();

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'vk-admin-feedback-'));
const store = new LocalVkAdminStore(workspace);
const tripId = 'aaaaaaaa-0000-0000-0000-000000000118';
const vacations = [{
  trip_id: tripId,
  title: 'Feedback route fixture',
  destination: 'Hilo',
  customer_id: 'fixture-feedback',
  display_name: 'Taylor Moss',
  harness_tag: 'harness:fixture:feedback',
  created_at: '2026-11-26T12:00:00.000Z',
}];
const turns = [{
  request_id: 'req-1', speaker: 'customer', direction: 'inbound', body: 'Fixture customer line',
  at: '2026-11-26T12:00:01.000Z',
}, {
  request_id: 'req-1', speaker: 'app', direction: 'outbound', body: 'Fixture app reply',
  at: '2026-11-26T12:00:02.000Z', payload: {},
}];
const db = async (parts, id) => {
  const query = parts.join('?');
  if (query.includes('from transcript_turns')) return id === tripId ? turns : [];
  if (query.includes('from onboarding_sessions')) return [];
  if (query.includes('from trips')) return id ? vacations.filter((row) => row.trip_id === id) : vacations;
  return [];
};
const LOGIN = 'fixture-admin-feedback';
process.env.VK_ADMIN_LOGIN = LOGIN;
process.env.VK_ADMIN_SESSION_SECRET = 'fixture-admin-feedback-secret';
delete process.env.VERCEL_ENV;

const reactions = SSR_CHECKPOINTS.map((checkpoint, index) => ({
  checkpoint: checkpoint.id,
  label: checkpoint.label,
  constructs: [...checkpoint.constructs],
  prompt: checkpoint.prompt,
  reply: `Model-authored reply ${index + 1} for ${checkpoint.id}.`,
}));
const ssr = {
  method: 'ssr-maier-2025',
  anchor_set_version: 'test',
  summary_by_construct: {},
  checkpoints: reactions.flatMap((reaction) => reaction.constructs.map((construct, idx) => ({
    checkpoint: reaction.checkpoint,
    construct,
    expected_score: 3.5 + idx * 0.1,
    pmf_by_rating: { 3: 0.2, 4: 0.5 },
  }))),
};

const payload = buildFeedbackArtifact({
  story: { story_id: 'story-1189', customer: { name: 'Taylor Moss', email_alias: 'taylor-1189' }, destination: 'Hilo' },
  played: {
    tripId,
    survey: { label: 'end of chat (legacy)', questions: ['Q1'], answers: ['legacy only'] },
  },
  reactions,
  ssr,
});
assert.equal(payload.schema, 'vk-admin-feedback/v1');
assert.equal(payload.checkpoints.length, 4);
assert.equal(payload.legacy_trip_survey.label, 'end of chat (legacy)');
assert.ok(payload.checkpoints.every((row) => !/It answered some of it/.test(row.reply)));

assert.equal(await saveFeedbackArtifact(store, tripId, payload), true);
const loaded = await loadFeedbackArtifact(store, tripId);
assert.equal(loaded.customer.name, 'Taylor Moss');
const rollup = feedbackRollupRows([{ tripId, customerLabel: 'Taylor Moss', destination: 'Hilo', payload: loaded }]);
assert.ok(rollup.length >= 5);
assert.ok(rollup.some((row) => row.checkpoint.includes('After setup')));
assert.ok(rollup.some((row) => row.checkpoint === 'end of chat (legacy)'));

const server = await startVkAdminLocalServer({
  adminDatabase: () => db,
  adminStore: () => store,
});
const { base } = server;
const sessionRes = await fetch(`${base}/api/admin/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: LOGIN }),
});
assert.equal(sessionRes.status, 200);
const authCookie = sessionRes.headers.getSetCookie()[0].split(';')[0];

assert.equal(
  (await fetch(`${base}/api/admin/customers/${tripId}/artifacts/feedback`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: authCookie },
    body: JSON.stringify(payload),
  })).status,
  200,
);
const loadedViaRoute = await (await fetch(`${base}/api/admin/customers/${tripId}/artifacts/feedback`, {
  headers: { cookie: authCookie },
})).json();
assert.equal(loadedViaRoute.feedback.schema, 'vk-admin-feedback/v1');
assert.equal(loadedViaRoute.feedback.checkpoints.length, 4);
assert.equal(loadedViaRoute.feedback.legacy_trip_survey.label, 'end of chat (legacy)');

const rollupRoute = await (await fetch(`${base}/api/admin/feedback`, { headers: { cookie: authCookie } })).json();
assert.ok(rollupRoute.rows.some((row) => row.checkpoint.includes('After setup')));
assert.ok(rollupRoute.rows.some((row) => row.checkpoint === 'end of chat (legacy)'));

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
    try {
      const page = await context.newPage();
      await page.goto(`${base}/vacation-app/admin`);
      await page.fill('#adminLoginInput', LOGIN);
      await page.locator('#adminLogin button').click();
      await page.getByRole('button', { name: 'Open Taylor Moss', exact: true }).click();
      await page.locator(`#sitePane[data-kind="dialog"][data-run="${tripId}"]`).waitFor();
      const menuButton = page.locator('#tripButton');
      const viewOptions = page.locator('#vacationDropdown [data-view]');
      await menuButton.click();
      assert.deepEqual(await viewOptions.allTextContents(), [
        'Dialog', 'Turns', 'Travel Summary', 'Feedback & QA', 'Vacation site', 'Keepsake', 'Onboarding', 'Chat screenshots',
      ]);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-feedback-qa-summary]').count(), 0);
      await menuButton.click();
      await page.getByRole('option', { name: 'Feedback & QA', exact: true }).click();
      const feedback = page.locator('[data-feedback-view="customer"]');
      await feedback.waitFor();
      assert.equal(await feedback.locator('[data-feedback-qa-summary]').count(), 1);
      assert.match(await feedback.locator('[data-qa-not-graded]').textContent(), /^not graded$/);
      assert.equal(await feedback.locator('[data-review-result="qa-czar"]').count(), 0);
      assert.match(await feedback.textContent(), /After setup/);
      assert.match(await feedback.textContent(), /end of chat \(legacy\)/);
      console.log(`ok test_vk_admin_feedback.mjs UI at ${width}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}

console.log('ok test_vk_admin_feedback.mjs');