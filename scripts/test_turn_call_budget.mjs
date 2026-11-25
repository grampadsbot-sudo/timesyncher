import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INTAKE_SAMPLE, FOLLOWUP_SAMPLE, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';

const cost10 = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/lopez-cost10-dialog-transcript.redacted.json', import.meta.url), 'utf8'));

function assertOrdinaryBudget(turn, { turnIndex = null } = {}) {
  const { openrouterCalls: rows, openrouterTotals: totals } = turn;
  const chat = rows.filter((row) => row.endpoint === 'chat');
  const jev = rows.filter((row) => row.endpoint === 'decisions');
  const relevance = jev.filter((row) => row.purpose === 'place_relevance_jev');
  assert.ok(chat.length <= 2, turnIndex == null ? 'at most two Haiku chat calls on an ordinary turn' : `turn ${turnIndex} at most two Haiku chat calls`);
  assert.equal(jev.length - relevance.length, 1, turnIndex == null ? 'exactly one Jev decisions call' : `turn ${turnIndex} exactly one Jev decisions call`);
  assert.equal((jev.find((row) => !relevance.includes(row)) || {}).purpose, 'jev_turn');
  assert.ok(rows.every((row) => row.ok));
  assert.ok(totals.byPurpose.jev_turn?.calls === 1 || (jev.length === 1 && jev[0].purpose === 'jev_turn'));
}

await withMockedTurnPipeline(async ({ send, activityUpdates }) => {
  const intake = await send(INTAKE_SAMPLE);
  const text = 'Put the Town Walk on March 4.';
  const ordinary = await send({
    ...FOLLOWUP_SAMPLE,
    text,
    thing: { id: 'fixture-walk', title: 'Town Walk', category: 'activity', location: { lat: 44.05, lng: -121.31 }, metadata: {} },
  });
  for (const turn of [intake, ordinary]) assertOrdinaryBudget(turn);
  assert.ok(activityUpdates.some((row) => row.customerWhen && row.notes.includes(text)), 'post-reply persistence reads the shared activity decision');
  assert.ok(ordinary.turnTag.tags.includes('activities_experiences'), 'the turn tag reads the shared classification');
}, { destination: 'Orlando', owner: 'Sofia', start: '2027-04-05', end: '2027-04-09' });

await withMockedTurnPipeline(async ({ send }) => {
  assert.equal(cost10.turns.length, 10);
  for (const [index, recorded] of cost10.turns.entries()) {
    if (!String(recorded.text || '').trim()) continue;
    const retry = recorded.baseline?.triedRewrite;
    const turn = await send({
      text: recorded.text,
      intake: recorded.intake === true,
      reply: retry ? 'We can keep the days flexible while you work out the details.' : recorded.reply,
      rewrite: retry ? `${recorded.reply}\nWHAT_I_CHANGED: Answered the specific vacation question.` : undefined,
      tags: recorded.tags || [],
    });
    const jevRows = turn.openrouterCalls.filter((row) => row.endpoint === 'decisions' && row.purpose !== 'place_relevance_jev');
    assert.equal(jevRows.filter((row) => row.purpose === 'jev_turn').length, 1, `cost10 turn ${index + 1} jev_turn`);
    assert.ok(jevRows.filter((row) => row.purpose === 'jev_quality_rewrite').length <= 1);
    assert.ok(turn.openrouterCalls.filter((row) => row.endpoint === 'chat').length <= (retry ? 6 : 2), `cost10 turn ${index + 1} chat budget`);
  }
}, { destination: 'Orlando', owner: 'Sofia', start: '2027-04-05', end: '2027-04-09' });

console.log('turn call budget: ok');
