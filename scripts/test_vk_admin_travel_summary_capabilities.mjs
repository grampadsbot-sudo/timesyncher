import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startVkAdminLocalServer } from './qa/vk-admin-local-server.mjs';
import { loadVkAdminPlaywright } from './qa/vk-admin-playwright.mjs';
import { LocalVkAdminStore } from '../src/vacation/vk-admin-review-storage.mjs';
import { tripStateCapabilities } from '../src/vacation/trip-state-action-registry.mjs';
import { tripStateBacking, tripStateSiteLocked } from '../src/vacation/trip-state-action-site.mjs';

const clientSource = readFileSync(new URL('../public/vk-admin-review.js', import.meta.url), 'utf8');
const defaultCapabilities = tripStateCapabilities({ env: {} });
for (const actionName of Object.keys(defaultCapabilities.actions)) {
  assert.equal(clientSource.includes(actionName), false, `client must not hard-code action ${actionName}`);
}
for (const reason of ['not_wired', 'no_grant', 'on_hold', 'trip_locked', 'service_unavailable', 'reader_unavailable']) {
  assert.equal(clientSource.includes(reason), false, `client must not hard-code reason ${reason}`);
}

const savedFlag = process.env.VK_TRIP_STATE_ACTIONS;
delete process.env.VK_TRIP_STATE_ACTIONS;

const token = () => randomUUID().slice(0, 8);
const makeTrip = ({ label, metadata, status = 'onboarding', customerId = randomUUID(), heldInvites = [], hasTurns = true }) => {
  const tripId = randomUUID();
  const turnA = randomUUID();
  const turnB = randomUUID();
  const row = {
    trip_id: tripId,
    customer_id: customerId,
    title: `Trip ${label}`,
    destination: `Dest ${label}`,
    customer_email: customerId ? `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com` : null,
    display_name: label,
    created_at: '2026-11-26T18:00:00Z',
    status,
    metadata,
  };
  const tripRecord = { id: tripId, customer_id: customerId, status, metadata };
  const expected = tripStateCapabilities({
    env: {},
    trip: tripRecord,
    backing: tripStateBacking(tripRecord),
    grant: customerId ? 'owner' : 'none',
    locked: tripStateSiteLocked(tripRecord),
    read: 'current',
    serviceAvailable: true,
    emailHeld: heldInvites.length > 0,
  });
  return { tripId, customerId, label, row, heldInvites, expected, turns: hasTurns ? [turnA, turnB] : [] };
};

const trips = [
  makeTrip({ label: 'Switch On', metadata: { intakeShare: true, trip_state_actions: true } }),
  makeTrip({ label: 'Switch Off', metadata: { intakeShare: true, trip_state_actions: false } }),
  makeTrip({ label: 'Held Invite', metadata: { intakeShare: true, trip_state_actions: true }, heldInvites: [{ id: 'inv-1' }] }),
  makeTrip({ label: 'No Grant', metadata: { intakeShare: true, trip_state_actions: true }, customerId: null }),
  makeTrip({ label: 'Locked Trip', metadata: { intakeShare: true, trip_state_actions: true }, status: 'archived' }),
  makeTrip({ label: 'Zero Turns', metadata: { intakeShare: true, trip_state_actions: true }, hasTurns: false }),
];
const byTripId = new Map(trips.map((entry) => [entry.tripId, entry]));

let simulateMissingHeldTable = false;
const query = async (strings, ...values) => {
  const sql = strings.join('?');
  if (sql.includes('from trips t left join customers c') && sql.includes('where t.id =')) {
    const match = byTripId.get(values[0]);
    return match ? [match.row] : [];
  }
  if (sql.includes('from trips t left join customers c')) {
    return trips.map((entry) => entry.row);
  }
  if (sql.includes('from vacation_trip_state_held_invites')) {
    if (simulateMissingHeldTable) {
      const error = new Error('relation "vacation_trip_state_held_invites" does not exist');
      error.code = '42P01';
      throw error;
    }
    return byTripId.get(values[0])?.heldInvites || [];
  }
  if (sql.includes('from transcript_turns')) {
    const match = byTripId.get(values[0]);
    return (match?.turns || []).map((id, idx) => ({
      id,
      direction: 'inbound',
      speaker: 'customer',
      body: `Turn ${idx + 1}`,
      payload: {},
      at: `2026-11-26T1${idx}:00:00Z`,
    }));
  }
  return [];
};

