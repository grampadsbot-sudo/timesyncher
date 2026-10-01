import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { planFactsForReply, replyRulesSystem } from './vacation-app-reply-rules.mjs';
import {
  onboardingOpenerFacts,
  produceLiveAppReply,
  produceOnboardingOpener,
} from '../src/vacation/live-app-turn.mjs';

const root = new URL('../', import.meta.url);
const live = await readFile(new URL('src/vacation/live-app-turn.mjs', root), 'utf8');
const rules = await readFile(new URL('scripts/vacation-app-reply-rules.mjs', root), 'utf8');
const page = await readFile(new URL('vacation-app.html', root), 'utf8');
const api = await readFile(new URL('routes/vacation-itinerary.mjs', root), 'utf8');

assert.doesNotMatch(live, /ONBOARDING_OPENER_WITH_SITE|ONBOARDING_OPENER_CHAT_ONLY|onboardingOpenerText/);
assert.doesNotMatch(live, /CANNED_APP_REPLY|Got it\. I saved that/);
assert.doesNotMatch(live, /must include the word collaborators/);
assert.doesNotMatch(page, /Your website is not built yet|I can update this vacation from here|Tell me the trip basics/);
assert.doesNotMatch(rules, /View access lets them see the days/);
assert.doesNotMatch(rules, /Say you are building the itinerary/);
assert.doesNotMatch(rules, /State this payer line exactly/);
assert.doesNotMatch(rules, /Single upsell:/);
assert.match(api, /produceOnboardingOpener/);
assert.match(api, /onboarding opener model returned no reply/);
assert.doesNotMatch(api, /onboardingOpenerText|FIXED_OPENER_REASON/);

const postIntake = planFactsForReply({
  postIntake: true,
  upsell: 'allow-once',
  planLine: 'Kimberly $27, paid by you',
  seatDollars: 27,
  planOwned: false,
});
assert.equal(postIntake.mode, 'post-intake');
assert.equal(postIntake.seat_dollars, 27);
assert.equal(postIntake.payer_line, 'Kimberly $27, paid by you');
assert.equal(postIntake.plan_owned, false);
assert.equal(planFactsForReply({ upsell: 'allow-once', priceAsk: true }).mode, 'allow-once');
assert.equal(planFactsForReply({ upsell: 'forbidden', priceAsk: true, planLine: 'Tyler $27, paid by Tyler' }).mode, 'price');
assert.equal(planFactsForReply({ seatDollars: 0 }).seat_dollars, null);

const system = replyRulesSystem({}, '', 'allow-once', true, 'the long trip dump', {
  planLine: 'Kimberly $27, paid by you',
  seatDollars: 27,
  planOwned: true,
});
assert.match(system, /Plan facts: /);
assert.doesNotMatch(system, /View access lets them see the days|State this payer line exactly|Say you are building the itinerary/);
const parsed = JSON.parse(system.slice(system.indexOf('Plan facts: ') + 'Plan facts: '.length).split('\n')[0]);
assert.equal(parsed.mode, 'post-intake');
assert.equal(parsed.payer_line, 'Kimberly $27, paid by you');
assert.equal(parsed.plan_owned, true);
assert.equal(parsed.seat_dollars, 27);

assert.equal(onboardingOpenerFacts({ returning: false }).customer_said, null);
assert.equal(onboardingOpenerFacts({ returning: true, tripTitle: 'Anniversary' }).site_ready, true);

const missedOpener = await produceOnboardingOpener({ returning: false, tripTitle: 'Anniversary', env: {} });
assert.equal(missedOpener.reply, null);
assert.ok(missedOpener.reason);

const missedReply = await produceLiveAppReply({
  customerTurn: 'Where should we eat?',
  session: {},
  priorTurns: [],
  env: { TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '1900' },
});
assert.equal(missedReply.reply, null);
assert.ok(missedReply.reason);
assert.notEqual(missedReply.reply, 'Got it. I saved that');

const openerText = 'Where are you headed, and who is coming?';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  const body = JSON.parse(init.body);
  if (target.includes('/api/alpha/decisions')) {
    return {
      ok: true,
      json: async () => ({
        ok: true,
        answers: {
          model_tier: { score: 0 },
          route_type: { choice: 'general' },
        },
      }),
    };
  }
  if (target.includes('/chat/completions')) {
    const content = body.messages?.[0]?.content || '';
    if (!content.includes('https://trips.example/site')) throw new Error('opener call omitted the site');
    if (!content.includes('"firstName":"Ada"')) throw new Error('opener call omitted the name');
    if (content.includes('Your website is not built yet') || content.includes('I can update this vacation from here')) {
      throw new Error('opener prompt still dictates a fixed welcome');
    }
    return {
      ok: true,
      json: async () => ({
        model: body.model,
        choices: [{ message: { content: `${openerText}\nBEAT: asked for the trip` } }],
      }),
    };
  }
  throw new Error(`unexpected ${target}`);
};

try {
  const produced = await produceOnboardingOpener({
    returning: true,
    tripTitle: 'Anniversary',
    firstName: 'Ada',
    tripSiteUrl: 'https://trips.example/site',
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(produced.reply, openerText);
  assert.equal(produced.reason, null);
  assert.equal(produced.jev?.jevRan, true);

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = JSON.parse(init.body);
    if (target.includes('/api/alpha/decisions')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          answers: { model_tier: { score: 0 }, route_type: { choice: 'general' } },
        }),
      };
    }
    if (target.includes('/chat/completions')) {
      return {
        ok: true,
        json: async () => ({
          model: body.model,
          choices: [{ message: { content: 'BEAT: empty' } }],
        }),
      };
    }
    throw new Error(`unexpected ${target}`);
  };
  const empty = await produceOnboardingOpener({
    returning: false,
    tripSiteUrl: 'https://trips.example/site',
    env: { OPENROUTER_API_KEY: 'test-key' },
  });
  assert.equal(empty.reply, null);
  assert.ok(empty.reason);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('g3a canned dialog passed');
