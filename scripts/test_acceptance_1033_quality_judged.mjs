#!/usr/bin/env node
import assert from 'node:assert/strict';
import { INTERIM_MODEL } from './vacation-app-reply-rules.mjs';
import { produceFirstIntakeReply } from '../src/vacation/first-intake-reply.mjs';
import { LIVE_REPLY_PRODUCER, liveTurnRecord, produceLiveAppReply } from '../src/vacation/live-app-turn.mjs';
import { produceNoTripStarterReply } from '../src/vacation/no-trip-starter-reply.mjs';

const HILO = 'We are planning a short Hilo stay from March 4 to March 8 2027. Keep the days light.';
const FOLLOW = 'Add a quiet morning walk and keep the afternoon open.';
const FIRST_REPLY = 'Avery, I am building a light Hilo stay from March 4 to March 8, 2027. Who is coming with you?';
const FOLLOW_REPLY = 'Thursday morning can be a quiet walk, and the afternoon stays open. Does that pace work?';
const env = { OPENROUTER_API_KEY: 'test-key', TIMESYNCHER_SINGLE_NAME: 'TimeSyncher Vacation Single', TIMESYNCHER_UNLIMITED_NAME: 'TimeSyncher Vacation Year' };

function decisions(body, { failQuality = false, timeoutQuality = false } = {}) {
  if (body.questions?.overall_quality) {
    if (timeoutQuality) {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    if (failQuality) return { ok: false, status: 503, json: async () => ({ error: { message: 'quality judge down' } }) };
    return { ok: true, json: async () => ({ ok: true, answers: { overall_quality: { score: 4 }, disposition: { choice: 'keep' }, fix_focus: { choice: 'keep' } } }) };
  }
  return { ok: true, json: async () => ({ ok: true, answers: { model_tier: { score: 1 }, route_type: { choice: 'general' } } }) };
}

function install(replies, { failQuality = false, timeoutQuality = false } = {}) {
  let chat = 0;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const body = init?.body ? JSON.parse(init.body) : {};
    if (target.includes('/api/alpha/decisions')) return decisions(body, { failQuality, timeoutQuality });
    if (target.includes('/chat/completions')) {
      const content = replies[chat] || replies[replies.length - 1];
      chat += 1;
      return { ok: true, json: async () => ({ model: body.model, choices: [{ message: { content } }] }) };
    }
    throw new Error('unexpected model host');
  };
}

function stored(text, model) {
  const turn = liveTurnRecord({
    turnIndex: 3,
    role: 'app',
    modality: 'text',
    text,
    at: '2026-11-18T23:55:00.000Z',
    latencyMs: 1200,
    sessionE2eMs: 4000,
    jev: { jevRan: true, modelTier: 1, jevLatencyMs: 165, jevBeforeModel: true, responseModel: INTERIM_MODEL },
    model,
  });
  assert.equal(turn.replyProducer, LIVE_REPLY_PRODUCER);
  assert.equal(turn.fixedOpener, false);
  assert.equal(turn.quality.judged, true);
  assert.equal(turn.modelId, INTERIM_MODEL);
  return turn;
}

install([FIRST_REPLY]);
const first = await produceFirstIntakeReply({
  customerTurn: HILO,
  session: { first_name: 'Avery' },
  env,
  rules: { ok: true },
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
});
assert.equal(first.reason, null);
assert.equal(first.quality.judged, true);
assert.equal(Number.isFinite(first.quality.judgeMs), true);
assert.equal(first.model.log.latencyMs.jevDraft, first.quality.judgeMs);
stored(first.reply, first.model);

install([FOLLOW_REPLY]);
const second = await produceLiveAppReply({
  customerTurn: FOLLOW,
  intake: false,
  priorTurns: [{ role: 'customer', text: HILO, intake: true }],
  session: { first_name: 'Avery', trip_id: 'throwaway-trip' },
  tripTitle: 'Hilo',
  env,
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
  extractedDestination: 'Hilo',
});
assert.equal(second.reason, null, second.reason || '');
assert.equal(second.quality?.judged === true || second.model?.quality?.judged === true, true);
stored(second.reply, second.model?.quality?.judged === true ? second.model : { ...second.model, quality: second.quality });

install([FIRST_REPLY], { failQuality: true });
const refused = await produceFirstIntakeReply({
  customerTurn: HILO,
  session: { first_name: 'Avery' },
  env,
  rules: { ok: true },
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
});
assert.equal(refused.reply, null);
assert.match(refused.reason, /quality judge down|quality_not_judged/);
assert.notEqual(refused.quality?.judged, true);

install(['Where are you headed, and what dates work for you?']);
const greeting = await produceNoTripStarterReply({
  customerTurn: 'hi',
  session: { first_name: 'Avery' },
  env,
  rules: { ok: true },
  loadOwnerPlan: async () => ({ checkout_plan: 'single', plan_id: 'plan-single', plan_name: 'TimeSyncher Vacation Single' }),
});
assert.equal(greeting.reason, null);
assert.equal(greeting.quality.judged, true);
stored(greeting.reply, greeting.model);

install([FIRST_REPLY], { timeoutQuality: true });
const timedOut = await produceFirstIntakeReply({
  customerTurn: HILO,
  session: { first_name: 'Avery' },
  env,
  rules: { ok: true },
  extractedDestination: 'Hilo',
  savedStart: '2027-03-04',
  savedEnd: '2027-03-08',
});
assert.equal(timedOut.reply, null);
assert.match(timedOut.reason, /timeout|aborted/i);
assert.notEqual(timedOut.quality?.judged, true);

const renderer = await import('node:fs').then((fs) => fs.readFileSync(new URL('./live-transcript-dialog-pdf.mjs', import.meta.url), 'utf8'));
assert.match(renderer, /quality\?\.judged !== true/);

console.log('test_acceptance_1033_quality_judged: ok');
