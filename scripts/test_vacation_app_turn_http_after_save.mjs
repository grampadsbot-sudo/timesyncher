#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  vacationAppItineraryPostStatus,
  vacationAppReplyFailureAfterInTurnSave,
  vacationAppTurnHadInTurnPlaceSave,
} from '../src/vacation/vacation-app-turn-http.mjs';

assert.equal(vacationAppTurnHadInTurnPlaceSave({ placeSearch: { status: 'ok', results: [{ provider: 'brave', providerId: 'x' }] } }), true);
assert.equal(vacationAppTurnHadInTurnPlaceSave({ placeSearch: { status: 'ok', results: [] } }), false);
assert.equal(vacationAppTurnHadInTurnPlaceSave({ ok: false }), false);

assert.equal(vacationAppItineraryPostStatus({ ok: true }, true), 201);
assert.equal(vacationAppItineraryPostStatus({ ok: false }, true), 502);
assert.equal(
  vacationAppItineraryPostStatus({
    ok: false,
    placeSearch: { status: 'ok', results: [{ provider: 'brave', providerId: 'loc1' }] },
  }, true),
  201,
);

const afterSave = vacationAppReplyFailureAfterInTurnSave(
  { requestId: 'req-1', placeSearch: { status: 'ok', results: [{ provider: 'osm', providerId: 'n1' }] } },
  { failureStatus: 'reply_unavailable', replyFailure: 'live dispatcher returned no reply' },
);
assert.equal(afterSave.ok, true);
assert.equal(afterSave.status, 'reply_unavailable');
assert.equal(afterSave.reply, null);
assert.equal(afterSave.replyFailed, true);
assert.match(String(afterSave.error), /no reply/i);

const route = await readFile(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
assert.match(route, /vacationAppItineraryPostStatus\(queued/);

console.log('test_vacation_app_turn_http_after_save: ok');
