import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  formatReservationCreatedDate,
  reservationConnectionModeLabel,
} from '../src/lib/mcpPanelModel.mjs';
import { buildDetailViewModel, detailReservationBooking } from '../src/lib/detailModel.mjs';

assert.equal(reservationConnectionModeLabel({ mode: 'webhook' }), 'Webhook (automatic ping)');
assert.equal(reservationConnectionModeLabel({ mode: 'polling', pollIntervalMinutes: 7 }), 'Scheduled polling (every 7 min)');
assert.equal(reservationConnectionModeLabel({ mode: 'manual' }), 'Manual check');
assert.equal(reservationConnectionModeLabel({ mode: null }), 'Waiting for handshake');
assert.equal(formatReservationCreatedDate('2026-11-21T17:42:00.000Z'), 'Created 2026-11-21');
assert.equal(formatReservationCreatedDate(''), '');

const sampleTrip = {
  trip: { id: 1, title: 'NYC Weekend', currency: 'USD' },
  days: [{ id: 10, day_number: 1, date: '2026-07-08' }],
  places: [
    {
      id: 42,
      name: 'Carbone',
      category_name: 'Restaurant',
      booked_by_ai: true,
      booked_by_label: 'Booked by your AI',
      confirmation_number: 'CARB-8842',
      reservation_time: '8:00 PM',
      party_size: 8,
    },
  ],
  thingOverrides: {
    'place:42': {
      bookedByAi: true,
      bookedByLabel: 'Booked by your AI',
      confirmationNumber: 'CARB-8842',
      reservationDate: '2026-07-08',
      reservationTime: '8:00 PM',
      partySize: 8,
      reservationNotes: 'Main dining room booth',
    },
  },
};

const booking = detailReservationBooking(sampleTrip.places[0], sampleTrip);
assert.ok(booking);
assert.equal(booking.bookedByLabel, 'Booked by your AI');
assert.equal(booking.confirmationNumber, 'CARB-8842');
assert.equal(booking.time, '8:00 PM');
assert.equal(booking.partySize, 8);
assert.equal(booking.notes, 'Main dining room booth');

const detailVm = buildDetailViewModel(sampleTrip.places[0], sampleTrip);
assert.deepEqual(detailVm.reservationBooking, booking);

const unbooked = detailReservationBooking({ id: 99, name: 'Balthazar' }, { thingOverrides: {} });
assert.equal(unbooked, null);

const panelSource = await readFile(new URL('../src/components/McpApprovalPanel.tsx', import.meta.url), 'utf8');
assert.match(panelSource, /Reservations AI/);
assert.match(panelSource, /data-mcp-revoke-reservation/);
assert.match(panelSource, /data-ts-mcp-admin-only/);
assert.match(panelSource, /reservationConnectionModeLabel/);
assert.match(panelSource, /formatReservationCreatedDate/);

const shellSource = await readFile(new URL('../src/components/TripShell.tsx', import.meta.url), 'utf8');
assert.match(shellSource, /canEdit && isOwner && onOpenMcpPanel/);
assert.match(shellSource, /data-ts-mcp-open="reservations"/);

const detailPanelSource = await readFile(new URL('../src/components/ThingDetailPanel.tsx', import.meta.url), 'utf8');
assert.match(detailPanelSource, /data-ts-booked-by-ai="1"/);
assert.match(detailPanelSource, /model\.reservationBooking/);

const liveAccessSource = await readFile(new URL('../../../public/ts-mcp-ai-access.js', import.meta.url), 'utf8');
assert.match(liveAccessSource, /Reservations AI/);
assert.match(liveAccessSource, /data-mcp-revoke-reservation/);
assert.match(liveAccessSource, /data-ts-mcp-admin-only/);
assert.match(liveAccessSource, /\/api\/mcp\/reservations\/connections/);
assert.doesNotMatch(liveAccessSource, /\btrips?\b/i);

const chatUiSource = await readFile(new URL('../../../public/vacation-app-ai-import.js', import.meta.url), 'utf8');
assert.match(chatUiSource, /data-ts-ai-reservation-offer/);
assert.match(chatUiSource, /data-ts-ai-reservation-setup/);
assert.match(chatUiSource, /data-ts-ai-reservation-connected/);
assert.match(chatUiSource, /data-ts-ai-reservation-status-card/);
assert.match(chatUiSource, /check my VK reservations/);
assert.doesNotMatch(chatUiSource, /\btrips?\b/i);

const bundleSource = await readFile(new URL('../../../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.match(bundleSource, /data-ts-booked-by-ai/);
assert.match(bundleSource, /Booked by your AI/);
assert.match(bundleSource, /Ce&&tsIsOwner&&/);
assert.match(bundleSource, /data-ts-mcp-open":"reservations"/);

console.log('reservations.unit.mjs passed');
