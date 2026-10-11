#!/usr/bin/env node
import assert from 'node:assert/strict';
import { qualityFromDecisions } from './vacation-app-reply-rules.mjs';
import {
  draftFactErrors,
  formatQualityLine,
  heldRewriteLine,
  produceLiveAppReply,
  sameTierRewriteRequest,
  savedTripFacts,
  upsellFactsForTurn,
} from '../src/vacation/live-app-turn.mjs';

const saved = savedTripFacts({
  start: '2026-07-02',
  end: '2026-07-09',
  things: [
    { title: 'Swim', customerWhen: 'Mon Jul 6' },
    { title: 'Gardens', who: 'Amina', customerWhen: 'Sun Jul 5' },
  ],
  party: {
    primary: { name: 'Noah Ellis' },
    collaborators: [],
    viewers: [{ name: 'Rita Cole' }],
    editors: [],
  },
  planOwned: false,
});
assert.deepEqual(draftFactErrors('Monday July 6 is the beach swim.', saved), []);
assert.equal(draftFactErrors('Tuesday July 7 can hold a morning swim.', saved).some((line) => /swim/i.test(line)), false);
assert.ok(draftFactErrors('The stay is July 2nd to the 6th.', saved).some((line) => /not day 6/.test(line)));
assert.equal(draftFactErrors('The swim is saved for Monday, July 6th, not July 7th.', saved).some((line) => /jul 7/.test(line)), false);

const upsell = upsellFactsForTurn(`${'garden swim groceries dinner family '.repeat(16)}ramble`, { planOwned: false }, true);
assert.equal(upsell.buildingItinerary, true);
assert.deepEqual(upsell.access, ['view', 'edit']);
assert.equal(upsell.planOwned, false);
assert.equal(JSON.stringify(upsell).includes('I am building the itinerary from that now'), false);

const brief = sameTierRewriteRequest({
  customerTurn: 'Thursday is a town walk.',
  draft: 'Thursday stays open.',
  scoreRaw: 0,
  failure: 'a swim on jul 7 was not set by the customer',
});
assert.match(brief.customerTurn, /Thursday stays open/);
assert.match(brief.customerTurn, /Jev score: 0/);
assert.match(brief.customerTurn, /Fact-check flags: a swim on jul 7 was not set by the customer/);
assert.match(brief.customerTurn, /WHAT_I_CHANGED:/);
assert.equal(brief.systemExtra.includes('WHAT_I_CHANGED:'), true);

const scored = qualityFromDecisions({
  answers: {
    overall_quality: { score: 1, text: 'Clear day shape that stays with the customer words.' },
    disposition: { choice: 'rewrite', note: 'Keep the reply.' },
  },
});
assert.equal(scored.jevNote, null);
assert.equal(scored.comment, null);
assert.equal(scored.score, 2);

const env = {
  OPENROUTER_API_KEY: 'test-key',
  TIMESYNCHER_JEV_CLASSIFY_URL: 'https://openrouter.ai/api/alpha/decisions',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900',
};
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ href, body });
  const json = (payload, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => payload,
  });
  if (href.includes('/api/alpha/decisions')) {
    if (body.questions?.model_tier) {
      return json({ answers: { model_tier: { score: 1 }, route_type: { choice: 'general' } } });
    }
    assert.match(body.questions.overall_quality.instructions, /Return a score only/);
    assert.doesNotMatch(body.questions.overall_quality.instructions, /one-line reason|text field/);
    const draft = String(body.state?.draft || '');
    const low = draft.includes('neighborhood');
    return json({
      answers: {
        overall_quality: { score: low ? 0 : 3, text: 'this note must be dropped' },
        disposition: { choice: low ? 'rewrite' : 'keep' },
        fix_focus: { choice: low ? 'misses_ask' : 'keep' },
      },
    });
  }
  if (href.includes('/chat/completions')) {
    const user = body.messages?.find((message) => message.role === 'user')?.content || '';
    const model = body.model;
    if (model === 'deepseek/deepseek-v4-flash') {
      const system = body.messages?.find((message) => message.role === 'system')?.content || '';
      if (/"template"/.test(system) && /canShip/.test(system)) {
        return json({
          model,
          choices: [{ message: { content: '{"template":false,"canShip":true}' } }],
        });
      }
      return json({
        model,
        choices: [{ message: { content: 'Thursday town walk can wait a moment.\nBEAT: holding the walk' } }],
      });
    }
    if (user.includes('WHAT_I_CHANGED')) {
      assert.match(user, /Jev score:/);
      assert.match(user, /Fact-check flags:/);
      assert.match(user, /neighborhood/);
      const held = user.includes('HOLD');
      const reply = held
        ? 'Thursday stays open for the neighborhood afternoon.'
        : 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.';
      return json({
        model,
        choices: [{ message: { content: `${reply}\nWHAT_I_CHANGED: Named only the walk from this turn.\nBEAT: named the walk` } }],
      });
    }
    const high = user.includes('SCORE HIGH');
    const draft = high
      ? 'Thursday stays a town walk.'
      : 'Thursday stays open for the neighborhood afternoon.';
    return json({ model, choices: [{ message: { content: `${draft}\nBEAT: shaped the day` } }] });
  }
  return json({ error: 'unexpected url' }, 404);
};

