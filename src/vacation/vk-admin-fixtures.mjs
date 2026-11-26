import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyThingPresentation, sharedTripFromIntake } from './intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload } from './shared-trip-served-page.mjs';
import { isVkAdminAllowedHost } from './vk-admin-session.mjs';

const FIXTURE_ROOT = fileURLToPath(new URL('../../scripts/fixtures/vk-admin-review/', import.meta.url));
const SHARE_PREFIX = 'vk-admin-share-';

let rosterCatalog;
let vacationFixtures;

function loadRosterCatalog() {
  if (!rosterCatalog) rosterCatalog = JSON.parse(readFileSync(`${FIXTURE_ROOT}roster-catalog.json`, 'utf8'));
  return rosterCatalog;
}

function loadVacationFixtures() {
  if (!vacationFixtures) vacationFixtures = JSON.parse(readFileSync(`${FIXTURE_ROOT}vacation-fixtures.json`, 'utf8'));
  return vacationFixtures;
}

function vacationByTripId(tripId) {
  return loadVacationFixtures().vacations.find((row) => row.tripId === tripId) || null;
}

function rosterMembers(tripId) {
  return loadRosterCatalog().customers.filter((c) => c.tripId === tripId);
}

function rosterSortAt(members) {
  const n = Number(String(members[0]?.test_coupon || '').replace(/\D/g, '')) || members[0]?.id || 0;
  return `2026-06-${String(1 + (n % 28)).padStart(2, '0')}T12:00:00.000Z`;
}

function customerRow(c) {
  return { id: c.id, customer_label: c.customer_label, test_coupon: c.test_coupon };
}

function groupFor(tripId) {
  const detail = vacationByTripId(tripId);
  const members = rosterMembers(tripId);
  if (!detail && !members.length) return null;
  const customers = members.map(customerRow);
  return {
    tripId,
    sortAt: detail?.sortAt || rosterSortAt(members),
    label: detail?.label || members[0]?.destination || tripId,
    destination: detail?.destination || members[0]?.destination || '',
    customerCount: customers.length,
    customers,
    isTest: customers.some((c) => /^VK-TEST-\d{3}$/.test(String(c.test_coupon || ''))),
  };
}

export function listVkAdminGroups() {
  const tripIds = new Set();
  for (const c of loadRosterCatalog().customers) if (c.tripId) tripIds.add(String(c.tripId));
  for (const v of loadVacationFixtures().vacations) tripIds.add(v.tripId);
  return [...tripIds]
    .map(groupFor)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));
}

export function presentVkAdminVacation(tripId) {
  const id = String(tripId || '');
  const group = groupFor(id);
  if (!group) return null;
  const detail = vacationByTripId(id);
  return {
    ...group,
    title: detail?.trip?.title || group.destination || group.label,
    startDate: detail?.trip?.start_date || '',
    endDate: detail?.trip?.end_date || '',
    ...(detail?.ledger ? { ledger: detail.ledger } : {}),
    shareSlug: detail?.shareSlug || '',
    turns: Array.isArray(detail?.turns) ? detail.turns : [],
    onboarding: detail?.onboarding || [],
  };
}

export function vkAdminFixtureShareSlug(slug) {
  return String(slug || '').startsWith(SHARE_PREFIX);
}

export function buildVkAdminSharedTrip(shareSlug, req = null, env = process.env) {
  if (!isVkAdminAllowedHost(req, env)) return null;
  const row = loadVacationFixtures().vacations.find((vac) => vac.shareSlug === shareSlug);
  if (!row?.trip) return null;
  const shared = sharedTripFromIntake({ trip: structuredClone(row.trip), things: structuredClone(row.things || []) });
  return finalizeServedSharedTripPayload(applyThingPresentation({ ...shared, forecast: [] }));
}
