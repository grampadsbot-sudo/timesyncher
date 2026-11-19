#!/usr/bin/env node
import assert from 'node:assert/strict';
import { INTERIM_MODEL } from './vacation-app-reply-rules.mjs';
import { interimProblems, liveTranscriptFromRows, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';

const env = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://jev.example/api/alpha/decisions',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
};
const interimUsage = { cost: 0.0002287, prompt_tokens: 1700, completion_tokens: 43, total_tokens: 1743 };

function measured(amount, total) {
  return { cost: amount, prompt_tokens: total - 10, completion_tokens: 10, total_tokens: total };
}

async function produce(templateInterim) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? JSON.parse(init.body) : {};
    const json = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });
    if (href.includes('/api/alpha/decisions')) {
      if (body.questions?.model_tier) {
        return json({ answers: { model_tier: { score: 1 }, route_type: { choice: 'general' } } });
      }
      const low = String(body.state?.draft || '').includes('neighborhood');
      return json({
        answers: {
          overall_quality: { score: low ? 0 : 3 },
          disposition: { choice: low ? 'rewrite' : 'keep' },
          fix_focus: { choice: low ? 'misses_ask' : 'keep' },
        },
      });
    }
    const user = body.messages?.find((message) => message.role === 'user')?.content || '';
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    const model = body.model;
    if (system.includes('"template":boolean')) {
      const verdict = templateInterim ? '{"template":true,"canShip":false}' : '{"template":false,"canShip":false}';
      return json({ model, choices: [{ message: { content: verdict } }] });
    }
    if (system.includes('one or two sentence holding line')) {
      return json({
        model,
        usage: interimUsage,
        choices: [{ message: { content: 'Thursday town walk can wait a moment.\nBEAT: holding the walk' } }],
      });
    }
    if (user.includes('WHAT_I_CHANGED')) {
      return json({
        model,
        usage: measured(0.0001, 120),
        choices: [{ message: { content: 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.\nWHAT_I_CHANGED: Named only the walk from this turn.\nBEAT: named the walk' } }],
      });
    }
    return json({
      model,
      usage: measured(0.0001, 80),
      choices: [{ message: { content: 'Thursday stays open for the neighborhood afternoon.\nBEAT: shaped the day' } }],
    });
  };
  try {
    return await produceLiveAppReply({
      customerTurn: 'Thursday is a town walk.',
      session: { token: 'sess', display_name: 'Noah' },
      priorTurns: [],
      tripTitle: '',
      env,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const produced = await produce(false);
assert.equal(produced.quality.rewritten, true);
assert.equal(produced.reply, 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.');
const interim = produced.log.interimReply;
assert.match(interim.text, /Thursday town walk can wait a moment/);
assert.equal(interim.model, INTERIM_MODEL);
assert.equal(interim.judge.judged, true);
assert.equal(interim.judge.template, false);
assert.equal(interim.judge.canShip, false);
assert.equal(interim.ms > 0, true);
assert.equal(interim.cost.status, 'measured');
assert.equal(interim.cost.source, 'openrouter_usage_cost');
assert.equal(interim.cost.dollars, 0.0002287);
assert.equal(interim.cost.totalTokens, 1743);
assert.equal(produced.log.cost.status, 'measured');
assert.deepEqual(interimProblems([{
  turnIndex: 5,
  role: 'app',
  quality: { rewritten: true },
  interimReply: interim,
}]), []);

const doc = liveTranscriptFromRows({
  session: { token: 'sess', display_name: 'Noah' },
  rows: [{
    body: produced.reply,
    payload: {
      liveTranscript: {
        turnIndex: 5,
        role: 'app',
        text: produced.reply,
        quality: produced.quality,
        interimReply: interim,
        cost: produced.log.cost,
      },
    },
  }],
});
assert.equal(doc.turns[0].interimReply.text, interim.text);
assert.equal(doc.turns[0].interimReply.model, INTERIM_MODEL);
assert.equal(doc.turns[0].interimReply.ms > 0, true);
assert.equal(doc.turns[0].interimReply.judge.canShip, false);
assert.equal(doc.turns[0].cost.status, 'measured');
assert.equal(doc.turns[0].cost.totalTokens > 1743, true);

const template = await produce(true);
assert.equal(template.log.interimReply.text, null);
assert.equal(template.log.interimReply.model, null);
assert.equal(template.log.interimReply.judge, null);
assert.equal(template.log.interimReply.cost.status, 'measured');
assert.match(interimProblems([{
  turnIndex: 5,
  role: 'app',
  quality: { rewritten: true },
  interimReply: template.log.interimReply,
}])[0], /missing an interim/);

console.log('interim reply persisted: ok');