try {
  const low = await produceLiveAppReply({
    customerTurn: 'Thursday is a town walk. SCORE LOW.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env,
  });
  assert.equal(low.reply, 'The walk you named for Thursday can stay, and the rest of that day stays unscheduled.');
  assert.equal(low.quality.jevNote, null);
  assert.equal(low.quality.comment, null);
  assert.equal(low.log.jevNote, null);
  assert.equal(low.log.rewriterChange, 'Named only the walk from this turn.');
  assert.equal(low.log.draftModel, 'qwen/qwen3-235b-a22b-2507');
  assert.equal(low.log.rewriteModel, low.log.draftModel);
  assert.equal(low.log.interimReply.model, 'deepseek/deepseek-v4-flash');
  assert.match(low.log.interimReply.text, /Thursday town walk/);
  const rewriteCall = calls.find((call) => String(call.body?.messages?.find((message) => message.role === 'user')?.content || '').includes('WHAT_I_CHANGED'));
  assert.equal(rewriteCall.body.model, 'qwen/qwen3-235b-a22b-2507');

  calls.length = 0;
  const held = await produceLiveAppReply({
    customerTurn: 'Thursday is a town walk. SCORE LOW HOLD.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env,
  });
  assert.equal(held.reply, 'Thursday stays open for the neighborhood afternoon.');
  assert.equal(held.log.held, true);
  assert.equal(held.quality.rewritten, false);
  assert.equal(held.quality.jevNote, null);
  const audit = `${formatQualityLine(held.quality)} · ${heldRewriteLine({
    held: held.log.held,
    quality: held.quality,
    rewriteText: held.log.rewriteText,
    rewriteFailReason: held.log.rewriteFailReason,
    rewriteAttempts: held.log.rewriteAttempts,
  })}`;
  assert.match(audit, /^quality: 1 · rewrite drafted, held: /);
  assert.equal(held.log.interimReply.model, 'deepseek/deepseek-v4-flash');

  calls.length = 0;
  const high = await produceLiveAppReply({
    customerTurn: 'Thursday is a town walk. SCORE HIGH.',
    session: { token: 'sess', display_name: 'Noah' },
    priorTurns: [],
    tripTitle: '',
    env,
  });
  assert.equal(high.reply, 'Thursday stays a town walk.');
  assert.equal(high.log.interimReply.text, null);
  assert.equal(high.log.rewriteModel, null);
  assert.equal(high.quality.jevNote, null);
  assert.equal(calls.some((call) => {
    if (call.body?.model !== 'deepseek/deepseek-v4-flash') return false;
    const system = String(call.body?.messages?.find((message) => message.role === 'system')?.content || '');
    return !/reply none/.test(system) && !/Do not write a customer reply/.test(system);
  }), false);
  assert.equal(calls.some((call) => String(call.body?.model || '').includes('gpt')), false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('g2d jev score rewrite: ok');
