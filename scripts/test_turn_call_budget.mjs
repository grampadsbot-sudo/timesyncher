import assert from 'node:assert/strict';
import { INTAKE_SAMPLE, FOLLOWUP_SAMPLE, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';

await withMockedTurnPipeline(async ({ send, activityUpdates }) => {
  const intake = await send(INTAKE_SAMPLE);
  const text = 'Put the Town Walk on March 4.';
  const ordinary = await send({
    ...FOLLOWUP_SAMPLE,
    text,
    thing: { id: 'fixture-walk', title: 'Town Walk', category: 'activity', location: { lat: 44.05, lng: -121.31 }, metadata: {} },
  });
  for (const [turn, isIntake] of [[intake, true], [ordinary, false]]) {
    const { openrouterCalls: rows, openrouterTotals: totals } = turn;
    const relevance = rows.filter((row) => row.purpose === 'place_relevance_jev');
    assert.equal(relevance.length, isIntake ? totals.calls - 4 : 0);
    assert.deepEqual(rows.filter((row) => row.endpoint === 'chat').map((row) => row.purpose), ['turn_understanding', 'reply_draft']);
    assert.deepEqual(rows.filter((row) => row.endpoint === 'decisions' && !relevance.includes(row)).map((row) => row.purpose), ['jev_precall', 'jev_quality']);
    assert.equal(totals.unpricedCalls, 2 + relevance.length);
    assert.ok(rows.every((row) => row.ok));
  }
  assert.ok(activityUpdates.some((row) => row.customerWhen && row.notes.includes(text)), 'post-reply persistence reads the shared activity decision');
  assert.ok(ordinary.turnTag.tags.includes('activities_experiences'), 'the turn tag reads the shared classification');
});
console.log('turn call budget: ok');
