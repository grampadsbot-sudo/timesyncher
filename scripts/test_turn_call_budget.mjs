import assert from 'node:assert/strict';
import fs from 'node:fs';
import { INTAKE_SAMPLE, FOLLOWUP_SAMPLE, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';

const cost10 = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/lopez-cost10-dialog-transcript.redacted.json', import.meta.url), 'utf8'));

function assertOrdinaryBudget(turn, label) {
  const { openrouterCalls: rows, openrouterTotals: totals } = turn;
  const relevance = rows.filter((row) => row.purpose === 'place_relevance_jev');
  assert.deepEqual(rows.filter((row) => row.endpoint === 'chat').map((row) => row.purpose), ['turn_understanding', 'reply_draft'], `${label}: two Haiku chat calls`);
  assert.deepEqual(rows.filter((row) => row.endpoint === 'decisions' && !relevance.includes(row)).map((row) => row.purpose), ['jev_turn'], `${label}: exactly one Jev call`);
  assert.equal(totals.calls, rows.length);
  assert.equal(totals.byPurpose.jev_turn.calls, 1);
  assert.equal(totals.unpricedCalls, 1 + relevance.length);
  assert.ok(rows.every((row) => row.ok));
  return relevance;
}

await withMockedTurnPipeline(async ({ send, activityUpdates }) => {
  const intake = await send(INTAKE_SAMPLE);
  const text = 'Put the Town Walk on March 4.';
  const ordinary = await send({
    ...FOLLOWUP_SAMPLE,
    text,
    thing: { id: 'fixture-walk', title: 'Town Walk', category: 'activity', location: { lat: 44.05, lng: -121.31 }, metadata: {} },
  });
  for (const [turn, isIntake] of [[intake, true], [ordinary, false]]) {
    const relevance = assertOrdinaryBudget(turn, isIntake ? 'intake turn' : 'ordinary turn');
    assert.equal(relevance.length, isIntake ? turn.openrouterTotals.calls - 3 : 0);
  }
  assert.ok(activityUpdates.some((row) => row.customerWhen && row.notes.includes(text)), 'post-reply persistence reads the shared activity decision');
  assert.ok(ordinary.turnTag.tags.includes('activities_experiences'), 'the turn tag reads the shared classification');
});

await withMockedTurnPipeline(async ({ send }) => {
  assert.equal(cost10.turns.length, 10);
  for (const recorded of cost10.turns) {
    const label = `cost10 customer turn ${recorded.turnIndex}`;
    const retry = recorded.baseline.triedRewrite;
    const recordedJev = recorded.openrouterCalls.filter((row) => row.endpoint === 'decisions').map((row) => row.purpose);
    assert.deepEqual(recordedJev.slice(0, 2), ['jev_precall', 'jev_quality'], `${label} recorded two Jev calls before the draft was shipped`);
    const turn = await send({
      text: recorded.text,
      intake: recorded.intake,
      reply: retry ? 'We can keep the days flexible while you work out the details.' : recorded.reply,
      rewrite: retry ? `${recorded.reply}\nWHAT_I_CHANGED: Answered the specific vacation question.` : undefined,
    });
    assert.equal(turn.openrouterTotals.calls, turn.openrouterCalls.length, `${label} totals match the ledger`);
    if (!retry) {
      assertOrdinaryBudget(turn, label);
      continue;
    }
    const jevRows = turn.openrouterCalls.filter((row) => row.endpoint === 'decisions' && row.purpose !== 'place_relevance_jev');
    assert.deepEqual(jevRows.map((row) => row.purpose), ['jev_turn', 'jev_quality_rewrite'], `${label} rewrite adds one Jev re-score`);
    assert.ok(turn.openrouterCalls.filter((row) => row.endpoint === 'chat').length <= 6, `${label} chat budget`);
  }
}, { destination: 'Orlando', owner: 'Sofia', start: '2027-04-05', end: '2027-04-09' });

console.log('turn call budget: ok');
