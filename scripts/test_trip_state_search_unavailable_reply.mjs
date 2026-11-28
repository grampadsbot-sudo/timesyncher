import assert from 'node:assert/strict';
import fs from 'node:fs';
import { finishArtifactReport } from './harness/finish-artifacts.mjs';
import { replyPlaceSearchProviderLeakReason } from '../src/vacation/place-search-reply-facts.mjs';
import { tripStateNeedsRewrite } from '../src/vacation/trip-state-model-context.mjs';
import { finishTripStateRewrite, storedReplyWhenSearchUnavailable } from '../src/vacation/trip-state-live-turn.mjs';

const context = (unavailable) => ({
  pin: { trip_id: 'fixture-trip', revision: 2, digest: 'a', revision_digest: 'a' },
  state: {
    research: {
      provider_unavailable: unavailable,
      key: 'orlando-april',
      state: 'failed',
      turn: 2,
      areas: ['Harbor City'],
      gaps: ['VK place search is unavailable.'],
    },
    saved: { trip: { destination: 'Harbor City', start: '2027-04-05', end: '2027-04-09' } },
  },
});

const pending = (unavailable) => ({
  customerTurn: 'We arrive Monday and leave Friday.',
  draft: 'I placed the park on Monday and saved the hotel.',
  draftModel: 'deepseek/deepseek-v4-flash',
  quality: { judged: true, score: 2, unbackedChangeClaim: true, wantsRewrite: true, disposition: 'rewrite', hardFlag: true },
  jev: { jevRan: false, responseModel: 'deepseek/deepseek-v4-flash', modelTier: 3 },
  model: { called: true, responseModel: 'deepseek/deepseek-v4-flash', modelTier: 3, genLatencyMs: 40 },
  tripStateContext: context(unavailable),
});

const unavailable = await finishTripStateRewrite({ pending: pending(true), env: {}, rules: { ok: true } });
assert.equal(unavailable.reason, null);
assert.match(unavailable.reply, /could not look that up right now/i);
assert.match(unavailable.reply, /Harbor City/);
assert.equal(replyPlaceSearchProviderLeakReason(unavailable.reply), '');
assert.doesNotMatch(unavailable.reply, /VK Search|wake url|HTTP/i);
assert.equal(tripStateNeedsRewrite(unavailable.quality), false);
assert.equal(tripStateNeedsRewrite(unavailable.model.quality), false);
assert.equal(unavailable.model.responseModel, 'deepseek/deepseek-v4-flash');
assert.ok(unavailable.tripStateContext.pin);

const grounded = storedReplyWhenSearchUnavailable({
  jev: { responseModel: 'deepseek/deepseek-v4-flash', modelTier: 3 },
  tripStateContext: context(false),
});
assert.equal(grounded, null);
const dropped = await finishTripStateRewrite({ pending: pending(false), env: {}, rules: { ok: true } });
assert.equal(dropped.reply, null);
assert.ok(dropped.reason);

const runtime = fs.readFileSync(new URL('./harness/runtime.mjs', import.meta.url), 'utf8');
const failure = runtime.slice(runtime.indexOf('if (played.reason)'), runtime.indexOf('const qa = played.qaRating'));
assert.match(failure, /recordStoppedPlay/);
assert.match(failure, /reason: played\.reason/);
const stopped = finishArtifactReport({
  dialogPdf: false,
  keepsakePdf: false,
  screenshotCount: 2,
  turnCount: 3,
  astraJsonTurns: 1,
  timingTurns: 4,
});
assert.equal(stopped.rows.find((row) => row.id === 'screenshots').state, 'present');
assert.equal(stopped.rows.find((row) => row.id === 'admin-turns').state, 'present');
assert.equal(stopped.rows.find((row) => row.id === 'admin-timing-summary').state, 'present');
assert.equal(stopped.complete, false);

console.log('test_trip_state_search_unavailable_reply: ok');