const stateDir = await mkdtemp(path.join(os.tmpdir(), 'vk-travel-summary-cap-'));
const store = new LocalVkAdminStore(stateDir);

async function readRenderedCapabilities(page) {
  const section = page.getByRole('region', { name: 'What the assistant can do' });
  await section.waitFor();
  assert.equal(await section.locator('h2').textContent(), 'What the assistant can do');
  const details = section.locator('details');
  assert.equal(await details.count(), 1);
  assert.equal(await details.evaluate((el) => el.open), false, 'capabilities section must be collapsed by default');
  assert.equal(await section.locator('[data-capability-flags]').isVisible(), false);
  await details.locator('summary').tap();
  assert.equal(await details.evaluate((el) => el.open), true);
  assert.equal(await section.locator('[data-capability-flags]').isVisible(), true);
  return await section.evaluate((el) => {
    const pane = el.closest('.admin-view-panel');
    const overflow = [pane, el, ...el.querySelectorAll('details, summary, ul, li, code, span, h2, h3')].map((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
        ? null : [node.tagName, bounds.left, bounds.right, node.scrollWidth, node.clientWidth];
    }).filter(Boolean);
    const flags = Object.fromEntries([...el.querySelectorAll('[data-capability-flag]')].map((row) => [
      row.dataset.capabilityFlag,
      row.querySelector('[data-capability-flag-value]').textContent,
    ]));
    const actions = Object.fromEntries([...el.querySelectorAll('[data-capability-action]')].map((row) => {
      const group = row.closest('[data-capability-group]').dataset.capabilityGroup;
      const stateText = row.querySelector('[data-capability-state]').textContent;
      const enabled = row.dataset.capabilityEnabled === 'true';
      if (enabled !== (group === 'enabled') || enabled !== (stateText === 'enabled')) {
        throw new Error(`inconsistent enabled rendering for ${row.dataset.capabilityAction}`);
      }
      return [
        row.querySelector('[data-capability-name]').textContent,
        { enabled, reason: row.querySelector('[data-capability-reason-text]').textContent },
      ];
    }));
    return { summary: el.querySelector('summary').textContent, flags, actions, overflow };
  });
}

function assertCapabilitiesMatch(rendered, expected, label) {
  assert.deepEqual(rendered.overflow, [], `${label}: no 390 px overflow when expanded`);
  const expectedEntries = Object.entries(expected.actions);
  const enabledCount = expectedEntries.filter(([, value]) => value.enabled).length;
  assert.equal(rendered.summary, `${enabledCount} of ${expectedEntries.length} actions enabled`, `${label}: summary count`);
  assert.deepEqual(
    Object.keys(rendered.actions).sort(),
    Object.keys(expected.actions).sort(),
    `${label}: action names match registry`,
  );
  for (const [name, expectedAction] of expectedEntries) {
    const actualAction = rendered.actions[name];
    assert.ok(actualAction, `${label}: missing action ${name}`);
    assert.equal(actualAction.enabled, expectedAction.enabled, `${label}: ${name} enabled`);
    assert.deepEqual(
      Buffer.from(actualAction.reason),
      Buffer.from(expectedAction.reason),
      `${label}: ${name} reason byte-for-byte`,
    );
  }
  for (const flag of ['booking', 'payment', 'email']) {
    assert.deepEqual(
      Buffer.from(rendered.flags[flag]),
      Buffer.from(String(expected[flag])),
      `${label}: flag ${flag} byte-for-byte`,
    );
  }
}

