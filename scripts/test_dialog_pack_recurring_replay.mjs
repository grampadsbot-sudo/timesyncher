#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDialogPack, loadBarTerms } from './dialog-bars.mjs';
import { commitShippedRewrite, persistVacationAppOutboundReply } from '../src/vacation/reply-ship.mjs';

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/dialog-wording-replay/recurring-turns.redacted.json', import.meta.url), 'utf8'),
);
const terms = loadBarTerms();
const TRIP = { id: 'trip-replay', title: 'Orlando vacation', destination: 'Orlando', start_date: '2027-04-05', end_date: '2027-04-09', status: 'planning', metadata: {} };
const SESSION = { id: 'sess-replay', token: 'tok-replay', customer_id: 'cust-replay', first_name: 'Sofia', last_name: 'Lopez', display_name: 'Sofia Lopez', metadata: {} };
const HOOKS = { recordCustomerThingNotes: async () => [], publishIntakeShare: async () => {} };
const QUALITY = { judged: true, score: 4 };

function makeDb() {
  const stored = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (/insert into transcript_turns/i.test(sql)) {
      stored.push(values[3]);
      return [];
    }
    if (/select id, title, destination/i.test(sql) && /from trips/i.test(sql)) return [TRIP];
    return [];
  };
  return { db, stored };
}

function packFor(items) {
  const pack = [];
  for (const [index, item] of items.entries()) {
    pack.push({ n: index * 2 + 1, speaker: 'Sofia Lopez', speaker_id: 'guest', channel: 'customer', text: item.customerTurn });
    pack.push({ n: index * 2 + 2, speaker: 'app', speaker_id: 'app', channel: 'app', text: item.text, in_reply_to: index * 2 + 1 });
  }
  return pack;
}

async function shipFirstReply(fixture) {
  const { db, stored } = makeDb();
  const shipped = await persistVacationAppOutboundReply({
    db,
    transcriptOwnerId: 'cust-replay',
    tripId: TRIP.id,
    requestId: `req-${fixture.id}`,
    jobId: `job-${fixture.id}`,
    produced: { reply: fixture.modelReply, jev: { jevRan: true }, model: { quality: QUALITY }, rules: { ok: true } },
    base: { requestId: `req-${fixture.id}` },
    exchangeLatency: 1000,
    sessionE2eMs: 2000,
    customerTurnIndex: fixture.turn - 1,
    speakerName: 'Sofia Lopez',
    seat: null,
    classification: { ok: true, roster: [] },
    jobFields: { destination: 'Orlando', title: 'Orlando vacation', wantedThings: [] },
    firstIntake: fixture.firstIntake,
    requestText: fixture.customerTurn,
    intakeThings: [],
    customerTurnId: null,
    vacationAppTripSummary: (row) => row,
    ...HOOKS,
  });
  assert.equal(shipped.ok, true, fixture.id);
  assert.equal(stored.length, 1, fixture.id);
  assert.equal(stored[0], shipped.reply, fixture.id);
  return shipped.reply;
}

async function shipRewrite(fixture) {
  const { db, stored } = makeDb();
  const pending = { tripId: TRIP.id, requestId: `req-rw-${fixture.id}`, customerTurnIndex: fixture.turn - 1, customerTurn: fixture.customerTurn, speakerName: 'Sofia Lopez' };
  const shipped = await commitShippedRewrite(db, SESSION, pending, { reply: fixture.modelReply, model: { quality: QUALITY }, rules: { ok: true } }, HOOKS);
  assert.equal(shipped.ok, true, `${fixture.id}: ${JSON.stringify(shipped)}`);
  assert.equal(stored.length, 1, fixture.id);
  assert.equal(stored[0], shipped.reply, fixture.id);
  return shipped.reply;
}

assert.equal(fixtures.length >= 19, true);
for (const label of ['cost10-turn-3', 'cost10-turn-7', 'lopez-r9-turn-3', 'lopez-r8-turn-3', 'lopez-r7-turn-3']) {
  assert.ok(fixtures.some((fixture) => fixture.id === label), label);
}
const leak = /https?:|www\.|\/shared\/|@[\w-]+\.\w|tok-|sessionToken/i;
for (const fixture of fixtures) {
  assert.doesNotMatch(`${fixture.customerTurn}\n${fixture.modelReply}`, leak, `${fixture.id} is not redacted`);
}

const recorded = checkDialogPack(packFor(fixtures.map((fixture) => ({ ...fixture, text: fixture.modelReply }))), terms);
const recordedBars = new Set(recorded.hits.map((hit) => hit.bar));
assert.equal(recorded.ok, false, 'recorded turns must still fail before the ship path');
assert.deepEqual([...recordedBars].sort(), ['BAR-RESERVATION-PAYMENT', 'BAR-UNLIMITED-WORDING']);
assert.equal(recorded.hits.length >= fixtures.length, true, JSON.stringify(recorded.hits));

const shippedFirst = [];
const shippedRewrite = [];
for (const fixture of fixtures) {
  shippedFirst.push({ ...fixture, text: await shipFirstReply(fixture) });
  if (!fixture.firstIntake) shippedRewrite.push({ ...fixture, text: await shipRewrite(fixture) });
}
for (const [label, items] of [['persistVacationAppOutboundReply', shippedFirst], ['commitShippedRewrite', shippedRewrite]]) {
  const checked = checkDialogPack(packFor(items), terms);
  assert.deepEqual(checked.hits, [], `${label}: ${JSON.stringify(checked.hits, null, 2)}`);
  assert.equal(checked.ok, true, label);
  for (const item of items) assert.doesNotMatch(item.text, /\bcheckout\b/i, `${label} ${item.id}`);
}
for (const item of shippedFirst.filter((entry) => entry.firstIntake)) {
  assert.match(item.text, /covers the family's vacations for the whole year/, item.id);
}

console.log(`test_dialog_pack_recurring_replay: ok (${fixtures.length} recorded turns, ${recorded.hits.length} hits before, 0 after)`);
