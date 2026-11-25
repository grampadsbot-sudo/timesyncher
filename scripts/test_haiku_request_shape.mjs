import assert from 'node:assert/strict';
import { INTAKE_SAMPLE, FOLLOWUP_SAMPLE, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';

await withMockedTurnPipeline(async ({ send, captured }) => {
  const first = await send(INTAKE_SAMPLE);
  const second = await send({ ...FOLLOWUP_SAMPLE, tier: 4 });
  const rewritten = await send({
    text: 'Keep Thursday for the town walk.',
    reply: 'Thursday stays open for the neighborhood afternoon.',
    rewrite: 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.\nWHAT_I_CHANGED: Named only the walk from this turn.',
    tier: 3,
  });
  assert.equal(rewritten.openrouterTotals.byPurpose.jev_quality_rewrite?.calls, 1);
  for (const { body, purpose } of captured.filter(({ body }) => /claude-haiku/.test(body.model))) {
    const system = body.messages.find((message) => message.role === 'system');
    assert.deepEqual(body.reasoning, { effort: 'none' });
    assert.deepEqual(system.content[0].cache_control, { type: 'ephemeral' });
    if (purpose === 'reply_draft' || purpose === 'reply_rewrite') assert.ok(body.max_tokens <= 900);
    if (purpose === 'interim_judge') assert.equal(body.max_tokens, 256);
  }
  for (const purpose of ['reply_draft', 'turn_understanding']) {
    const [one, two] = captured.filter((call) => call.purpose === purpose).map(({ body }) => body);
    assert.deepEqual(one.messages[0].content[0], two.messages[0].content[0]);
    assert.notEqual(one.messages.at(-1).content, two.messages.at(-1).content);
    assert.equal(one.prompt_cache_key, two.prompt_cache_key);
  }
  for (const turn of [first, second, rewritten]) {
    assert.ok(turn.openrouterCalls.filter((row) => row.endpoint === 'chat').every((row) => row.reasoningTokens === 0));
  }
  assert.ok(second.openrouterCalls.filter((row) => row.endpoint === 'chat').every((row) => row.cachedTokens > 0));
});
console.log('Haiku request shape: ok');
