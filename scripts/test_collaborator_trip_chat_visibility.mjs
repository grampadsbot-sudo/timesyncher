#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { loadTripScopedVacationAppTurns } from '../src/vacation/vacation-app-transcript.mjs';
import { authorPeopleFromTrip } from '../src/vacation/turn-author.mjs';

const ownerCustomerId = crypto.randomUUID();
const collabCustomerId = crypto.randomUUID();
const tripId = crypto.randomUUID();

const transcript = [
  {
    speaker: 'customer',
    body: 'Owner planning note for shared trip',
    channel: 'vacation-app',
    payload: { authorId: ownerCustomerId, authorName: 'Owner Ada' },
    direction: 'inbound',
    received_at: '2026-10-01T10:00:00.000Z',
    sent_at: null,
    created_at: '2026-10-01T10:00:00.000Z',
    customer_id: ownerCustomerId,
    trip_id: tripId,
  },
  {
    speaker: 'customer',
    body: 'Collaborator follow-up',
    channel: 'vacation-app',
    payload: { authorId: collabCustomerId, authorName: 'Sam' },
    direction: 'inbound',
    received_at: '2026-10-01T11:00:00.000Z',
    sent_at: null,
    created_at: '2026-10-01T11:00:00.000Z',
    customer_id: collabCustomerId,
    trip_id: tripId,
  },
];

const collabSession = {
  customer_id: collabCustomerId,
  metadata: {
    seat: {
      role: 'collaborator',
      payer: 'owner',
      displayName: 'Sam',
      ownerCustomerId,
      ownerTripId: tripId,
      inviteId: crypto.randomUUID(),
    },
  },
};

function sqlText(strings) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

const db = async (strings, ...values) => {
  const text = sqlText(strings);
  if (/from transcript_turns/i.test(text) && /where trip_id =/i.test(text)) {
    const key = values.find((v) => v === tripId);
    return transcript.filter((row) => row.trip_id === key).map((row) => ({
      speaker: row.speaker,
      body: row.body,
      channel: row.channel,
      payload: row.payload,
      direction: row.direction,
      received_at: row.received_at,
      sent_at: row.sent_at,
      created_at: row.created_at,
    }));
  }
  if (/from customers/i.test(text) && /where id =/i.test(text)) {
    const id = values.find((v) => v === ownerCustomerId);
    return id ? [{ id, first_name: 'Owner', display_name: 'Owner Ada' }] : [];
  }
  if (/from vacation_collaborators/i.test(text)) return [];
  if (/from trips/i.test(text) && /metadata from trips/i.test(text)) return [{ metadata: {} }];
  if (/^\s*select\b/i.test(text)) return [];
  throw new Error(`unexpected query: ${text.slice(0, 140)}`);
};

async function loadTranscriptAuthorPeople() {
  return authorPeopleFromTrip(
    {
      primary: { id: ownerCustomerId, first_name: 'Owner', display_name: 'Owner Ada' },
      collaborators: [{ id: collabCustomerId, displayName: 'Sam', firstName: 'Sam' }],
    },
    [],
    ownerCustomerId,
  );
}

const turns = await loadTripScopedVacationAppTurns(db, collabSession, tripId, { loadTranscriptAuthorPeople });
const ownerTurn = turns.find((row) => /Owner planning note/i.test(row.body || ''));
const collabTurn = turns.find((row) => /Collaborator follow-up/i.test(row.body || ''));
assert.ok(ownerTurn, 'collaborator session must include owner trip chat turns');
assert.ok(collabTurn, 'collaborator session must include collaborator trip chat turns');
assert.equal(ownerTurn.speaker, 'customer');

console.log('collaborator trip chat visibility tests passed');