async function openTravelSummaryFor(page, base, label, includeTest = false) {
  await page.request.post(`${base}/api/admin/clear-all`);
  await page.goto(`${base}/vacation-app/admin`);
  if (includeTest) {
    const checkbox = page.locator('[data-admin-show-test]');
    await checkbox.waitFor();
    if (!(await checkbox.isChecked())) await checkbox.check();
  }
  await page.getByRole('button', { name: `Open ${label}`, exact: true }).click();
  await page.locator('#tripButton').click();
  await page.getByRole('option', { name: 'Travel Summary', exact: true }).click();
}

process.env.VK_ADMIN_LOGIN = randomUUID();
process.env.VK_ADMIN_SESSION_SECRET = randomUUID();
const server = await startVkAdminLocalServer({ adminDatabase: () => query, adminStore: () => store });
const chromium = loadVkAdminPlaywright().chromium;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  assert.ok((await page.request.post(`${server.base}/api/admin/session`, { data: { login: process.env.VK_ADMIN_LOGIN } })).ok());

  for (const entry of trips) {
    const detail = await page.request.get(`${server.base}/api/admin/customers/${entry.tripId}`);
    assert.ok(detail.ok());
    assert.equal('capabilities' in (await detail.json()).vacation, false, 'customer detail does not leak capabilities');

    const res = await page.request.get(`${server.base}/api/admin/customers/${entry.tripId}/artifacts/travel-summary`);
    assert.ok(res.ok());
    const body = await res.json();
    assert.deepEqual(body.capabilities, entry.expected, `${entry.label}: API capabilities equal tripStateCapabilities`);

    await openTravelSummaryFor(page, server.base, entry.label, entry.customerId === null);
    const rendered = await readRenderedCapabilities(page);
    assertCapabilitiesMatch(rendered, entry.expected, entry.label);

    if (entry.turns.length > 1) {
      await page.getByRole('button', { name: 'Previous turn' }).tap();
      const afterScrub = await readRenderedCapabilities(page);
      assertCapabilitiesMatch(afterScrub, entry.expected, `${entry.label} after turn scrub`);
    }
  }

  simulateMissingHeldTable = true;
  const fallbackRes = await page.request.get(`${server.base}/api/admin/customers/${trips[0].tripId}/artifacts/travel-summary`);
  assert.ok(fallbackRes.ok());
  assert.equal((await fallbackRes.json()).capabilities.email, 'explicit_request_only');
  simulateMissingHeldTable = false;

  const customTag = token();
  const customCapabilities = {
    actions: {
      [`custom_plan_${customTag}`]: { wiring: 'new', requires: ['target'], enabled: true, reason: 'ready' },
      [`custom_gate_${customTag}`]: { wiring: 'adapter', requires: ['grant'], enabled: false, reason: `custom_reason_${customTag}` },
    },
    booking: false,
    payment: false,
    email: 'held',
    product_facts: [],
    access_rights: { view: [], edit_after_accept: [] },
  };
  const customServer = await startVkAdminLocalServer({
    adminDatabase: () => query,
    adminStore: () => store,
    adminCapabilities: () => customCapabilities,
  });
  try {
    const customPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    assert.ok((await customPage.request.post(`${customServer.base}/api/admin/session`, { data: { login: process.env.VK_ADMIN_LOGIN } })).ok());
    const customRes = await customPage.request.get(`${customServer.base}/api/admin/customers/${trips[0].tripId}/artifacts/travel-summary`);
    assert.ok(customRes.ok());
    assert.deepEqual((await customRes.json()).capabilities, customCapabilities);
    await openTravelSummaryFor(customPage, customServer.base, trips[0].label);
    const customRendered = await readRenderedCapabilities(customPage);
    assertCapabilitiesMatch(customRendered, customCapabilities, 'modified registry without client edits');
    for (const oldName of Object.keys(defaultCapabilities.actions)) {
      assert.equal(oldName in customRendered.actions, false, `old action ${oldName} must not appear when registry changes`);
    }
    await customPage.close();
  } finally {
    await customServer.close();
  }
} finally {
  if (savedFlag !== undefined) process.env.VK_TRIP_STATE_ACTIONS = savedFlag;
  await browser.close();
  await server.close();
  await rm(stateDir, { recursive: true, force: true });
}

console.log('PASS VK admin Travel Summary capabilities registry binding and 390 px layout');
