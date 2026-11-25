import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HAIKU_PRICING, withMockedTurnPipeline } from './fixtures/harness/turn-call-replay.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/harness/lopez-r9-cost-replay.redacted.json', import.meta.url), 'utf8'));
assert.equal(fixture.turns.length, 10);
assert.equal(Number(fixture.turns.reduce((sum, turn) => sum + turn.baseline.replyUsd, 0).toFixed(8)), fixture.preChangeReplySubtotalUsd);

function replayUsage({ body, purpose, content, index }, baseline) {
  // r9 records aggregate generation usage. Keep the per-generation share of its input
  // and bound the reported completion by the request's output budget.
  const generations = baseline.triedRewrite ? 2 : 1;
  const prompt = purpose === 'reply_interim' ? baseline.interimPromptTokens
    : Math.ceil((baseline.promptTokens - baseline.interimPromptTokens) / generations);
  const completion = purpose === 'reply_interim' ? baseline.interimCompletionTokens
    : Math.ceil((baseline.completionTokens - baseline.interimCompletionTokens) / generations);
  const isReply = purpose.startsWith('reply_');
  const promptTokens = isReply && prompt > 0 ? prompt : Math.ceil(JSON.stringify(body).length / 4);
  const completionTokens = isReply && completion > 0 ? completion : Math.ceil(content.length / 4);
  const cachedTokens = index > 1 && purpose !== 'interim_judge' ? Math.min(512, promptTokens) : 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: Math.min(body.max_tokens || completionTokens, completionTokens),
    prompt_tokens_details: { cached_tokens: cachedTokens },
    completion_tokens_details: { reasoning_tokens: 0 },
  };
}

const costs = [];
let unpricedCalls = 0;
let chatCalls = 0;
await withMockedTurnPipeline(async ({ send }) => {
  for (const [index, recorded] of fixture.turns.entries()) {
    const retry = recorded.baseline.triedRewrite;
    const result = await send({
      ...recorded,
      reply: retry ? 'We can keep the days flexible while you work out the details.' : recorded.reply,
      rewrite: retry ? `${recorded.reply}\nWHAT_I_CHANGED: Answered the specific vacation question.` : undefined,
      usage: (sample) => replayUsage(sample, recorded.baseline),
    });
    const { openrouterCalls: rows, openrouterTotals: totals } = result;
    assert.equal(totals.measuredUsd, 0, 'using listed prices for the mocked usage');
    assert.ok(totals.estimatedUsd > 0 && totals.estimatedUsd < 0.0025, `turn ${index + 1} costs ${totals.estimatedUsd}`);
    assert.equal(totals.unpricedCalls, rows.filter((row) => row.endpoint === 'decisions').length);
    assert.equal(totals.byPurpose.reply_rewrite?.calls || 0, Number(retry));
    const chat = rows.filter((row) => row.endpoint === 'chat');
    assert.ok(chat.every((row) => row.reasoningTokens === 0));
    assert.ok(chat.length <= recorded.baseline.replay.chatCalls);
    assert.equal(totals.unpricedCalls, recorded.baseline.replay.unpricedCalls - 1);
    if (index > 0) assert.ok(chat.some((row) => row.cachedTokens > 0));
    const expected = chat.reduce((usd, row) => usd
      + (row.promptTokens - row.cachedTokens) * Number(HAIKU_PRICING.prompt)
      + row.cachedTokens * Number(HAIKU_PRICING.input_cache_read)
      + row.completionTokens * Number(HAIKU_PRICING.completion), 0);
    assert.ok(Math.abs(totals.estimatedUsd - expected) < 1e-8);
    costs.push(totals.estimatedUsd);
    unpricedCalls += totals.unpricedCalls;
    chatCalls += chat.length;
  }
}, { destination: 'Orlando', owner: 'Sofia', start: '2027-04-05', end: '2027-04-09' });
const average = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
const baselineAverage = fixture.preChangeReplySubtotalUsd / costs.length;
assert.ok(average < baselineAverage, `replay ${average} should beat the recorded reply subtotal ${baselineAverage}`);
const baseReplay = fixture.turns.reduce((totals, { baseline: { replay } }) => ({
  estimatedUsd: totals.estimatedUsd + replay.estimatedUsd,
  unpricedCalls: totals.unpricedCalls + replay.unpricedCalls,
  chatCalls: totals.chatCalls + replay.chatCalls,
}), { estimatedUsd: 0, unpricedCalls: 0, chatCalls: 0 });
const baseReplayAverage = baseReplay.estimatedUsd / costs.length;
assert.ok(average < baseReplayAverage);
assert.ok(chatCalls < baseReplay.chatCalls);
console.log(JSON.stringify({
  turns: costs.length, measuredUsd: 0, estimatedUsdPerTurn: average, unpricedCalls, chatCalls,
  baselineRecordedReplyUsdPerTurn: baselineAverage, baselineReplayEstimatedUsdPerTurn: baseReplayAverage,
  baselineReplayUnpricedCalls: baseReplay.unpricedCalls, baselineReplayChatCalls: baseReplay.chatCalls,
}));
