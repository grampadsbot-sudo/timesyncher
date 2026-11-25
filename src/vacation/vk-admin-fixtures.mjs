import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finalizeServedSharedTripPayload } from './shared-trip-served-page.mjs';

const FIXTURE_ROOT = fileURLToPath(new URL('../../scripts/fixtures/vk-admin-review/', import.meta.url));

let rosterCatalog;
let vacationFixtures;

function loadRosterCatalog() {
  if (!rosterCatalog) {
    rosterCatalog = JSON.parse(readFileSync(`${FIXTURE_ROOT}roster-catalog.json`, 'utf8'));
  }
  return rosterCatalog;
}

function loadVacationFixtures() {
  if (!vacationFixtures) {
    vacationFixtures = JSON.parse(readFileSync(`${FIXTURE_ROOT}vacation-fixtures.json`, 'utf8'));
  }
  return vacationFixtures;
}

function vacationByTripId(tripId) {
  const fixtures = loadVacationFixtures();
  return fixtures.vacations.find((row) => row.tripId === tripId) || null;
}

function groupSortAt(tripId) {
  const row = vacationByTripId(tripId);
  if (row?.sortAt) return row.sortAt;
  const catalog = loadRosterCatalog();
  const members = catalog.customers.filter((c) => c.tripId === tripId);
  const coupon = members[0]?.test_coupon || '';
  const n = Number(String(coupon).replace(/\D/g, '')) || members[0]?.id || 0;
  return `2026-06-${String(Math.min(28, 1 + (n % 28))).padStart(2, '0')}T12:00:00.000Z`;
}

export function listVkAdminGroups() {
  const catalog = loadRosterCatalog();
  const byTrip = new Map();
  for (const customer of catalog.customers) {
    const tripId = String(customer.tripId || '');
    if (!tripId) continue;
    if (!byTrip.has(tripId)) {
      const detail = vacationByTripId(tripId);
      byTrip.set(tripId, {
        tripId,
        sortAt: groupSortAt(tripId),
        destination: detail?.destination || customer.destination,
        label: detail?.label || customer.destination,
        testCoupons: [],
        customers: [],
      });
    }
    const group = byTrip.get(tripId);
    group.customers.push({
      id: customer.id,
      customer_label: customer.customer_label,
      test_coupon: customer.test_coupon,
    });
    group.testCoupons.push(customer.test_coupon);
  }
  for (const vac of loadVacationFixtures().vacations) {
    if (!vac.isDecoy || byTrip.has(vac.tripId)) continue;
    byTrip.set(vac.tripId, {
      tripId: vac.tripId,
      sortAt: vac.sortAt,
      destination: vac.destination,
      label: vac.label,
      testCoupons: [],
      customers: [],
    });
  }
  return [...byTrip.values()]
    .sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt))
    .map((group) => ({
      tripId: group.tripId,
      sortAt: group.sortAt,
      label: group.label,
      destination: group.destination,
      customerCount: group.customers.length,
      customers: group.customers,
      isTest: group.testCoupons.some((c) => /^VK-TEST-/i.test(c)),
    }));
}

function findVkAdminVacation(tripId) {
  return vacationByTripId(String(tripId || ''));
}

export function presentVkAdminVacation(tripId) {
  const id = String(tripId || '');
  const detail = findVkAdminVacation(id);
  const catalog = loadRosterCatalog();
  const members = catalog.customers.filter((c) => c.tripId === id);
  if (!detail && !members.length) return null;
  if (!detail) {
    return {
      tripId: id,
      label: members[0]?.destination || id,
      destination: members[0]?.destination || '',
      sortAt: groupSortAt(id),
      shareSlug: '',
      chat: { turns: [] },
      trip: { shareSlug: '' },
      customers: members.map((c) => ({
        id: c.id,
        customer_label: c.customer_label,
        test_coupon: c.test_coupon,
      })),
    };
  }
  return {
    tripId: detail.tripId,
    label: detail.label,
    destination: detail.destination,
    sortAt: detail.sortAt || groupSortAt(tripId),
    shareSlug: detail.shareSlug,
    chat: {
      turns: detail.chat?.turns || [],
    },
    trip: {
      shareSlug: detail.shareSlug,
    },
    customers: members.map((c) => ({
      id: c.id,
      customer_label: c.customer_label,
      test_coupon: c.test_coupon,
    })),
  };
}

export function buildVkAdminSharedTrip(shareSlug) {
  const fixtures = loadVacationFixtures();
  const row = fixtures.vacations.find((vac) => vac.shareSlug === shareSlug);
  if (!row?.sharedTrip) return null;
  return finalizeServedSharedTripPayload(structuredClone(row.sharedTrip));
}

export function vkAdminFixtureShareSlug(slug) {
  return String(slug || '').startsWith('vk-admin-share-');
}

export function renderVacationTurnsHtml(turns = []) {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chatText = (value) => esc(String(value || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/g, '$1$2'));
  return turns.map((turn, index) => {
    const user = String(turn.speaker || turn.role || '').toLowerCase() === 'owner' || turn.speaker === 'OWNER' || turn.speaker === 'customer';
    const label = user ? 'You' : 'Vacay Keepsake';
    const body = user ? esc(turn.text || turn.body || '') : chatText(turn.text || turn.body || '');
    const tag = turn.t || turn.id || `${user ? 'owner' : 'app'}-${index + 1}`;
    return `<article class="bubble${user ? ' user' : ''}" data-turn="${esc(tag)}" data-admin-readonly="1"><small>${esc(label)}</small>${body}</article>`;
  }).join('');
}