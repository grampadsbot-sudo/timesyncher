#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFeedbackArtifact, feedbackRollupRows } from '../src/vacation/vk-admin-feedback.mjs';
import { LocalVkAdminStore, loadFeedbackArtifact, saveFeedbackArtifact } from '../src/vacation/vk-admin-review-storage.mjs';
import { SSR_CHECKPOINTS } from './customer_suite/ssr/checkpoints.mjs';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';

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
const db = async (parts, id) => {
  const query = parts.join('?');
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
await server.close();

console.log('ok test_vk_admin_feedback.mjs');